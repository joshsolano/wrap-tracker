-- ============================================================
-- Fleet Load Test Seed: 250 vehicles, 15 users, mixed states
-- Reproduces: concurrency edge cases, missing photos, duplicates, flagged records
-- Run in Supabase SQL Editor. Safe to re-run (uses ON CONFLICT DO NOTHING).
-- ============================================================

DO $$
DECLARE
  v_job_id      uuid := 'a0000000-0000-0000-0000-000000000001';
  v_admin_id    uuid := 'b0000000-0000-0000-0000-000000000001';
  v_mgr1_id     uuid := 'b0000000-0000-0000-0000-000000000002';
  v_mgr2_id     uuid := 'b0000000-0000-0000-0000-000000000003';

  -- Removers
  v_rem         uuid[] := ARRAY[
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000002'::uuid,
    'c0000000-0000-0000-0000-000000000003'::uuid,
    'c0000000-0000-0000-0000-000000000004'::uuid,
    'c0000000-0000-0000-0000-000000000005'::uuid
  ];
  -- Installers
  v_ins         uuid[] := ARRAY[
    'd0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000002'::uuid,
    'd0000000-0000-0000-0000-000000000003'::uuid,
    'd0000000-0000-0000-0000-000000000004'::uuid
  ];
  -- QC
  v_qc          uuid[] := ARRAY[
    'e0000000-0000-0000-0000-000000000001'::uuid,
    'e0000000-0000-0000-0000-000000000002'::uuid,
    'e0000000-0000-0000-0000-000000000003'::uuid
  ];

  v_now         timestamptz := now();
  v_veh_id      uuid;
  v_rem_start   timestamptz;
  v_rem_end     timestamptz;
  v_ins_start   timestamptz;
  v_ins_end     timestamptz;
  n             integer;
