-- Fleet Users
create table if not exists fleet_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  email text,
  name text not null,
  phone text,
  role text not null default 'remover' check (role in ('admin','manager','remover','installer','qc')),
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Fleet Jobs
create table if not exists fleet_jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  customer text not null,
  location text,
  start_date date,
  target_end_date date,
  notes text,
  created_by uuid references fleet_users(id),
  created_at timestamptz default now()
);

-- Fleet Vehicles (unique VIN per job)
create table if not exists fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  fleet_job_id uuid not null references fleet_jobs(id) on delete cascade,
  vin text not null,
  unit_number text,
  year text,
  make text,
  model text,
  vehicle_type text,
  department text,
  location text,
  notes text,
  status text not null default 'not_started',
  flagged boolean not null default false,
  flag_reason text,
  created_at timestamptz default now(),
  unique(fleet_job_id, vin)
);

-- Fleet Vehicle Photos
create table if not exists fleet_vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references fleet_vehicles(id) on delete cascade,
  fleet_job_id uuid not null,
  photo_type text not null,
  storage_path text not null,
  uploaded_by uuid references fleet_users(id),
  created_at timestamptz default now()
);

-- Fleet Vehicle Time Logs
create table if not exists fleet_vehicle_time_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references fleet_vehicles(id) on delete cascade,
  fleet_user_id uuid references fleet_users(id),
  log_type text not null check (log_type in ('removal','install')),
  start_ts timestamptz,
  end_ts timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- Enable RLS on all fleet tables
alter table fleet_users enable row level security;
alter table fleet_jobs enable row level security;
alter table fleet_vehicles enable row level security;
alter table fleet_vehicle_photos enable row level security;
alter table fleet_vehicle_time_logs enable row level security;

-- Permissive policies: any authenticated user can read/write fleet data
create policy "fleet_users_auth" on fleet_users for all to authenticated using (true) with check (true);
create policy "fleet_jobs_auth" on fleet_jobs for all to authenticated using (true) with check (true);
create policy "fleet_vehicles_auth" on fleet_vehicles for all to authenticated using (true) with check (true);
create policy "fleet_photos_auth" on fleet_vehicle_photos for all to authenticated using (true) with check (true);
create policy "fleet_logs_auth" on fleet_vehicle_time_logs for all to authenticated using (true) with check (true);

-- Storage bucket: run in Supabase dashboard > Storage > New bucket
-- Name: fleet-photos
-- Public: true
-- Allowed MIME types: image/*
