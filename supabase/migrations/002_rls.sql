ALTER TABLE installers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE panels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs        ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM installers
    WHERE user_id = auth.uid() AND role = 'admin' AND active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION my_installer_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM installers WHERE user_id = auth.uid() AND active = TRUE LIMIT 1;
$$;

-- INSTALLERS
CREATE POLICY "installers_select" ON installers FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "installers_update_self" ON installers FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());
CREATE POLICY "installers_delete" ON installers FOR DELETE TO authenticated USING (is_admin());

-- PROJECTS
CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated USING (is_admin());

-- PANELS
CREATE POLICY "panels_select" ON panels FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "panels_insert" ON panels FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "panels_update" ON panels FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "panels_delete" ON panels FOR DELETE TO authenticated USING (is_admin());

-- ACTIVE JOBS
CREATE POLICY "active_jobs_select" ON active_jobs FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "active_jobs_insert" ON active_jobs FOR INSERT TO authenticated
  WITH CHECK (installer_id = my_installer_id() OR is_admin());
CREATE POLICY "active_jobs_delete" ON active_jobs FOR DELETE TO authenticated
  USING (installer_id = my_installer_id() OR is_admin());

-- LOGS
CREATE POLICY "logs_select" ON logs FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "logs_insert" ON logs FOR INSERT TO authenticated
  WITH CHECK (installer_id = my_installer_id() OR is_admin());
CREATE POLICY "logs_delete" ON logs FOR DELETE TO authenticated USING (is_admin());
