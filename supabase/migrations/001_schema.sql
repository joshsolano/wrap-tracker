-- ============================================================
-- WrapGFX Production Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- INSTALLERS
-- One row per installer. Linked to Supabase auth.users via user_id.
-- ============================================================
CREATE TABLE installers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#F5C400',
  birthday    TEXT,                        -- stored as MM/DD string
  role        TEXT NOT NULL DEFAULT 'installer' CHECK (role IN ('installer','admin')),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROJECTS
-- One row per job/vehicle. Tracks type, due date, completion.
-- ============================================================
CREATE TABLE projects (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL UNIQUE,
  project_type TEXT NOT NULL DEFAULT 'commercial' CHECK (project_type IN ('commercial','colorchange')),
  due_date     DATE,
  archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PANELS
-- One row per panel per project.
-- ============================================================
CREATE TABLE panels (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  height_in   NUMERIC,                     -- stored in inches
  width_in    NUMERIC,                     -- stored in inches
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, name)
);

-- ============================================================
-- ACTIVE JOBS
-- One row per currently clocked-in session.
-- Enforces one active job per installer at a time.
-- ============================================================
CREATE TABLE active_jobs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  installer_id  UUID NOT NULL REFERENCES installers(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  panel_id      UUID NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
  job_type      TEXT NOT NULL DEFAULT 'Wrap' CHECK (job_type IN ('Wrap','Die-Cut','Removal','Other')),
  is_color_change BOOLEAN NOT NULL DEFAULT FALSE,
  start_ts      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(installer_id)                     -- one active job per installer
);

-- ============================================================
-- LOGS
-- Immutable record of every completed panel install.
-- ============================================================
CREATE TABLE logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  installer_id    UUID REFERENCES installers(id) ON DELETE SET NULL,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  panel_id        UUID REFERENCES panels(id) ON DELETE SET NULL,
  project_name    TEXT NOT NULL,           -- denormalized for display after project edits
  panel_name      TEXT NOT NULL,           -- denormalized for display after panel removal
  job_type        TEXT NOT NULL DEFAULT 'Wrap',
  is_color_change BOOLEAN NOT NULL DEFAULT FALSE,
  height_in       NUMERIC,
  width_in        NUMERIC,
  start_ts        TIMESTAMPTZ NOT NULL,
  finish_ts       TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Complete',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT finish_after_start CHECK (finish_ts > start_ts)
);

-- ============================================================
-- INDEXES for common query patterns
-- ============================================================
CREATE INDEX idx_logs_installer   ON logs(installer_id);
CREATE INDEX idx_logs_project     ON logs(project_id);
CREATE INDEX idx_logs_finish_ts   ON logs(finish_ts DESC);
CREATE INDEX idx_logs_start_ts    ON logs(start_ts DESC);
CREATE INDEX idx_panels_project   ON panels(project_id);
CREATE INDEX idx_active_installer ON active_jobs(installer_id);

-- ============================================================
-- UPDATED_AT trigger for projects
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE installers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE panels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs        ENABLE ROW LEVEL SECURITY;

-- Helper: is the calling user an admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM installers
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: get installer id for current user
CREATE OR REPLACE FUNCTION my_installer_id()
RETURNS UUID AS $$
  SELECT id FROM installers WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- INSTALLERS: all authenticated users can read; only admins can insert/update/delete
CREATE POLICY "installers_select" ON installers FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "installers_insert" ON installers FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "installers_update" ON installers FOR UPDATE TO authenticated USING (is_admin() OR user_id = auth.uid());
CREATE POLICY "installers_delete" ON installers FOR DELETE TO authenticated USING (is_admin());

-- PROJECTS: all authenticated users can read; admins can write
CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated USING (is_admin());

-- PANELS: all authenticated users can read; admins can write
CREATE POLICY "panels_select" ON panels FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "panels_insert" ON panels FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "panels_update" ON panels FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "panels_delete" ON panels FOR DELETE TO authenticated USING (is_admin());

-- ACTIVE JOBS: all can read; installers can only manage their own row; admins can manage all
CREATE POLICY "active_jobs_select" ON active_jobs FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "active_jobs_insert" ON active_jobs FOR INSERT TO authenticated
  WITH CHECK (installer_id = my_installer_id() OR is_admin());
CREATE POLICY "active_jobs_delete" ON active_jobs FOR DELETE TO authenticated
  USING (installer_id = my_installer_id() OR is_admin());

-- LOGS: all can read; authenticated users can insert (clock out creates a log); admins can delete
CREATE POLICY "logs_select" ON logs FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "logs_insert" ON logs FOR INSERT TO authenticated
  WITH CHECK (installer_id = my_installer_id() OR is_admin());
CREATE POLICY "logs_delete" ON logs FOR DELETE TO authenticated USING (is_admin());

-- ============================================================
-- REALTIME
-- Enable realtime on the tables that need live updates
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE active_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE logs;
ALTER PUBLICATION supabase_realtime ADD TABLE installers;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE panels;
