-- ================================================================
-- FLEET DEMO SEED — "Spire Fleet Demo"
-- Run once in Supabase SQL Editor to populate demo data.
-- ================================================================

DO $$
DECLARE
  job_id    uuid;
  mike_id   uuid := gen_random_uuid();
  carlos_id uuid := gen_random_uuid();
  derek_id  uuid := gen_random_uuid();
  james_id  uuid := gen_random_uuid();

  v01 uuid := gen_random_uuid(); v02 uuid := gen_random_uuid();
  v03 uuid := gen_random_uuid(); v04 uuid := gen_random_uuid();
  v05 uuid := gen_random_uuid(); v06 uuid := gen_random_uuid();
  v07 uuid := gen_random_uuid(); v08 uuid := gen_random_uuid();
  v09 uuid := gen_random_uuid(); v10 uuid := gen_random_uuid();
  v11 uuid := gen_random_uuid(); v12 uuid := gen_random_uuid();
  v13 uuid := gen_random_uuid(); v14 uuid := gen_random_uuid();
  v15 uuid := gen_random_uuid(); v16 uuid := gen_random_uuid();
  v17 uuid := gen_random_uuid(); v18 uuid := gen_random_uuid();
  v19 uuid := gen_random_uuid(); v20 uuid := gen_random_uuid();
  v21 uuid := gen_random_uuid(); v22 uuid := gen_random_uuid();
  v23 uuid := gen_random_uuid(); v24 uuid := gen_random_uuid();
  v25 uuid := gen_random_uuid(); v26 uuid := gen_random_uuid();
  v27 uuid := gen_random_uuid(); v28 uuid := gen_random_uuid();
