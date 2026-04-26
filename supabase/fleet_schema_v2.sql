-- ============================================================
-- Fleet Schema V2: Hardening Migration
-- Apply in Supabase SQL Editor after fleet_schema.sql
-- Idempotent: safe to re-run
-- ============================================================

-- ── 0. Helper: get current fleet user role without RLS recursion ──────────────
CREATE OR REPLACE FUNCTION fleet_current_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM fleet_users WHERE user_id = auth.uid() AND active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fleet_current_fleet_user_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM fleet_users WHERE user_id = auth.uid() AND active = true LIMIT 1;
$$;

-- ── 1. Optimistic locking: version column on fleet_vehicles ──────────────────
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION fleet_bump_version() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.version := OLD.version + 1; RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS fleet_vehicle_version ON fleet_vehicles;
CREATE TRIGGER fleet_vehicle_version
  BEFORE UPDATE ON fleet_vehicles
  FOR EACH ROW EXECUTE FUNCTION fleet_bump_version();

-- ── 2. Idempotency key on time logs ──────────────────────────────────────────
ALTER TABLE fleet_vehicle_time_logs ADD COLUMN IF NOT EXISTS operation_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_time_logs_op_id_idx
  ON fleet_vehicle_time_logs(operation_id) WHERE operation_id IS NOT NULL;

-- ── 3. One active timer per vehicle per log_type ─────────────────────────────
-- Prevents duplicate time logs from concurrent taps or network retries.
-- Second insert with end_ts IS NULL for same vehicle+log_type raises 23505.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_time_logs_active_idx
  ON fleet_vehicle_time_logs(vehicle_id, log_type)
  WHERE end_ts IS NULL;

-- ── 4. Photo upload state tracking ───────────────────────────────────────────
ALTER TABLE fleet_vehicle_photos
  ADD COLUMN IF NOT EXISTS upload_state text NOT NULL DEFAULT 'complete'
  CHECK (upload_state IN ('pending', 'complete', 'failed'));

-- ── 5. Audit log table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_vehicle_audit_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid        NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  fleet_user_id uuid        REFERENCES fleet_users(id),
  action_type   text        NOT NULL,
  previous_state jsonb,
  new_state      jsonb,
  metadata       jsonb,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_audit_vehicle_idx ON fleet_vehicle_audit_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS fleet_audit_created_idx ON fleet_vehicle_audit_logs(created_at DESC);

ALTER TABLE fleet_vehicle_audit_logs ENABLE ROW LEVEL SECURITY;
-- Trigger inserts bypass RLS (SECURITY DEFINER), reads restricted to managers+
CREATE POLICY "fleet_audit_read" ON fleet_vehicle_audit_logs FOR SELECT TO authenticated
  USING (fleet_current_role() IN ('admin', 'manager'));
