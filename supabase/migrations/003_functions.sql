-- ============================================================
-- clock_out: atomic delete active_job + insert log
-- ============================================================
CREATE OR REPLACE FUNCTION clock_out(
  p_installer_id UUID,
  p_finish_ts    TIMESTAMPTZ
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_job     active_jobs%ROWTYPE;
  v_panel   panels%ROWTYPE;
  v_project projects%ROWTYPE;
  v_installer installers%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM active_jobs WHERE installer_id = p_installer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active job for installer %', p_installer_id; END IF;
  IF p_finish_ts <= v_job.start_ts THEN RAISE EXCEPTION 'Finish must be after start'; END IF;

  SELECT * INTO v_panel    FROM panels    WHERE id = v_job.panel_id;
  SELECT * INTO v_project  FROM projects  WHERE id = v_job.project_id;
  SELECT * INTO v_installer FROM installers WHERE id = p_installer_id;

  INSERT INTO logs (
    installer_id, project_id, panel_id,
    project_name, panel_name, installer_name,
    job_type, is_color_change,
    height_in, width_in,
    start_ts, finish_ts, status
  ) VALUES (
    p_installer_id, v_job.project_id, v_job.panel_id,
    v_project.name, v_panel.name, v_installer.name,
    v_job.job_type, v_job.is_color_change,
    v_panel.height_in, v_panel.width_in,
    v_job.start_ts, p_finish_ts, 'Complete'
  );

  DELETE FROM active_jobs WHERE installer_id = p_installer_id;
END;
$$;

-- ============================================================
-- insert_manual_log
-- ============================================================
CREATE OR REPLACE FUNCTION insert_manual_log(
  p_installer_id    UUID,
  p_project_id      UUID,
  p_panel_id        UUID,
  p_job_type        TEXT,
  p_is_color_change BOOLEAN,
  p_start_ts        TIMESTAMPTZ,
  p_finish_ts       TIMESTAMPTZ
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_panel    panels%ROWTYPE;
  v_project  projects%ROWTYPE;
  v_installer installers%ROWTYPE;
  v_log_id   UUID;
BEGIN
  IF p_finish_ts <= p_start_ts THEN RAISE EXCEPTION 'Finish must be after start'; END IF;
  SELECT * INTO v_panel    FROM panels    WHERE id = p_panel_id;
  SELECT * INTO v_project  FROM projects  WHERE id = p_project_id;
  SELECT * INTO v_installer FROM installers WHERE id = p_installer_id;

  INSERT INTO logs (
    installer_id, project_id, panel_id,
    project_name, panel_name, installer_name,
    job_type, is_color_change,
    height_in, width_in,
    start_ts, finish_ts, status
  ) VALUES (
    p_installer_id, p_project_id, p_panel_id,
    v_project.name, v_panel.name, v_installer.name,
    p_job_type, p_is_color_change,
    v_panel.height_in, v_panel.width_in,
    p_start_ts, p_finish_ts, 'Complete'
  ) RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$;

-- ============================================================
-- check_and_celebrate: called after clock_out to set celebrated flag
-- ============================================================
CREATE OR REPLACE FUNCTION check_and_celebrate(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_panels INTEGER;
  v_done_panels  INTEGER;
  v_already      BOOLEAN;
BEGIN
  SELECT celebrated INTO v_already FROM projects WHERE id = p_project_id;
  IF v_already THEN RETURN FALSE; END IF;

  SELECT COUNT(*) INTO v_total_panels FROM panels WHERE project_id = p_project_id;
  IF v_total_panels = 0 THEN RETURN FALSE; END IF;

  SELECT COUNT(DISTINCT panel_id) INTO v_done_panels
  FROM logs
  WHERE project_id = p_project_id AND status = 'Complete' AND panel_id IS NOT NULL;

  IF v_done_panels >= v_total_panels THEN
    UPDATE projects SET celebrated = TRUE WHERE id = p_project_id;
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$$;

-- ============================================================
-- reset_celebration: called when panels are added to a project
-- ============================================================
CREATE OR REPLACE FUNCTION reset_celebration_if_incomplete(p_project_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_panels INTEGER;
  v_done_panels  INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_panels FROM panels WHERE project_id = p_project_id;
  SELECT COUNT(DISTINCT panel_id) INTO v_done_panels
  FROM logs WHERE project_id = p_project_id AND status = 'Complete' AND panel_id IS NOT NULL;

  IF v_done_panels < v_total_panels THEN
    UPDATE projects SET celebrated = FALSE WHERE id = p_project_id;
  END IF;
END;
$$;
