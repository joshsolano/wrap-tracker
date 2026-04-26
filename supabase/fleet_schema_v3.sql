-- ============================================================
-- Fleet Schema V3: Backend Enforcement
-- Apply in Supabase SQL Editor after fleet_schema_v2.sql
-- Idempotent: safe to re-run
-- ============================================================

-- ── 1. VIN format constraint ──────────────────────────────────────────────────
-- NOT VALID: skips scan of existing rows so production data isn't blocked.
-- New inserts (including imports) are validated immediately.
ALTER TABLE fleet_vehicles DROP CONSTRAINT IF EXISTS fleet_vehicles_vin_format;
ALTER TABLE fleet_vehicles
  ADD CONSTRAINT fleet_vehicles_vin_format
  CHECK (vin ~ '^[A-HJ-NPR-Z0-9]{17}$') NOT VALID;

-- ── 2. Photo upload_state: add 'replaced' ────────────────────────────────────
-- Drop the V2 inline check and recreate with 'replaced' included.
ALTER TABLE fleet_vehicle_photos
  DROP CONSTRAINT IF EXISTS fleet_vehicle_photos_upload_state_check;
ALTER TABLE fleet_vehicle_photos
  ADD CONSTRAINT fleet_vehicle_photos_upload_state_check
  CHECK (upload_state IN ('pending', 'complete', 'failed', 'replaced'));

-- ── 3. Photo slot uniqueness ──────────────────────────────────────────────────
-- One 'complete' photo per (vehicle, slot). before_damage is excluded because
-- multiple damage photos are allowed per vehicle.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_photos_slot_unique
  ON fleet_vehicle_photos(vehicle_id, photo_type)
  WHERE upload_state = 'complete' AND photo_type != 'before_damage';

-- ── 4. fleet_job_id on audit logs ─────────────────────────────────────────────
ALTER TABLE fleet_vehicle_audit_logs
  ADD COLUMN IF NOT EXISTS fleet_job_id uuid REFERENCES fleet_jobs(id);
CREATE INDEX IF NOT EXISTS fleet_audit_job_idx
  ON fleet_vehicle_audit_logs(fleet_job_id);

-- ── 5. Audit trigger: include fleet_job_id in vehicle status/flag changes ─────
CREATE OR REPLACE FUNCTION fleet_vehicle_audit_fn() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.flagged IS DISTINCT FROM OLD.flagged
     OR NEW.flag_reason IS DISTINCT FROM OLD.flag_reason THEN
    INSERT INTO fleet_vehicle_audit_logs(
      vehicle_id, fleet_job_id, fleet_user_id, action_type, previous_state, new_state
    ) VALUES (
      NEW.id,
      NEW.fleet_job_id,
      fleet_current_fleet_user_id(),
      CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_change' ELSE 'flag_change' END,
      jsonb_build_object(
        'status', OLD.status, 'flagged', OLD.flagged,
        'flag_reason', OLD.flag_reason, 'version', OLD.version
      ),
      jsonb_build_object(
        'status', NEW.status, 'flagged', NEW.flagged,
        'flag_reason', NEW.flag_reason, 'version', NEW.version
      )
    );
  END IF;
  RETURN NEW;
END; $$;