BEGIN

  -- ── Users ──────────────────────────────────────────────────────────────────
  INSERT INTO fleet_users(id, name, email, role, active) VALUES
    (v_admin_id, 'Load Test Admin',    'lt-admin@test.internal',    'admin',     true),
    (v_mgr1_id,  'Sarah Mitchell',     'lt-sarah@test.internal',    'manager',   true),
    (v_mgr2_id,  'Tom Bradley',        'lt-tom@test.internal',      'manager',   true),
    (v_rem[1],   'Mike Rodriguez',     'lt-mike@test.internal',     'remover',   true),
    (v_rem[2],   'Derek Thompson',     'lt-derek@test.internal',    'remover',   true),
    (v_rem[3],   'James Okafor',       'lt-james@test.internal',    'remover',   true),
    (v_rem[4],   'Carlos Vega',        'lt-carlos@test.internal',   'remover',   true),
    (v_rem[5],   'Luis Hernandez',     'lt-luis@test.internal',     'remover',   true),
    (v_ins[1],   'Tyler Kim',          'lt-tyler@test.internal',    'installer', true),
    (v_ins[2],   'Andre Jackson',      'lt-andre@test.internal',    'installer', true),
    (v_ins[3],   'Marcus Webb',        'lt-marcus@test.internal',   'installer', true),
    (v_ins[4],   'Dante Cruz',         'lt-dante@test.internal',    'installer', true),
    (v_qc[1],    'Rachel Nguyen',      'lt-rachel@test.internal',   'qc',        true),
    (v_qc[2],    'Kevin Park',         'lt-kevin@test.internal',    'qc',        true),
    (v_qc[3],    'Brianna Moore',      'lt-brianna@test.internal',  'qc',        true)
  ON CONFLICT (id) DO NOTHING;

  -- ── Job ────────────────────────────────────────────────────────────────────
  INSERT INTO fleet_jobs(id, name, customer, location, start_date, target_end_date, created_by)
  VALUES (
    v_job_id, 'LOAD TEST — 250 Vehicles', 'Acme Fleet Corp',
    'Denver, CO', current_date - 14, current_date + 7, v_admin_id
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Vehicles ───────────────────────────────────────────────────────────────
  -- Status distribution (250 total):
  --   1–75   completed       (30%)
  --   76–112 install_complete (15%)
  --   113–150 installing      (15%)
  --   151–188 ready_for_install (15%)
  --   189–213 removing        (10%)
  --   214–225 flagged         (5%)
  --   226–250 not_started     (10%)
  INSERT INTO fleet_vehicles(
    id, fleet_job_id, vin, unit_number, year, make, model,
    vehicle_type, department, status, flagged, flag_reason
  )
  SELECT
    gen_random_uuid(),
    v_job_id,
    -- Realistic-looking VINs with edge cases baked in
    CASE
      WHEN n = 100 THEN '  1ftye2cm2pka99999  '    -- spaces (import normalization test)
      WHEN n = 101 THEN '1ftye2cm2pka99999'          -- lowercase (should be caught)
      WHEN n = 200 THEN ''                            -- missing VIN edge case (won't insert; caught by constraint)
      ELSE 'LT' || lpad(n::text, 15, '0')
    END,
    'T-' || lpad(n::text, 3, '0'),
    (2018 + (n % 6))::text,
    CASE n % 4 WHEN 0 THEN 'Ford' WHEN 1 THEN 'Chevrolet' WHEN 2 THEN 'Ram' ELSE 'Mercedes' END,
    CASE n % 4 WHEN 0 THEN 'Transit' WHEN 1 THEN 'Express' WHEN 2 THEN 'ProMaster' ELSE 'Sprinter' END,
    CASE n % 3 WHEN 0 THEN 'Van' WHEN 1 THEN 'Pickup' ELSE 'SUV' END,
    'Field Ops Zone ' || ((n % 5) + 1),
    CASE
      WHEN n BETWEEN 1   AND 75  THEN 'completed'
      WHEN n BETWEEN 76  AND 112 THEN 'install_complete'
      WHEN n BETWEEN 113 AND 150 THEN 'installing'
      WHEN n BETWEEN 151 AND 188 THEN 'ready_for_install'
      WHEN n BETWEEN 189 AND 213 THEN 'removing'
      WHEN n BETWEEN 214 AND 225 THEN 'flagged'
      ELSE 'not_started'
    END,
    CASE WHEN n BETWEEN 214 AND 225 THEN true ELSE false END,
    CASE
      WHEN n BETWEEN 214 AND 218 THEN 'Paint damage on hood — customer sign-off required'
      WHEN n BETWEEN 219 AND 225 THEN 'Adhesive not releasing — supervisor review needed'
      ELSE null
    END
  FROM generate_series(1, 250) n
  WHERE n != 200  -- skip missing VIN row
  ON CONFLICT DO NOTHING;

  -- ── Intentional duplicate VIN (import edge case test) ─────────────────────
  -- Vehicle LT000000000001 already exists above; this insert should be blocked
  -- by the unique(fleet_job_id, vin) constraint. Verify by attempting:
  -- INSERT INTO fleet_vehicles(fleet_job_id, vin, status) VALUES (v_job_id, 'LT000000000001', 'not_started');
  -- Expected: ERROR 23505 unique_violation

  -- ── Removal time logs ─────────────────────────────────────────────────────
  -- All vehicles past removal stage (completed, install_complete, installing, ready_for_install)
  FOR v_veh_id, n IN
    SELECT v.id, row_number() OVER (ORDER BY v.created_at)
    FROM fleet_vehicles v
    WHERE v.fleet_job_id = v_job_id
      AND v.status IN ('completed','install_complete','installing','ready_for_install')
  LOOP
    v_rem_start := v_now - (interval '8 days') + ((n % 8) * interval '4 hours')
                   + ((random() * 60)::int * interval '1 minute');
    v_rem_end   := v_rem_start + ((25 + (random() * 75)::int) * interval '1 minute');

    INSERT INTO fleet_vehicle_time_logs(vehicle_id, fleet_user_id, log_type, start_ts, end_ts)
    VALUES (
      v_veh_id,
      v_rem[(n % array_length(v_rem,1)) + 1],
      'removal',
      v_rem_start,
      v_rem_end
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  -- Active (open) removal timers for vehicles in 'removing' state
  FOR v_veh_id IN
    SELECT id FROM fleet_vehicles
    WHERE fleet_job_id = v_job_id AND status = 'removing'
  LOOP
    INSERT INTO fleet_vehicle_time_logs(vehicle_id, fleet_user_id, log_type, start_ts, end_ts)
    VALUES (
      v_veh_id,
      v_rem[1 + (random()*4)::int],
      'removal',
      v_now - (15 + (random()*60)::int) * interval '1 minute',
      NULL
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── Install time logs ──────────────────────────────────────────────────────
  FOR v_veh_id, n IN
    SELECT v.id, row_number() OVER (ORDER BY v.created_at)
    FROM fleet_vehicles v
    WHERE v.fleet_job_id = v_job_id
      AND v.status IN ('completed','install_complete')
  LOOP
    v_ins_start := v_now - (interval '4 days') + ((n % 8) * interval '3 hours')
                   + ((random() * 30)::int * interval '1 minute');
    v_ins_end   := v_ins_start + ((15 + (random() * 45)::int) * interval '1 minute');

    INSERT INTO fleet_vehicle_time_logs(vehicle_id, fleet_user_id, log_type, start_ts, end_ts)
    VALUES (
      v_veh_id,
      v_ins[(n % array_length(v_ins,1)) + 1],
      'install',
      v_ins_start,
      v_ins_end
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  -- Active install timers for 'installing' vehicles
  FOR v_veh_id IN
    SELECT id FROM fleet_vehicles
    WHERE fleet_job_id = v_job_id AND status = 'installing'
  LOOP
    INSERT INTO fleet_vehicle_time_logs(vehicle_id, fleet_user_id, log_type, start_ts, end_ts)
    VALUES (
      v_veh_id,
      v_ins[1 + (random()*3)::int],
      'install',
      v_now - (10 + (random()*40)::int) * interval '1 minute',
      NULL
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── Photo records ──────────────────────────────────────────────────────────
  -- Required before photos for all vehicles past removal
  INSERT INTO fleet_vehicle_photos(vehicle_id, fleet_job_id, photo_type, storage_path, upload_state)
  SELECT
    v.id, v_job_id,
    pt.photo_type,
    'loadtest/' || v.id || '/' || pt.photo_type || '.jpg',
    'complete'
  FROM fleet_vehicles v
  CROSS JOIN (VALUES
    ('before_front'), ('before_driver'), ('before_passenger'), ('before_rear')
  ) pt(photo_type)
  WHERE v.fleet_job_id = v_job_id
    AND v.status NOT IN ('not_started', 'removing', 'flagged')
  ON CONFLICT DO NOTHING;

  -- Required after photos for completed + install_complete
  INSERT INTO fleet_vehicle_photos(vehicle_id, fleet_job_id, photo_type, storage_path, upload_state)
  SELECT
    v.id, v_job_id,
    pt.photo_type,
    'loadtest/' || v.id || '/' || pt.photo_type || '.jpg',
    'complete'
  FROM fleet_vehicles v
  CROSS JOIN (VALUES
    ('after_front'), ('after_driver'), ('after_passenger'), ('after_rear'),
    ('vin_sticker'), ('tire_size')
  ) pt(photo_type)
  WHERE v.fleet_job_id = v_job_id
    AND v.status IN ('completed', 'install_complete')
  ON CONFLICT DO NOTHING;

  -- Partial before photos for 'installing' vehicles (edge case: some photos missing)
  INSERT INTO fleet_vehicle_photos(vehicle_id, fleet_job_id, photo_type, storage_path, upload_state)
  SELECT
    v.id, v_job_id,
    pt.photo_type,
    'loadtest/' || v.id || '/' || pt.photo_type || '.jpg',
    'complete'
  FROM fleet_vehicles v
  CROSS JOIN (VALUES ('before_front'), ('before_driver')) pt(photo_type)
  WHERE v.fleet_job_id = v_job_id AND v.status = 'installing'
  ON CONFLICT DO NOTHING;

  -- Damage photos for flagged vehicles
  INSERT INTO fleet_vehicle_photos(vehicle_id, fleet_job_id, photo_type, storage_path, upload_state)
  SELECT
    v.id, v_job_id,
    'before_damage',
    'loadtest/' || v.id || '/before_damage-1.jpg',
    'complete'
  FROM fleet_vehicles v
  WHERE v.fleet_job_id = v_job_id AND v.flagged = true
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Load test seed complete: job_id = %', v_job_id;
END $$;

-- ── Verification queries ─────────────────────────────────────────────────────
-- Run these after seeding to confirm counts:

-- SELECT status, count(*) FROM fleet_vehicles WHERE fleet_job_id = 'a0000000-0000-0000-0000-000000000001' GROUP BY status ORDER BY count DESC;
-- SELECT log_type, count(*), count(*) filter (where end_ts IS NULL) as active FROM fleet_vehicle_time_logs GROUP BY log_type;
-- SELECT photo_type, count(*) FROM fleet_vehicle_photos GROUP BY photo_type ORDER BY count DESC;

-- ── Concurrency test: attempt duplicate active timer (should fail) ─────────
-- After seeding, pick any vehicle in 'removing' state and run:
--   INSERT INTO fleet_vehicle_time_logs(vehicle_id, fleet_user_id, log_type, start_ts)
--   SELECT id, null, 'removal', now() FROM fleet_vehicles WHERE status = 'removing' LIMIT 1;
-- Expected: ERROR unique constraint "fleet_time_logs_active_idx"

-- ── State machine test: attempt invalid transition (should fail) ──────────
-- UPDATE fleet_vehicles SET status = 'completed' WHERE status = 'not_started' LIMIT 1;
-- Expected: ERROR "Invalid status transition: not_started -> completed"