CREATE POLICY "fleet_audit_insert" ON fleet_vehicle_audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- ── 6. Audit trigger: status + flag changes on fleet_vehicles ────────────────
CREATE OR REPLACE FUNCTION fleet_vehicle_audit_fn() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.flagged IS DISTINCT FROM OLD.flagged
     OR NEW.flag_reason IS DISTINCT FROM OLD.flag_reason THEN
    INSERT INTO fleet_vehicle_audit_logs(
      vehicle_id, fleet_user_id, action_type, previous_state, new_state
    ) VALUES (
      NEW.id,
      fleet_current_fleet_user_id(),
      CASE
        WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_change'
        ELSE 'flag_change'
      END,
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

DROP TRIGGER IF EXISTS fleet_vehicle_audit ON fleet_vehicles;
CREATE TRIGGER fleet_vehicle_audit
  AFTER UPDATE ON fleet_vehicles
  FOR EACH ROW EXECUTE FUNCTION fleet_vehicle_audit_fn();

-- ── 7. State machine: enforce valid status transitions ────────────────────────
-- Rejects any transition not on the explicit allowlist.
-- Manager overrides (e.g. reopening completed jobs) are included.
CREATE OR REPLACE FUNCTION fleet_validate_transition() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  t text := OLD.status || '->' || NEW.status;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF t NOT IN (
    -- ── Forward flow ──
    'not_started->removing',
    'not_started->ready_for_install',        -- mark removal complete without timer
    'removing->ready_for_install',            -- mark removal complete
    'removal_complete->ready_for_install',    -- legacy status support
    'ready_for_install->installing',          -- start install
    'ready_for_install->install_complete',    -- mark install complete without timer
    'installing->install_complete',           -- mark install complete
    'install_complete->qc',                   -- move to QC queue
    'install_complete->completed',            -- direct QC approve
    'qc->completed',                          -- QC approved
    -- ── Backward / corrections ──
    'removing->not_started',
    'ready_for_install->removing',
    'ready_for_install->removal_complete',
    'installing->ready_for_install',
    'install_complete->installing',
    'qc->install_complete',
    'completed->qc',
    'completed->ready_for_install',
    -- ── Flag ──
    'removing->flagged',
    'ready_for_install->flagged',
    'installing->flagged',
    'install_complete->flagged',
    'qc->flagged',
    -- ── Unflag / recovery ──
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

DROP TRIGGER IF EXISTS fleet_vehicle_transition ON fleet_vehicles;
CREATE TRIGGER fleet_vehicle_transition
  BEFORE UPDATE OF status ON fleet_vehicles
  FOR EACH ROW EXECUTE FUNCTION fleet_validate_transition();

-- ── 8. Atomic bulk import (replaces client-side array insert) ─────────────────
-- Normalizes VINs, skips duplicates, returns counts.
-- SECURITY DEFINER so it can insert with manager-level permission.
CREATE OR REPLACE FUNCTION fleet_import_vehicles(p_job_id uuid, p_vehicles jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v             jsonb;
  inserted      integer := 0;
  skipped       integer := 0;
  errs          jsonb   := '[]'::jsonb;
  caller_role   text    := fleet_current_role();
BEGIN
  -- Only managers and admins may import
  IF caller_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Permission denied: manager role required';
  END IF;

  FOR v IN SELECT * FROM jsonb_array_elements(p_vehicles) LOOP
    BEGIN
      INSERT INTO fleet_vehicles(
        fleet_job_id, vin, unit_number, year, make, model,
        vehicle_type, department, location, notes, status
      ) VALUES (
        p_job_id,
        upper(trim(v->>'vin')),
        nullif(trim(v->>'unit_number'), ''),
        nullif(trim(v->>'year'), ''),
        nullif(trim(v->>'make'), ''),
        nullif(trim(v->>'model'), ''),
        nullif(trim(v->>'vehicle_type'), ''),
        nullif(trim(v->>'department'), ''),
        nullif(trim(v->>'location'), ''),
        nullif(trim(v->>'notes'), ''),
        'not_started'
      );
      inserted := inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      skipped := skipped + 1;
      errs := errs || jsonb_build_object('vin', v->>'vin', 'error', 'Duplicate VIN');
    END;
  END LOOP;

  RETURN jsonb_build_object('inserted', inserted, 'skipped', skipped, 'errors', errs);
END; $$;

-- ── 9. Role-based RLS (replaces permissive policies) ─────────────────────────
-- Drop existing permissive policies
DROP POLICY IF EXISTS "fleet_users_auth"    ON fleet_users;
DROP POLICY IF EXISTS "fleet_jobs_auth"     ON fleet_jobs;
DROP POLICY IF EXISTS "fleet_vehicles_auth" ON fleet_vehicles;
DROP POLICY IF EXISTS "fleet_photos_auth"   ON fleet_vehicle_photos;
DROP POLICY IF EXISTS "fleet_logs_auth"     ON fleet_vehicle_time_logs;

-- fleet_users: any active fleet user can read; only admins can write
CREATE POLICY "v2_fleet_users_read" ON fleet_users FOR SELECT TO authenticated
  USING (fleet_current_role() IS NOT NULL);
CREATE POLICY "v2_fleet_users_insert" ON fleet_users FOR INSERT TO authenticated
  WITH CHECK (fleet_current_role() = 'admin');
CREATE POLICY "v2_fleet_users_update" ON fleet_users FOR UPDATE TO authenticated
  USING (fleet_current_role() = 'admin');

-- fleet_jobs: any fleet user can read; managers+ can write
CREATE POLICY "v2_fleet_jobs_read" ON fleet_jobs FOR SELECT TO authenticated
  USING (fleet_current_role() IS NOT NULL);
CREATE POLICY "v2_fleet_jobs_write" ON fleet_jobs FOR INSERT TO authenticated
  WITH CHECK (fleet_current_role() IN ('admin', 'manager'));
CREATE POLICY "v2_fleet_jobs_update" ON fleet_jobs FOR UPDATE TO authenticated
  USING (fleet_current_role() IN ('admin', 'manager'));

-- fleet_vehicles: all active users can read + update status (state machine in trigger);
-- only managers+ can insert or delete
CREATE POLICY "v2_fleet_vehicles_read" ON fleet_vehicles FOR SELECT TO authenticated
  USING (fleet_current_role() IS NOT NULL);
CREATE POLICY "v2_fleet_vehicles_update" ON fleet_vehicles FOR UPDATE TO authenticated
  USING  (fleet_current_role() IS NOT NULL)
  WITH CHECK (fleet_current_role() IS NOT NULL);
CREATE POLICY "v2_fleet_vehicles_insert" ON fleet_vehicles FOR INSERT TO authenticated
  WITH CHECK (fleet_current_role() IN ('admin', 'manager'));
CREATE POLICY "v2_fleet_vehicles_delete" ON fleet_vehicles FOR DELETE TO authenticated
  USING (fleet_current_role() IN ('admin', 'manager'));

-- fleet_vehicle_photos: any active fleet user can read/insert; no delete without manager
CREATE POLICY "v2_fleet_photos_read" ON fleet_vehicle_photos FOR SELECT TO authenticated
  USING (fleet_current_role() IS NOT NULL);
CREATE POLICY "v2_fleet_photos_insert" ON fleet_vehicle_photos FOR INSERT TO authenticated
  WITH CHECK (fleet_current_role() IS NOT NULL);
CREATE POLICY "v2_fleet_photos_delete" ON fleet_vehicle_photos FOR DELETE TO authenticated
  USING (fleet_current_role() IN ('admin', 'manager'));

-- fleet_vehicle_time_logs: any active fleet user can read/insert/update end_ts and notes
CREATE POLICY "v2_fleet_logs_read" ON fleet_vehicle_time_logs FOR SELECT TO authenticated
  USING (fleet_current_role() IS NOT NULL);
CREATE POLICY "v2_fleet_logs_insert" ON fleet_vehicle_time_logs FOR INSERT TO authenticated
  WITH CHECK (fleet_current_role() IS NOT NULL);
CREATE POLICY "v2_fleet_logs_update" ON fleet_vehicle_time_logs FOR UPDATE TO authenticated
  USING  (fleet_current_role() IS NOT NULL)
  WITH CHECK (fleet_current_role() IS NOT NULL);