-- ── 6. Photo audit trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fleet_photo_audit_fn() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO fleet_vehicle_audit_logs(
      vehicle_id, fleet_job_id, fleet_user_id, action_type, metadata
    ) VALUES (
      NEW.vehicle_id, NEW.fleet_job_id, fleet_current_fleet_user_id(),
      'photo_upload',
      jsonb_build_object(
        'photo_id', NEW.id, 'photo_type', NEW.photo_type,
        'storage_path', NEW.storage_path, 'upload_state', NEW.upload_state
      )
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.upload_state IS DISTINCT FROM OLD.upload_state THEN
    INSERT INTO fleet_vehicle_audit_logs(
      vehicle_id, fleet_job_id, fleet_user_id, action_type, metadata
    ) VALUES (
      NEW.vehicle_id, NEW.fleet_job_id, fleet_current_fleet_user_id(),
      'photo_state_change',
      jsonb_build_object(
        'photo_id', NEW.id, 'photo_type', NEW.photo_type,
        'from', OLD.upload_state, 'to', NEW.upload_state
      )
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS fleet_photo_audit ON fleet_vehicle_photos;
CREATE TRIGGER fleet_photo_audit
  AFTER INSERT OR UPDATE ON fleet_vehicle_photos
  FOR EACH ROW EXECUTE FUNCTION fleet_photo_audit_fn();

-- ── 7. State machine: override escape hatch + photo enforcement ───────────────
-- Changes from V2:
--   • Reads fleet.override_transition session var — 'true' bypasses all checks.
--     Only fleet_manager_override_status sets this.
--   • Enforces required before photos before 'ready_for_install'.
--   • Enforces required after photos before 'install_complete'.
--   • Adds 'completed->flagged' and 'not_started->flagged' transitions.
CREATE OR REPLACE FUNCTION fleet_validate_transition() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  t        text    := OLD.status || '->' || NEW.status;
  v_missing text[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  -- Manager override: set by fleet_manager_override_status, clears itself after UPDATE
  IF current_setting('fleet.override_transition', true) = 'true' THEN RETURN NEW; END IF;

  -- DB-level photo requirement: can't reach ready_for_install without before photos
  IF t IN ('removing->ready_for_install', 'not_started->ready_for_install',
           'removal_complete->ready_for_install') THEN
    SELECT array_agg(pt) INTO v_missing
    FROM unnest(ARRAY['before_front','before_driver','before_passenger','before_rear']::text[]) pt
    WHERE NOT EXISTS (
      SELECT 1 FROM fleet_vehicle_photos
      WHERE vehicle_id = NEW.id AND photo_type = pt AND upload_state = 'complete'
    );
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'Missing required before photos: %', array_to_string(v_missing, ', ')
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- DB-level photo requirement: can't mark install_complete without after photos
  IF NEW.status = 'install_complete' THEN
    SELECT array_agg(pt) INTO v_missing
    FROM unnest(ARRAY['after_front','after_driver','after_passenger','after_rear',
                      'vin_sticker','tire_size']::text[]) pt
    WHERE NOT EXISTS (
      SELECT 1 FROM fleet_vehicle_photos
      WHERE vehicle_id = NEW.id AND photo_type = pt AND upload_state = 'complete'
    );
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'Missing required after photos: %', array_to_string(v_missing, ', ')
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Transition allowlist
  IF t NOT IN (
    -- Forward flow
    'not_started->removing',
    'not_started->ready_for_install',
    'removing->ready_for_install',
    'removal_complete->ready_for_install',
    'ready_for_install->installing',
    'ready_for_install->install_complete',
    'installing->install_complete',
    'install_complete->qc',
    'install_complete->completed',
    'qc->completed',
    -- Backward / corrections
    'removing->not_started',
    'ready_for_install->removing',
    'ready_for_install->removal_complete',
    'installing->ready_for_install',
    'install_complete->installing',
    'qc->install_complete',
    'completed->qc',
    'completed->ready_for_install',
    -- Flag from any active state
    'not_started->flagged',
    'removing->flagged',
    'ready_for_install->flagged',
    'installing->flagged',
    'install_complete->flagged',
    'qc->flagged',
    'completed->flagged',
    -- Unflag to a valid state
    'flagged->not_started',
    'flagged->removing',
    'flagged->ready_for_install',
    'flagged->install_complete',
    'flagged->qc'
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END; $$;

-- Trigger already exists from V2 — recreated above via CREATE OR REPLACE FUNCTION.
-- Re-drop and recreate the trigger to pick up the new function body:
DROP TRIGGER IF EXISTS fleet_vehicle_transition ON fleet_vehicles;
CREATE TRIGGER fleet_vehicle_transition
  BEFORE UPDATE OF status ON fleet_vehicles
  FOR EACH ROW EXECUTE FUNCTION fleet_validate_transition();

-- ── 8. Tighter RLS on fleet_vehicles ─────────────────────────────────────────
-- Workers (remover/installer/qc) can no longer do direct UPDATE on fleet_vehicles.
-- They must use the SECURITY DEFINER RPCs below.
-- Admins and managers retain direct UPDATE access for corrections.
DROP POLICY IF EXISTS "v2_fleet_vehicles_update" ON fleet_vehicles;
DROP POLICY IF EXISTS "v3_fleet_vehicles_update" ON fleet_vehicles;
CREATE POLICY "v3_fleet_vehicles_update" ON fleet_vehicles FOR UPDATE TO authenticated
  USING  (fleet_current_role() IN ('admin', 'manager'))
  WITH CHECK (fleet_current_role() IN ('admin', 'manager'));

-- Add photo UPDATE policy (was missing in V2 — required by upload_state transitions)
DROP POLICY IF EXISTS "v2_fleet_photos_update" ON fleet_vehicle_photos;
CREATE POLICY "v2_fleet_photos_update" ON fleet_vehicle_photos FOR UPDATE TO authenticated
  USING  (fleet_current_role() IS NOT NULL)
  WITH CHECK (fleet_current_role() IS NOT NULL);

-- ── 9. RPC: fleet_complete_photo_upload ──────────────────────────────────────
-- Atomically marks the old 'complete' photo for the same slot as 'replaced',
-- then marks this photo 'complete'. Enforces one active photo per slot.
-- before_damage slots are exempt (multiple damage photos allowed).
CREATE OR REPLACE FUNCTION fleet_complete_photo_upload(p_photo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role  text := fleet_current_role();
  v_photo fleet_vehicle_photos%ROWTYPE;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'Permission denied'; END IF;

  SELECT * INTO v_photo FROM fleet_vehicle_photos WHERE id = p_photo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Photo not found: %', p_photo_id; END IF;
  IF v_photo.upload_state != 'pending' THEN
    RAISE EXCEPTION 'Photo is not pending (current state: %)', v_photo.upload_state;
  END IF;

  IF v_photo.photo_type != 'before_damage' THEN
    UPDATE fleet_vehicle_photos
    SET upload_state = 'replaced'
    WHERE vehicle_id  = v_photo.vehicle_id
      AND photo_type  = v_photo.photo_type
      AND upload_state = 'complete'
      AND id != p_photo_id;
  END IF;

  UPDATE fleet_vehicle_photos SET upload_state = 'complete' WHERE id = p_photo_id;

  RETURN jsonb_build_object('photo_id', p_photo_id, 'photo_type', v_photo.photo_type);
END; $$;

-- ── 10. RPC: fleet_validate_import ───────────────────────────────────────────
-- Returns all validation errors without inserting anything.
-- Call this before fleet_import_vehicles to show errors to the user.
CREATE OR REPLACE FUNCTION fleet_validate_import(p_job_id uuid, p_vehicles jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v         jsonb;
  idx       integer := 0;
  errors    jsonb   := '[]'::jsonb;
  vin_norm  text;
  seen_vins text[]  := '{}';
BEGIN
  IF fleet_current_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Permission denied: manager role required';
  END IF;

  FOR v IN SELECT * FROM jsonb_array_elements(p_vehicles) LOOP
    vin_norm := upper(trim(v->>'vin'));

    IF vin_norm IS NULL OR vin_norm = '' THEN
      errors := errors || jsonb_build_object('row', idx, 'vin', v->>'vin', 'error', 'VIN is required');
    ELSIF vin_norm !~ '^[A-HJ-NPR-Z0-9]{17}$' THEN
      errors := errors || jsonb_build_object('row', idx, 'vin', vin_norm,
                  'error', 'Invalid VIN (must be 17 uppercase chars, no I/O/Q)');
    ELSIF vin_norm = ANY(seen_vins) THEN
      errors := errors || jsonb_build_object('row', idx, 'vin', vin_norm,
                  'error', 'Duplicate VIN in import file');
    ELSIF EXISTS (
      SELECT 1 FROM fleet_vehicles WHERE fleet_job_id = p_job_id AND vin = vin_norm
    ) THEN
      errors := errors || jsonb_build_object('row', idx, 'vin', vin_norm,
                  'error', 'VIN already exists in this job');
    END IF;

    IF vin_norm IS NOT NULL AND vin_norm != '' THEN
      seen_vins := seen_vins || vin_norm;
    END IF;
    idx := idx + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'errors', errors,
    'valid',  (jsonb_array_length(errors) = 0)
  );
END; $$;

-- ── 11. Updated fleet_import_vehicles: all-or-nothing ────────────────────────
-- Validates the entire batch first. If any row fails, nothing is inserted.
CREATE OR REPLACE FUNCTION fleet_import_vehicles(p_job_id uuid, p_vehicles jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v          jsonb;
  v_check    jsonb;
  inserted   integer := 0;
  vin_norm   text;
  v_id       uuid;
  v_ids      uuid[]  := '{}';
  v_user_id  uuid    := fleet_current_fleet_user_id();
BEGIN
  IF fleet_current_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Permission denied: manager role required';
  END IF;

  -- Validate the whole batch before touching the DB
  v_check := fleet_validate_import(p_job_id, p_vehicles);
  IF NOT (v_check->>'valid')::boolean THEN
    RETURN jsonb_build_object(
      'inserted', 0, 'skipped', 0,
      'errors', v_check->'errors', 'rejected', true
    );
  END IF;

  -- All rows are valid — insert with no per-row exception handling (atomic)
  FOR v IN SELECT * FROM jsonb_array_elements(p_vehicles) LOOP
    vin_norm := upper(trim(v->>'vin'));
    INSERT INTO fleet_vehicles(
      fleet_job_id, vin, unit_number, year, make, model,
      vehicle_type, department, location, notes, status
    ) VALUES (
      p_job_id, vin_norm,
      nullif(trim(v->>'unit_number'), ''),
      nullif(trim(v->>'year'),        ''),
      nullif(trim(v->>'make'),        ''),
      nullif(trim(v->>'model'),       ''),
      nullif(trim(v->>'vehicle_type'),''),
      nullif(trim(v->>'department'),  ''),
      nullif(trim(v->>'location'),    ''),
      nullif(trim(v->>'notes'),       ''),
      'not_started'
    ) RETURNING id INTO v_id;
    v_ids    := v_ids || v_id;
    inserted := inserted + 1;
  END LOOP;

  -- One audit entry per imported vehicle, keyed by the IDs we just collected
  INSERT INTO fleet_vehicle_audit_logs(vehicle_id, fleet_job_id, fleet_user_id, action_type, metadata)
  SELECT id, p_job_id, v_user_id, 'import',
         jsonb_build_object('batch_size', inserted)
  FROM fleet_vehicles
  WHERE id = ANY(v_ids);

  RETURN jsonb_build_object(
    'inserted', inserted, 'skipped', 0,
    'errors', '[]'::jsonb, 'rejected', false
  );
END; $$;

-- ── 12. Workflow RPCs ─────────────────────────────────────────────────────────
-- Workers call these instead of direct UPDATE on fleet_vehicles.
-- All are SECURITY DEFINER to bypass the tightened RLS.

-- ─── fleet_start_removal ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fleet_start_removal(
  p_vehicle_id   uuid,
  p_job_id       uuid,
  p_operation_id uuid    DEFAULT NULL,
  p_version      integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid    := fleet_current_fleet_user_id();
  v_role    text    := fleet_current_role();
  v_active  fleet_vehicle_time_logs%ROWTYPE;
  v_log     fleet_vehicle_time_logs%ROWTYPE;
  v_op_id   uuid    := COALESCE(p_operation_id, gen_random_uuid());
  v_updated integer;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'Permission denied'; END IF;

  -- Resume: return existing active log (handles refresh after network drop)
  SELECT * INTO v_active FROM fleet_vehicle_time_logs
  WHERE vehicle_id = p_vehicle_id AND log_type = 'removal' AND end_ts IS NULL;
  IF FOUND THEN
    IF v_active.fleet_user_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'Vehicle removal is already in progress by another user'
        USING ERRCODE = 'P0005';
    END IF;
    RETURN jsonb_build_object('log', row_to_json(v_active), 'resumed', true);
  END IF;

  INSERT INTO fleet_vehicle_time_logs(vehicle_id, fleet_user_id, log_type, start_ts, operation_id)
  VALUES (p_vehicle_id, v_user_id, 'removal', now(), v_op_id)
  RETURNING * INTO v_log;

  IF p_version IS NOT NULL THEN
    UPDATE fleet_vehicles SET status = 'removing'
    WHERE id = p_vehicle_id AND version = p_version;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Version conflict — vehicle was updated by another user'
        USING ERRCODE = 'P0003';
    END IF;
  ELSE
    UPDATE fleet_vehicles SET status = 'removing' WHERE id = p_vehicle_id;
  END IF;

  INSERT INTO fleet_vehicle_audit_logs(vehicle_id, fleet_job_id, fleet_user_id, action_type, metadata)
  VALUES (p_vehicle_id, p_job_id, v_user_id, 'timer_start',
          jsonb_build_object('log_type', 'removal', 'log_id', v_log.id));

  RETURN jsonb_build_object('log', row_to_json(v_log), 'resumed', false);
END; $$;

-- ─── fleet_stop_removal ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fleet_stop_removal(p_vehicle_id uuid, p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid        := fleet_current_fleet_user_id();
  v_role    text        := fleet_current_role();
  v_now     timestamptz := now();
  v_log_id  uuid;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'Permission denied'; END IF;

  UPDATE fleet_vehicle_time_logs SET end_ts = v_now
  WHERE vehicle_id = p_vehicle_id AND log_type = 'removal' AND end_ts IS NULL
  RETURNING id INTO v_log_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'No active removal timer for vehicle %', p_vehicle_id; END IF;

  INSERT INTO fleet_vehicle_audit_logs(vehicle_id, fleet_job_id, fleet_user_id, action_type, metadata)
  VALUES (p_vehicle_id, p_job_id, v_user_id, 'timer_stop',
          jsonb_build_object('log_type', 'removal', 'log_id', v_log_id, 'end_ts', v_now));

  RETURN jsonb_build_object('log_id', v_log_id, 'end_ts', v_now);
END; $$;

-- ─── fleet_mark_removal_complete ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fleet_mark_removal_complete(
  p_vehicle_id uuid,
  p_job_id     uuid,
  p_notes      text    DEFAULT NULL,
  p_version    integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := fleet_current_fleet_user_id();
  v_role    text := fleet_current_role();
  v_missing text[];
  v_updated integer;
  v_log_id  uuid;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'Permission denied'; END IF;

  SELECT array_agg(pt) INTO v_missing
  FROM unnest(ARRAY['before_front','before_driver','before_passenger','before_rear']::text[]) pt
  WHERE NOT EXISTS (
    SELECT 1 FROM fleet_vehicle_photos
    WHERE vehicle_id = p_vehicle_id AND photo_type = pt AND upload_state = 'complete'
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing required before photos: %', array_to_string(v_missing, ', ')
      USING ERRCODE = 'P0002';
  END IF;

  IF p_version IS NOT NULL THEN
    UPDATE fleet_vehicles SET status = 'ready_for_install'
    WHERE id = p_vehicle_id AND version = p_version;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Version conflict — vehicle was updated by another user'
        USING ERRCODE = 'P0003';
    END IF;
  ELSE
    UPDATE fleet_vehicles SET status = 'ready_for_install' WHERE id = p_vehicle_id;
  END IF;

  UPDATE fleet_vehicle_time_logs SET notes = p_notes
  WHERE id = (
    SELECT id FROM fleet_vehicle_time_logs
    WHERE vehicle_id = p_vehicle_id AND log_type = 'removal'
    ORDER BY created_at DESC LIMIT 1
  )
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object('status', 'ready_for_install', 'log_id', v_log_id);
END; $$;

-- ─── fleet_start_install ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fleet_start_install(
  p_vehicle_id   uuid,
  p_job_id       uuid,
  p_operation_id uuid    DEFAULT NULL,
  p_version      integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid    := fleet_current_fleet_user_id();
  v_role    text    := fleet_current_role();
  v_active  fleet_vehicle_time_logs%ROWTYPE;
  v_log     fleet_vehicle_time_logs%ROWTYPE;
  v_op_id   uuid    := COALESCE(p_operation_id, gen_random_uuid());
  v_updated integer;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'Permission denied'; END IF;

  -- Block if removal is still in progress
  IF EXISTS (
    SELECT 1 FROM fleet_vehicle_time_logs
    WHERE vehicle_id = p_vehicle_id AND log_type = 'removal' AND end_ts IS NULL
  ) THEN
    RAISE EXCEPTION 'Removal timer is still running — stop it before starting install'
      USING ERRCODE = 'P0004';
  END IF;

  SELECT * INTO v_active FROM fleet_vehicle_time_logs
  WHERE vehicle_id = p_vehicle_id AND log_type = 'install' AND end_ts IS NULL;
  IF FOUND THEN
    IF v_active.fleet_user_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'Vehicle install is already in progress by another user'
        USING ERRCODE = 'P0005';
    END IF;
    RETURN jsonb_build_object('log', row_to_json(v_active), 'resumed', true);
  END IF;

  INSERT INTO fleet_vehicle_time_logs(vehicle_id, fleet_user_id, log_type, start_ts, operation_id)
  VALUES (p_vehicle_id, v_user_id, 'install', now(), v_op_id)
  RETURNING * INTO v_log;

  IF p_version IS NOT NULL THEN
    UPDATE fleet_vehicles SET status = 'installing'
    WHERE id = p_vehicle_id AND version = p_version;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Version conflict — vehicle was updated by another user'
        USING ERRCODE = 'P0003';
    END IF;
  ELSE
    UPDATE fleet_vehicles SET status = 'installing' WHERE id = p_vehicle_id;
  END IF;

  INSERT INTO fleet_vehicle_audit_logs(vehicle_id, fleet_job_id, fleet_user_id, action_type, metadata)
  VALUES (p_vehicle_id, p_job_id, v_user_id, 'timer_start',
          jsonb_build_object('log_type', 'install', 'log_id', v_log.id));

  RETURN jsonb_build_object('log', row_to_json(v_log), 'resumed', false);
END; $$;

-- ─── fleet_stop_install ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fleet_stop_install(p_vehicle_id uuid, p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid        := fleet_current_fleet_user_id();
  v_role    text        := fleet_current_role();
  v_now     timestamptz := now();
  v_log_id  uuid;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'Permission denied'; END IF;

  UPDATE fleet_vehicle_time_logs SET end_ts = v_now
  WHERE vehicle_id = p_vehicle_id AND log_type = 'install' AND end_ts IS NULL
  RETURNING id INTO v_log_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'No active install timer for vehicle %', p_vehicle_id; END IF;

  INSERT INTO fleet_vehicle_audit_logs(vehicle_id, fleet_job_id, fleet_user_id, action_type, metadata)
  VALUES (p_vehicle_id, p_job_id, v_user_id, 'timer_stop',
          jsonb_build_object('log_type', 'install', 'log_id', v_log_id, 'end_ts', v_now));

  RETURN jsonb_build_object('log_id', v_log_id, 'end_ts', v_now);
END; $$;

-- ─── fleet_mark_install_complete ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fleet_mark_install_complete(
  p_vehicle_id uuid,
  p_job_id     uuid,
  p_notes      text    DEFAULT NULL,
  p_version    integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := fleet_current_fleet_user_id();
  v_role    text := fleet_current_role();
  v_missing text[];
  v_updated integer;
  v_log_id  uuid;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'Permission denied'; END IF;

  SELECT array_agg(pt) INTO v_missing
  FROM unnest(ARRAY['after_front','after_driver','after_passenger','after_rear',
                    'vin_sticker','tire_size']::text[]) pt
  WHERE NOT EXISTS (
    SELECT 1 FROM fleet_vehicle_photos
    WHERE vehicle_id = p_vehicle_id AND photo_type = pt AND upload_state = 'complete'
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing required after photos: %', array_to_string(v_missing, ', ')
      USING ERRCODE = 'P0002';
  END IF;

  IF p_version IS NOT NULL THEN
    UPDATE fleet_vehicles SET status = 'install_complete'
    WHERE id = p_vehicle_id AND version = p_version;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Version conflict — vehicle was updated by another user'
        USING ERRCODE = 'P0003';
    END IF;
  ELSE
    UPDATE fleet_vehicles SET status = 'install_complete' WHERE id = p_vehicle_id;
  END IF;

  UPDATE fleet_vehicle_time_logs SET notes = p_notes
  WHERE id = (
    SELECT id FROM fleet_vehicle_time_logs
    WHERE vehicle_id = p_vehicle_id AND log_type = 'install'
    ORDER BY created_at DESC LIMIT 1
  )
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object('status', 'install_complete', 'log_id', v_log_id);
END; $$;

-- ─── fleet_submit_qc_approval ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fleet_submit_qc_approval(
  p_vehicle_id uuid,
  p_job_id     uuid,
  p_version    integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid    := fleet_current_fleet_user_id();
  v_role    text    := fleet_current_role();
  v_missing text[];
  v_updated integer;
BEGIN
  IF v_role NOT IN ('qc', 'manager', 'admin') THEN
    RAISE EXCEPTION 'Permission denied: QC role required';
  END IF;

  -- No active install timer allowed at approval time
  IF EXISTS (
    SELECT 1 FROM fleet_vehicle_time_logs
    WHERE vehicle_id = p_vehicle_id AND log_type = 'install' AND end_ts IS NULL
  ) THEN
    RAISE EXCEPTION 'Install timer is still running — stop it before QC approval'
      USING ERRCODE = 'P0004';
  END IF;

  -- All required after photos must be present and complete
  SELECT array_agg(pt) INTO v_missing
  FROM unnest(ARRAY['after_front','after_driver','after_passenger','after_rear',
                    'vin_sticker','tire_size']::text[]) pt
  WHERE NOT EXISTS (
    SELECT 1 FROM fleet_vehicle_photos
    WHERE vehicle_id = p_vehicle_id AND photo_type = pt AND upload_state = 'complete'
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing required photos for QC approval: %', array_to_string(v_missing, ', ')
      USING ERRCODE = 'P0002';
  END IF;

  IF p_version IS NOT NULL THEN
    UPDATE fleet_vehicles SET status = 'completed'
    WHERE id = p_vehicle_id AND version = p_version;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Version conflict — vehicle was updated by another user'
        USING ERRCODE = 'P0003';
    END IF;
  ELSE
    UPDATE fleet_vehicles SET status = 'completed' WHERE id = p_vehicle_id;
  END IF;

  INSERT INTO fleet_vehicle_audit_logs(vehicle_id, fleet_job_id, fleet_user_id, action_type, metadata)
  VALUES (p_vehicle_id, p_job_id, v_user_id, 'qc_approved',
          jsonb_build_object('approved_by_role', v_role));

  RETURN jsonb_build_object('status', 'completed');
END; $$;

-- ─── fleet_flag_vehicle ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fleet_flag_vehicle(
  p_vehicle_id uuid,
  p_job_id     uuid,
  p_reason     text,
  p_version    integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid    := fleet_current_fleet_user_id();
  v_role    text    := fleet_current_role();
  v_updated integer;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Flag reason is required';
  END IF;

  IF p_version IS NOT NULL THEN
    UPDATE fleet_vehicles
    SET flagged = true, flag_reason = p_reason, status = 'flagged'
    WHERE id = p_vehicle_id AND version = p_version;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Version conflict — vehicle was updated by another user'
        USING ERRCODE = 'P0003';
    END IF;
  ELSE
    UPDATE fleet_vehicles
    SET flagged = true, flag_reason = p_reason, status = 'flagged'
    WHERE id = p_vehicle_id;
  END IF;

  INSERT INTO fleet_vehicle_audit_logs(vehicle_id, fleet_job_id, fleet_user_id, action_type, metadata)
  VALUES (p_vehicle_id, p_job_id, v_user_id, 'vehicle_flagged',
          jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('flagged', true);
END; $$;

-- ─── fleet_manager_override_status ──────────────────────────────────────────
-- Sets fleet.override_transition = 'true' for the duration of the UPDATE so
-- the state machine trigger allows any transition. Requires a reason.
CREATE OR REPLACE FUNCTION fleet_manager_override_status(
  p_vehicle_id uuid,
  p_job_id     uuid,
  p_new_status text,
  p_reason     text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    uuid := fleet_current_fleet_user_id();
  v_role       text := fleet_current_role();
  v_old_status text;
BEGIN
  IF v_role NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'Permission denied: manager role required';
  END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Override reason is required';
  END IF;
  IF p_new_status NOT IN (
    'not_started','removing','removal_complete','ready_for_install',
    'installing','install_complete','qc','completed','flagged'
  ) THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  SELECT status INTO v_old_status FROM fleet_vehicles WHERE id = p_vehicle_id;

  PERFORM set_config('fleet.override_transition', 'true', false);
  UPDATE fleet_vehicles SET status = p_new_status WHERE id = p_vehicle_id;
  PERFORM set_config('fleet.override_transition', 'false', false);

  INSERT INTO fleet_vehicle_audit_logs(vehicle_id, fleet_job_id, fleet_user_id, action_type, metadata)
  VALUES (p_vehicle_id, p_job_id, v_user_id, 'manager_override',
          jsonb_build_object(
            'from',   v_old_status,
            'to',     p_new_status,
            'reason', p_reason
          ));

  RETURN jsonb_build_object('status', p_new_status, 'overridden_from', v_old_status);
END; $$;

-- ── 13. RPC: fleet_validate_job_complete ─────────────────────────────────────
-- Returns a summary of what's blocking job completion.
-- Callable by any active fleet user; managers use it on the job dashboard.
CREATE OR REPLACE FUNCTION fleet_validate_job_complete(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role      text    := fleet_current_role();
  v_total     integer;
  v_completed integer;
  v_blocking  jsonb;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'Permission denied'; END IF;

  SELECT count(*) INTO v_total     FROM fleet_vehicles WHERE fleet_job_id = p_job_id;
  SELECT count(*) INTO v_completed FROM fleet_vehicles WHERE fleet_job_id = p_job_id AND status = 'completed';

  SELECT jsonb_agg(jsonb_build_object(
    'vehicle_id',   v.id,
    'vin',          v.vin,
    'unit',         v.unit_number,
    'status',       v.status,
    'active_timer', (
      SELECT t.log_type FROM fleet_vehicle_time_logs t
      WHERE t.vehicle_id = v.id AND t.end_ts IS NULL
      LIMIT 1
    )
  )) INTO v_blocking
  FROM fleet_vehicles v
  WHERE v.fleet_job_id = p_job_id AND v.status != 'completed';

  RETURN jsonb_build_object(
    'job_id',    p_job_id,
    'total',     v_total,
    'completed', v_completed,
    'ready',     (v_total = v_completed AND v_total > 0),
    'blocking',  COALESCE(v_blocking, '[]'::jsonb)
  );
END; $$;

-- ── 14. RPC: fleet_validate_daily_export ─────────────────────────────────────
-- Summarizes activity and readiness for a single calendar date.
-- active_timers covers the entire job (a running clock anywhere blocks export).
-- missing_photos is scoped to vehicles that were actually worked on that day.
CREATE OR REPLACE FUNCTION fleet_validate_daily_export(p_job_id uuid, p_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role           text    := fleet_current_role();
  v_removed        integer;
  v_installed      integer;
  v_completed      integer;
  v_flagged        integer;
  v_active_timers  jsonb;
  v_missing_photos jsonb;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'Permission denied'; END IF;

  SELECT count(DISTINCT t.vehicle_id) INTO v_removed
  FROM fleet_vehicle_time_logs t
  JOIN fleet_vehicles v ON v.id = t.vehicle_id
  WHERE v.fleet_job_id = p_job_id AND t.log_type = 'removal' AND t.start_ts::date = p_date;

  SELECT count(DISTINCT t.vehicle_id) INTO v_installed
  FROM fleet_vehicle_time_logs t
  JOIN fleet_vehicles v ON v.id = t.vehicle_id
  WHERE v.fleet_job_id = p_job_id AND t.log_type = 'install' AND t.start_ts::date = p_date;

  SELECT count(DISTINCT t.vehicle_id) INTO v_completed
  FROM fleet_vehicle_time_logs t
  JOIN fleet_vehicles v ON v.id = t.vehicle_id
  WHERE v.fleet_job_id = p_job_id AND t.start_ts::date = p_date AND v.status = 'completed';

  SELECT count(DISTINCT t.vehicle_id) INTO v_flagged
  FROM fleet_vehicle_time_logs t
  JOIN fleet_vehicles v ON v.id = t.vehicle_id
  WHERE v.fleet_job_id = p_job_id AND t.start_ts::date = p_date AND v.flagged = true;

  SELECT jsonb_agg(jsonb_build_object(
    'vehicle_id', v.id, 'vin', v.vin, 'unit', v.unit_number,
    'log_type', t.log_type, 'started', t.start_ts
  )) INTO v_active_timers
  FROM fleet_vehicle_time_logs t
  JOIN fleet_vehicles v ON v.id = t.vehicle_id
  WHERE v.fleet_job_id = p_job_id AND t.end_ts IS NULL;

  -- Vehicles worked today that are missing photos required for their current stage
  SELECT jsonb_agg(jsonb_build_object(
    'vehicle_id',    v.id, 'vin', v.vin, 'unit', v.unit_number,
    'status',        v.status,
    'missing_photos', v.missing_arr
  )) INTO v_missing_photos
  FROM (
    SELECT v2.*,
      ARRAY(
        SELECT pt FROM unnest(
          CASE WHEN v2.status IN ('ready_for_install','installing','install_complete','qc','completed')
               THEN ARRAY['before_front','before_driver','before_passenger','before_rear']
               ELSE ARRAY[]::text[] END
          ||
          CASE WHEN v2.status IN ('install_complete','qc','completed')
               THEN ARRAY['after_front','after_driver','after_passenger','after_rear','vin_sticker','tire_size']
               ELSE ARRAY[]::text[] END
        ) AS pt
        WHERE NOT EXISTS (
          SELECT 1 FROM fleet_vehicle_photos p
          WHERE p.vehicle_id = v2.id AND p.photo_type = pt AND p.upload_state = 'complete'
        )
      ) AS missing_arr
    FROM (
      SELECT DISTINCT ON (v3.id) v3.*
      FROM fleet_vehicle_time_logs t3
      JOIN fleet_vehicles v3 ON v3.id = t3.vehicle_id
      WHERE v3.fleet_job_id = p_job_id AND t3.start_ts::date = p_date
    ) v2
  ) v
  WHERE array_length(v.missing_arr, 1) > 0;

  RETURN jsonb_build_object(
    'date',            p_date,
    'job_id',          p_job_id,
    'removed_today',   v_removed,
    'installed_today', v_installed,
    'completed_today', v_completed,
    'flagged_today',   v_flagged,
    'active_timers',   COALESCE(v_active_timers,  '[]'::jsonb),
    'missing_photos',  COALESCE(v_missing_photos, '[]'::jsonb),
    'ready_to_export', v_active_timers IS NULL AND v_missing_photos IS NULL
  );
END; $$;

-- ── 15. RPC: fleet_validate_final_export ─────────────────────────────────────
-- Full-fleet readiness check. ready_to_export requires every vehicle completed,
-- no active timers, no missing photos, and no flagged vehicles.
CREATE OR REPLACE FUNCTION fleet_validate_final_export(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role           text    := fleet_current_role();
  v_total          integer;
  v_completed      integer;
  v_flagged        integer;
  v_incomplete     jsonb;
  v_active_timers  jsonb;
  v_missing_photos jsonb;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'Permission denied'; END IF;

  SELECT count(*) INTO v_total     FROM fleet_vehicles WHERE fleet_job_id = p_job_id;
  SELECT count(*) INTO v_completed FROM fleet_vehicles WHERE fleet_job_id = p_job_id AND status = 'completed';
  SELECT count(*) INTO v_flagged   FROM fleet_vehicles WHERE fleet_job_id = p_job_id AND flagged = true;

  SELECT jsonb_agg(jsonb_build_object(
    'vehicle_id', id, 'vin', vin, 'unit', unit_number, 'status', status
  )) INTO v_incomplete
  FROM fleet_vehicles
  WHERE fleet_job_id = p_job_id AND status != 'completed';

  SELECT jsonb_agg(jsonb_build_object(
    'vehicle_id', v.id, 'vin', v.vin, 'unit', v.unit_number,
    'log_type', t.log_type, 'started', t.start_ts
  )) INTO v_active_timers
  FROM fleet_vehicle_time_logs t
  JOIN fleet_vehicles v ON v.id = t.vehicle_id
  WHERE v.fleet_job_id = p_job_id AND t.end_ts IS NULL;

  -- All vehicles with missing required photos for their current stage
  SELECT jsonb_agg(jsonb_build_object(
    'vehicle_id',     v.id, 'vin', v.vin, 'unit', v.unit_number,
    'status',         v.status,
    'missing_photos', v.missing_arr
  )) INTO v_missing_photos
  FROM (
    SELECT v2.*,
      ARRAY(
        SELECT pt FROM unnest(
          CASE WHEN v2.status IN ('ready_for_install','installing','install_complete','qc','completed')
               THEN ARRAY['before_front','before_driver','before_passenger','before_rear']
               ELSE ARRAY[]::text[] END
          ||
          CASE WHEN v2.status IN ('install_complete','qc','completed')
               THEN ARRAY['after_front','after_driver','after_passenger','after_rear','vin_sticker','tire_size']
               ELSE ARRAY[]::text[] END
        ) AS pt
        WHERE NOT EXISTS (
          SELECT 1 FROM fleet_vehicle_photos p
          WHERE p.vehicle_id = v2.id AND p.photo_type = pt AND p.upload_state = 'complete'
        )
      ) AS missing_arr
    FROM fleet_vehicles v2
    WHERE v2.fleet_job_id = p_job_id
  ) v
  WHERE array_length(v.missing_arr, 1) > 0;

  RETURN jsonb_build_object(
    'job_id',          p_job_id,
    'total',           v_total,
    'completed',       v_completed,
    'flagged',         v_flagged,
    'incomplete',      COALESCE(v_incomplete,     '[]'::jsonb),
    'active_timers',   COALESCE(v_active_timers,  '[]'::jsonb),
    'missing_photos',  COALESCE(v_missing_photos, '[]'::jsonb),
    'ready_to_export', v_total = v_completed
                       AND v_total > 0
                       AND v_active_timers   IS NULL
                       AND v_missing_photos  IS NULL
                       AND v_flagged         = 0
  );
END; $$;

-- ── Verification queries ──────────────────────────────────────────────────────
-- Run these after applying V3 to confirm everything landed:

-- 1. VIN constraint:
--    SELECT conname, consrc FROM pg_constraint WHERE conname = 'fleet_vehicles_vin_format';

-- 2. Photo slot index:
--    SELECT indexname FROM pg_indexes WHERE indexname = 'fleet_photos_slot_unique';

-- 3. audit_logs has fleet_job_id:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'fleet_vehicle_audit_logs' AND column_name = 'fleet_job_id';

-- 4. RLS policies (should show v3_fleet_vehicles_update, v2_fleet_photos_update):
--    SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('fleet_vehicles','fleet_vehicle_photos');

-- 5. RPCs exist:
--    SELECT routine_name FROM information_schema.routines
--    WHERE routine_name LIKE 'fleet_%' AND routine_type = 'FUNCTION'
--    ORDER BY routine_name;