BEGIN

  -- ── Demo crew ──────────────────────────────────────────────────
  INSERT INTO fleet_users (id, name, email, role, active) VALUES
    (mike_id,   'Mike Rodriguez', 'mike.r@spirefleet.demo',   'remover',   true),
    (carlos_id, 'Carlos Vega',    'carlos.v@spirefleet.demo', 'installer', true),
    (derek_id,  'Derek Thompson', 'derek.t@spirefleet.demo',  'remover',   true),
    (james_id,  'James Kim',      'james.k@spirefleet.demo',  'installer', true);

  -- ── Fleet job ──────────────────────────────────────────────────
  INSERT INTO fleet_jobs (name, customer, location, start_date, target_end_date, notes)
  VALUES (
    'Spire Fleet Demo', 'Spire Energy', 'Denver, CO',
    '2025-04-14', '2025-04-25',
    'DEMO — 28-vehicle removal and rebrand for Spire Energy. Mixed van, pickup, and SUV fleet.'
  ) RETURNING id INTO job_id;

  -- ── Vehicles ───────────────────────────────────────────────────
  INSERT INTO fleet_vehicles
    (id, fleet_job_id, vin, unit_number, year, make, model, vehicle_type, department, status, flagged, flag_reason, notes)
  VALUES
    -- Completed (8) -----------------------------------------------
    (v01,job_id,'1FTYE2CM2PKA12301','T-101','2022','Ford','Transit',  'Van',   'Field Ops',   'completed',         false,null,null),
    (v02,job_id,'1FTYE2CM4PKA12302','T-102','2022','Ford','Transit',  'Van',   'Field Ops',   'completed',         false,null,'Wrap came off clean'),
    (v03,job_id,'1FTFW1ET3NFA12303','F-201','2022','Ford','F-150',    'Pickup','Maintenance', 'completed',         false,null,null),
    (v04,job_id,'1C6RR7FT4NS512304','R-301','2022','Ram', '1500',     'Pickup','Maintenance', 'completed',         false,null,null),
    (v05,job_id,'1FTYE2CM6PKA12305','T-103','2021','Ford','Transit',  'Van',   'Field Ops',   'completed',         false,null,'Adhesive heavy on rear panel'),
    (v06,job_id,'1FTFW1ET5NFA12306','F-202','2021','Ford','F-150',    'Pickup','Maintenance', 'completed',         false,null,null),
    (v07,job_id,'1C6RR6FT2NS512307','R-302','2021','Ram', '1500',     'Pickup','Maintenance', 'completed',         false,null,null),
    (v08,job_id,'1FMCU9GD3MUA12308','E-401','2022','Ford','Escape',   'SUV',  'Admin',        'completed',         false,null,null),
    -- Install complete / pending QC (5) ---------------------------
    (v09,job_id,'1FTYE2CM8PKA12309','T-104','2023','Ford','Transit',  'Van',   'Field Ops',   'install_complete',  false,null,null),
    (v10,job_id,'1FTYE2CMAPKA12310','T-105','2023','Ford','Transit',  'Van',   'Field Ops',   'install_complete',  false,null,null),
    (v11,job_id,'1FTFW1ET7NFA12311','F-203','2023','Ford','F-150',    'Pickup','Maintenance', 'install_complete',  false,null,'Minor paint lift on driver door'),
    (v12,job_id,'1C6RR7FT8NS512312','R-303','2022','Ram', '1500',     'Pickup','Maintenance', 'install_complete',  false,null,null),
    (v13,job_id,'1FMCU9GD5MUA12313','E-402','2023','Ford','Escape',   'SUV',  'Admin',        'install_complete',  false,null,null),
    -- Installing (4) ----------------------------------------------
    (v14,job_id,'1FTYE2CMCPKA12314','T-106','2022','Ford','Transit',  'Van',   'Field Ops',   'installing',        false,null,null),
    (v15,job_id,'1FTFW1ET9NFA12315','F-204','2022','Ford','F-150',    'Pickup','Maintenance', 'installing',        false,null,null),
    (v16,job_id,'1C6RR6FT4NS512316','R-304','2023','Ram', '1500',     'Pickup','Maintenance', 'installing',        false,null,null),
    (v17,job_id,'1FMCU0GD7MUA12317','E-403','2022','Ford','Escape',   'SUV',  'Admin',        'installing',        false,null,null),
    -- Ready for install (4) ---------------------------------------
    (v18,job_id,'1FTYE2CMEPKA12318','T-107','2021','Ford','Transit',  'Van',   'Field Ops',   'ready_for_install', false,null,null),
    (v19,job_id,'1FTFW1ET1NFA12319','F-205','2021','Ford','F-150',    'Pickup','Maintenance', 'ready_for_install', false,null,null),
    (v20,job_id,'1C6RR7FT0NS512320','R-305','2022','Ram', '1500',     'Pickup','Maintenance', 'ready_for_install', false,null,'Toolbox section took longer'),
    (v21,job_id,'1FMCU9GD9MUA12321','E-404','2021','Ford','Escape',   'SUV',  'Admin',        'ready_for_install', false,null,null),
    -- Removing (3) ------------------------------------------------
    (v22,job_id,'1FTYE2CMGPKA12322','T-108','2023','Ford','Transit',  'Van',   'Field Ops',   'removing',          false,null,null),
    (v23,job_id,'1FTFW1ET3NFA12323','F-206','2023','Ford','F-150',    'Pickup','Maintenance', 'removing',          false,null,null),
    (v24,job_id,'1C6RR6FT6NS512324','R-306','2021','Ram', '1500',     'Pickup','Maintenance', 'removing',          false,null,null),
    -- Not started (2) --------------------------------------------
    (v25,job_id,'1FMCU0GD9MUA12325','E-405','2023','Ford','Escape',   'SUV',  'Admin',        'not_started',       false,null,null),
    (v26,job_id,'1FTYE2CMIPKA12326','T-109','2022','Ford','Transit',  'Van',   'Field Ops',   'not_started',       false,null,null),
    -- Flagged (2) -------------------------------------------------
    (v27,job_id,'1FTFW1ET5NFA12327','F-207','2020','Ford','F-150',    'Pickup','Maintenance', 'flagged',           true,'Paint damage on hood — customer sign-off required',null),
    (v28,job_id,'1FTYE2CMKPKA12328','T-110','2020','Ford','Transit',  'Van',   'Field Ops',   'flagged',           true,'Partial removal only — adhesive not releasing on roof section',null);

  -- ── Time logs ─────────────────────────────────────────────────
  INSERT INTO fleet_vehicle_time_logs (vehicle_id, fleet_user_id, log_type, start_ts, end_ts, notes) VALUES
    -- Day 1 (completed v01–v04)
    (v01,mike_id,  'removal',now()-'3 days 8 hours'::interval,              now()-'3 days 6 hours 50 minutes'::interval, null),
    (v01,carlos_id,'install',now()-'3 days 5 hours'::interval,              now()-'3 days 4 hours 32 minutes'::interval, null),
    (v02,mike_id,  'removal',now()-'3 days 4 hours 30 minutes'::interval,   now()-'3 days 3 hours 5 minutes'::interval,  null),
    (v02,carlos_id,'install',now()-'3 days 2 hours'::interval,              now()-'3 days 1 hour 34 minutes'::interval,  null),
    (v03,derek_id, 'removal',now()-'3 days 8 hours'::interval,              now()-'3 days 7 hours 28 minutes'::interval, null),
    (v03,james_id, 'install',now()-'3 days 6 hours 30 minutes'::interval,   now()-'3 days 6 hours 12 minutes'::interval, null),
    (v04,derek_id, 'removal',now()-'3 days 7 hours'::interval,              now()-'3 days 6 hours 32 minutes'::interval, null),
    (v04,james_id, 'install',now()-'3 days 5 hours 30 minutes'::interval,   now()-'3 days 5 hours 8 minutes'::interval,  null),
    -- Day 2 (completed v05–v08)
    (v05,mike_id,  'removal',now()-'2 days 8 hours'::interval,              now()-'2 days 6 hours 15 minutes'::interval, 'Adhesive heavy on rear panel, used heat gun'),
    (v05,carlos_id,'install',now()-'2 days 5 hours'::interval,              now()-'2 days 4 hours 30 minutes'::interval, null),
    (v06,derek_id, 'removal',now()-'2 days 8 hours'::interval,              now()-'2 days 7 hours 35 minutes'::interval, null),
    (v06,james_id, 'install',now()-'2 days 6 hours 30 minutes'::interval,   now()-'2 days 6 hours 10 minutes'::interval, null),
    (v07,derek_id, 'removal',now()-'2 days 7 hours'::interval,              now()-'2 days 6 hours 25 minutes'::interval, null),
    (v07,james_id, 'install',now()-'2 days 5 hours 30 minutes'::interval,   now()-'2 days 5 hours 8 minutes'::interval,  null),
    (v08,derek_id, 'removal',now()-'2 days 4 hours'::interval,              now()-'2 days 3 hours 38 minutes'::interval, null),
    (v08,james_id, 'install',now()-'2 days 2 hours 30 minutes'::interval,   now()-'2 days 2 hours 13 minutes'::interval, null),
    -- Day 3 (install_complete v09–v13)
    (v09,mike_id,  'removal',now()-'1 day 8 hours'::interval,               now()-'1 day 6 hours 55 minutes'::interval,  null),
    (v09,carlos_id,'install',now()-'1 day 5 hours'::interval,               now()-'1 day 4 hours 33 minutes'::interval,  null),
    (v10,mike_id,  'removal',now()-'1 day 4 hours'::interval,               now()-'1 day 2 hours 40 minutes'::interval,  null),
    (v10,carlos_id,'install',now()-'1 day 1 hour 30 minutes'::interval,     now()-'1 day 1 hour 1 minute'::interval,     null),
    (v11,derek_id, 'removal',now()-'1 day 8 hours'::interval,               now()-'1 day 7 hours 20 minutes'::interval,  'Minor paint lift on driver door noted during removal'),
    (v11,james_id, 'install',now()-'1 day 6 hours 30 minutes'::interval,    now()-'1 day 6 hours 9 minutes'::interval,   null),
    (v12,derek_id, 'removal',now()-'1 day 5 hours'::interval,               now()-'1 day 4 hours 30 minutes'::interval,  null),
    (v12,james_id, 'install',now()-'1 day 3 hours 30 minutes'::interval,    now()-'1 day 3 hours 7 minutes'::interval,   null),
    (v13,derek_id, 'removal',now()-'1 day 3 hours'::interval,               now()-'1 day 2 hours 36 minutes'::interval,  null),
    (v13,james_id, 'install',now()-'1 day 1 hour 30 minutes'::interval,     now()-'1 day 1 hour 12 minutes'::interval,   null),
    -- Today (in progress)
    (v14,mike_id,  'removal',now()-'5 hours'::interval,                     now()-'3 hours 55 minutes'::interval,        null),
    (v14,carlos_id,'install',now()-'2 hours'::interval,                     null,                                        null),
    (v15,derek_id, 'removal',now()-'4 hours'::interval,                     now()-'3 hours 28 minutes'::interval,        null),
    (v15,james_id, 'install',now()-'1 hour 30 minutes'::interval,           null,                                        null),
    (v16,derek_id, 'removal',now()-'3 hours'::interval,                     now()-'2 hours 28 minutes'::interval,        null),
    (v16,james_id, 'install',now()-'45 minutes'::interval,                  null,                                        null),
    (v17,mike_id,  'removal',now()-'2 hours 30 minutes'::interval,          now()-'2 hours 8 minutes'::interval,         null),
    (v17,carlos_id,'install',now()-'30 minutes'::interval,                  null,                                        null),
    (v18,mike_id,  'removal',now()-'3 hours'::interval,                     now()-'1 hour 45 minutes'::interval,         null),
    (v19,derek_id, 'removal',now()-'2 hours 30 minutes'::interval,          now()-'2 hours 5 minutes'::interval,         null),
    (v20,derek_id, 'removal',now()-'2 hours'::interval,                     now()-'55 minutes'::interval,                'Toolbox section required extra time'),
    (v21,mike_id,  'removal',now()-'1 hour 30 minutes'::interval,           now()-'1 hour 8 minutes'::interval,          null),
    (v22,mike_id,  'removal',now()-'45 minutes'::interval,                  null,                                        null),
    (v23,derek_id, 'removal',now()-'25 minutes'::interval,                  null,                                        null),
    (v24,derek_id, 'removal',now()-'15 minutes'::interval,                  null,                                        null),
    -- Flagged vehicles (attempted)
    (v27,derek_id, 'removal',now()-'4 days'::interval,                      now()-'3 days 23 hours 20 minutes'::interval,'Paint damage found on hood, stopped removal pending customer review'),
    (v28,mike_id,  'removal',now()-'2 days'::interval,                      null,                                        'Adhesive not releasing on roof section — paused pending solution');

  -- ── Photos ────────────────────────────────────────────────────
  -- Storage path 'demo/placeholder.jpg' — records exist for completeness tracking.
  -- Upload any image to fleet-photos bucket at path demo/placeholder.jpg to show thumbnails.
  INSERT INTO fleet_vehicle_photos (vehicle_id, fleet_job_id, photo_type, storage_path, uploaded_by) VALUES
    -- v01 complete: all 10
    (v01,job_id,'before_front','demo/placeholder.jpg',mike_id),(v01,job_id,'before_driver','demo/placeholder.jpg',mike_id),
    (v01,job_id,'before_passenger','demo/placeholder.jpg',mike_id),(v01,job_id,'before_rear','demo/placeholder.jpg',mike_id),
    (v01,job_id,'after_front','demo/placeholder.jpg',carlos_id),(v01,job_id,'after_driver','demo/placeholder.jpg',carlos_id),
    (v01,job_id,'after_passenger','demo/placeholder.jpg',carlos_id),(v01,job_id,'after_rear','demo/placeholder.jpg',carlos_id),
    (v01,job_id,'vin_sticker','demo/placeholder.jpg',carlos_id),(v01,job_id,'tire_size','demo/placeholder.jpg',carlos_id),
    -- v02
    (v02,job_id,'before_front','demo/placeholder.jpg',mike_id),(v02,job_id,'before_driver','demo/placeholder.jpg',mike_id),
    (v02,job_id,'before_passenger','demo/placeholder.jpg',mike_id),(v02,job_id,'before_rear','demo/placeholder.jpg',mike_id),
    (v02,job_id,'after_front','demo/placeholder.jpg',carlos_id),(v02,job_id,'after_driver','demo/placeholder.jpg',carlos_id),
    (v02,job_id,'after_passenger','demo/placeholder.jpg',carlos_id),(v02,job_id,'after_rear','demo/placeholder.jpg',carlos_id),
    (v02,job_id,'vin_sticker','demo/placeholder.jpg',carlos_id),(v02,job_id,'tire_size','demo/placeholder.jpg',carlos_id),
    -- v03
    (v03,job_id,'before_front','demo/placeholder.jpg',derek_id),(v03,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v03,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v03,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    (v03,job_id,'after_front','demo/placeholder.jpg',james_id),(v03,job_id,'after_driver','demo/placeholder.jpg',james_id),
    (v03,job_id,'after_passenger','demo/placeholder.jpg',james_id),(v03,job_id,'after_rear','demo/placeholder.jpg',james_id),
    (v03,job_id,'vin_sticker','demo/placeholder.jpg',james_id),(v03,job_id,'tire_size','demo/placeholder.jpg',james_id),
    -- v04
    (v04,job_id,'before_front','demo/placeholder.jpg',derek_id),(v04,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v04,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v04,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    (v04,job_id,'after_front','demo/placeholder.jpg',james_id),(v04,job_id,'after_driver','demo/placeholder.jpg',james_id),
    (v04,job_id,'after_passenger','demo/placeholder.jpg',james_id),(v04,job_id,'after_rear','demo/placeholder.jpg',james_id),
    (v04,job_id,'vin_sticker','demo/placeholder.jpg',james_id),(v04,job_id,'tire_size','demo/placeholder.jpg',james_id),
    -- v05
    (v05,job_id,'before_front','demo/placeholder.jpg',mike_id),(v05,job_id,'before_driver','demo/placeholder.jpg',mike_id),
    (v05,job_id,'before_passenger','demo/placeholder.jpg',mike_id),(v05,job_id,'before_rear','demo/placeholder.jpg',mike_id),
    (v05,job_id,'after_front','demo/placeholder.jpg',carlos_id),(v05,job_id,'after_driver','demo/placeholder.jpg',carlos_id),
    (v05,job_id,'after_passenger','demo/placeholder.jpg',carlos_id),(v05,job_id,'after_rear','demo/placeholder.jpg',carlos_id),
    (v05,job_id,'vin_sticker','demo/placeholder.jpg',carlos_id),(v05,job_id,'tire_size','demo/placeholder.jpg',carlos_id),
    -- v06
    (v06,job_id,'before_front','demo/placeholder.jpg',derek_id),(v06,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v06,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v06,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    (v06,job_id,'after_front','demo/placeholder.jpg',james_id),(v06,job_id,'after_driver','demo/placeholder.jpg',james_id),
    (v06,job_id,'after_passenger','demo/placeholder.jpg',james_id),(v06,job_id,'after_rear','demo/placeholder.jpg',james_id),
    (v06,job_id,'vin_sticker','demo/placeholder.jpg',james_id),(v06,job_id,'tire_size','demo/placeholder.jpg',james_id),
    -- v07
    (v07,job_id,'before_front','demo/placeholder.jpg',derek_id),(v07,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v07,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v07,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    (v07,job_id,'after_front','demo/placeholder.jpg',james_id),(v07,job_id,'after_driver','demo/placeholder.jpg',james_id),
    (v07,job_id,'after_passenger','demo/placeholder.jpg',james_id),(v07,job_id,'after_rear','demo/placeholder.jpg',james_id),
    (v07,job_id,'vin_sticker','demo/placeholder.jpg',james_id),(v07,job_id,'tire_size','demo/placeholder.jpg',james_id),
    -- v08
    (v08,job_id,'before_front','demo/placeholder.jpg',derek_id),(v08,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v08,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v08,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    (v08,job_id,'after_front','demo/placeholder.jpg',james_id),(v08,job_id,'after_driver','demo/placeholder.jpg',james_id),
    (v08,job_id,'after_passenger','demo/placeholder.jpg',james_id),(v08,job_id,'after_rear','demo/placeholder.jpg',james_id),
    (v08,job_id,'vin_sticker','demo/placeholder.jpg',james_id),(v08,job_id,'tire_size','demo/placeholder.jpg',james_id),
    -- v09 install_complete
    (v09,job_id,'before_front','demo/placeholder.jpg',mike_id),(v09,job_id,'before_driver','demo/placeholder.jpg',mike_id),
    (v09,job_id,'before_passenger','demo/placeholder.jpg',mike_id),(v09,job_id,'before_rear','demo/placeholder.jpg',mike_id),
    (v09,job_id,'after_front','demo/placeholder.jpg',carlos_id),(v09,job_id,'after_driver','demo/placeholder.jpg',carlos_id),
    (v09,job_id,'after_passenger','demo/placeholder.jpg',carlos_id),(v09,job_id,'after_rear','demo/placeholder.jpg',carlos_id),
    (v09,job_id,'vin_sticker','demo/placeholder.jpg',carlos_id),(v09,job_id,'tire_size','demo/placeholder.jpg',carlos_id),
    -- v10
    (v10,job_id,'before_front','demo/placeholder.jpg',mike_id),(v10,job_id,'before_driver','demo/placeholder.jpg',mike_id),
    (v10,job_id,'before_passenger','demo/placeholder.jpg',mike_id),(v10,job_id,'before_rear','demo/placeholder.jpg',mike_id),
    (v10,job_id,'after_front','demo/placeholder.jpg',carlos_id),(v10,job_id,'after_driver','demo/placeholder.jpg',carlos_id),
    (v10,job_id,'after_passenger','demo/placeholder.jpg',carlos_id),(v10,job_id,'after_rear','demo/placeholder.jpg',carlos_id),
    (v10,job_id,'vin_sticker','demo/placeholder.jpg',carlos_id),(v10,job_id,'tire_size','demo/placeholder.jpg',carlos_id),
    -- v11
    (v11,job_id,'before_front','demo/placeholder.jpg',derek_id),(v11,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v11,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v11,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    (v11,job_id,'after_front','demo/placeholder.jpg',james_id),(v11,job_id,'after_driver','demo/placeholder.jpg',james_id),
    (v11,job_id,'after_passenger','demo/placeholder.jpg',james_id),(v11,job_id,'after_rear','demo/placeholder.jpg',james_id),
    (v11,job_id,'vin_sticker','demo/placeholder.jpg',james_id),(v11,job_id,'tire_size','demo/placeholder.jpg',james_id),
    -- v12
    (v12,job_id,'before_front','demo/placeholder.jpg',derek_id),(v12,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v12,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v12,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    (v12,job_id,'after_front','demo/placeholder.jpg',james_id),(v12,job_id,'after_driver','demo/placeholder.jpg',james_id),
    (v12,job_id,'after_passenger','demo/placeholder.jpg',james_id),(v12,job_id,'after_rear','demo/placeholder.jpg',james_id),
    (v12,job_id,'vin_sticker','demo/placeholder.jpg',james_id),(v12,job_id,'tire_size','demo/placeholder.jpg',james_id),
    -- v13
    (v13,job_id,'before_front','demo/placeholder.jpg',derek_id),(v13,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v13,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v13,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    (v13,job_id,'after_front','demo/placeholder.jpg',james_id),(v13,job_id,'after_driver','demo/placeholder.jpg',james_id),
    (v13,job_id,'after_passenger','demo/placeholder.jpg',james_id),(v13,job_id,'after_rear','demo/placeholder.jpg',james_id),
    (v13,job_id,'vin_sticker','demo/placeholder.jpg',james_id),(v13,job_id,'tire_size','demo/placeholder.jpg',james_id),
    -- v14 installing: all before, 2 after (in progress)
    (v14,job_id,'before_front','demo/placeholder.jpg',mike_id),(v14,job_id,'before_driver','demo/placeholder.jpg',mike_id),
    (v14,job_id,'before_passenger','demo/placeholder.jpg',mike_id),(v14,job_id,'before_rear','demo/placeholder.jpg',mike_id),
    (v14,job_id,'after_front','demo/placeholder.jpg',carlos_id),(v14,job_id,'after_driver','demo/placeholder.jpg',carlos_id),
    -- v15 installing: all before, 1 after
    (v15,job_id,'before_front','demo/placeholder.jpg',derek_id),(v15,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v15,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v15,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    (v15,job_id,'after_front','demo/placeholder.jpg',james_id),
    -- v16 installing: all before, 3 after
    (v16,job_id,'before_front','demo/placeholder.jpg',derek_id),(v16,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v16,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v16,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    (v16,job_id,'after_front','demo/placeholder.jpg',james_id),(v16,job_id,'after_driver','demo/placeholder.jpg',james_id),
    (v16,job_id,'after_passenger','demo/placeholder.jpg',james_id),
    -- v17 installing: all before, all after + vin (missing tire)
    (v17,job_id,'before_front','demo/placeholder.jpg',mike_id),(v17,job_id,'before_driver','demo/placeholder.jpg',mike_id),
    (v17,job_id,'before_passenger','demo/placeholder.jpg',mike_id),(v17,job_id,'before_rear','demo/placeholder.jpg',mike_id),
    (v17,job_id,'after_front','demo/placeholder.jpg',carlos_id),(v17,job_id,'after_driver','demo/placeholder.jpg',carlos_id),
    (v17,job_id,'after_passenger','demo/placeholder.jpg',carlos_id),(v17,job_id,'after_rear','demo/placeholder.jpg',carlos_id),
    (v17,job_id,'vin_sticker','demo/placeholder.jpg',carlos_id),
    -- v18-v21 ready_for_install: all 4 before
    (v18,job_id,'before_front','demo/placeholder.jpg',mike_id),(v18,job_id,'before_driver','demo/placeholder.jpg',mike_id),
    (v18,job_id,'before_passenger','demo/placeholder.jpg',mike_id),(v18,job_id,'before_rear','demo/placeholder.jpg',mike_id),
    (v19,job_id,'before_front','demo/placeholder.jpg',derek_id),(v19,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v19,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v19,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    (v20,job_id,'before_front','demo/placeholder.jpg',derek_id),(v20,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v20,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v20,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    (v21,job_id,'before_front','demo/placeholder.jpg',mike_id),(v21,job_id,'before_driver','demo/placeholder.jpg',mike_id),
    (v21,job_id,'before_passenger','demo/placeholder.jpg',mike_id),(v21,job_id,'before_rear','demo/placeholder.jpg',mike_id),
    -- v22 removing: 2 before (partial)
    (v22,job_id,'before_front','demo/placeholder.jpg',mike_id),(v22,job_id,'before_driver','demo/placeholder.jpg',mike_id),
    -- v23 removing: all 4 before
    (v23,job_id,'before_front','demo/placeholder.jpg',derek_id),(v23,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    (v23,job_id,'before_passenger','demo/placeholder.jpg',derek_id),(v23,job_id,'before_rear','demo/placeholder.jpg',derek_id),
    -- v24 removing: 1 before
    (v24,job_id,'before_front','demo/placeholder.jpg',derek_id),
    -- v27 flagged: 2 before
    (v27,job_id,'before_front','demo/placeholder.jpg',derek_id),(v27,job_id,'before_driver','demo/placeholder.jpg',derek_id),
    -- v28 flagged: all 4 before
    (v28,job_id,'before_front','demo/placeholder.jpg',mike_id),(v28,job_id,'before_driver','demo/placeholder.jpg',mike_id),
    (v28,job_id,'before_passenger','demo/placeholder.jpg',mike_id),(v28,job_id,'before_rear','demo/placeholder.jpg',mike_id);

END $$;
