export type Role = 'installer' | 'admin'
export type ProjectType = 'commercial' | 'colorchange'
export type JobType = 'Wrap' | 'Die-Cut' | 'Removal' | 'Other'

export interface Installer {
  id: string
  user_id: string | null
  name: string
  color: string
  birthday: string | null
  role: Role
  active: boolean
  created_at: string
}

export interface Project {
  id: string
  name: string
  project_type: ProjectType
  due_date: string | null
  celebrated: boolean
  archived: boolean
  created_at: string
  updated_at: string
  panels?: Panel[]
}

export interface Panel {
  id: string
  project_id: string
  name: string
  height_in: number | null
  width_in: number | null
  sort_order: number
  created_at: string
}

export interface ActiveJob {
  id: string
  installer_id: string
  project_id: string
  panel_id: string
  job_type: JobType
  is_color_change: boolean
  start_ts: string
  installer?: Installer
  project?: Project
  panel?: Panel
}

export interface Log {
  id: string
  installer_id: string | null
  project_id: string | null
  panel_id: string | null
  project_name: string
  panel_name: string
  installer_name: string | null
  job_type: JobType
  is_color_change: boolean
  height_in: number | null
  width_in: number | null
  start_ts: string
  finish_ts: string
  status: string
  created_at: string
  // computed
  installer?: Installer | null
  sqft: number | null
  mins: number | null
  sqftHr: number | null
}

export interface WarnConfig {
  title: string
  body: string
  ok: string
  cancel?: string
  danger?: boolean
  onOk?: () => void
}

export type ConditionType =
  | 'sqft_total'
  | 'sqft_cc'
  | 'panels'
  | 'panels_cc'
  | 'sqft_per_hr'
  | 'total_hours'
  | 'work_days'
  | 'sqft_single_day'
  | 'panels_single_day'
  | 'best_sqft_hr_day'
  | 'early_clock_in'
  | 'first_clock_in'
  | 'social_action'

export interface BountyCondition {
  id: string
  bounty_id: string
  condition_type: ConditionType
  operator: string
  value: number
  social_action_type?: string | null
  confirmed_by_installer_id?: string | null
  confirmed_at?: string | null
  created_at: string
}

export interface Bounty {
  id: string
  title: string
  reward: string
  start_date: string
  end_date: string | null
  active: boolean
  winner_installer_id: string | null
  paid: boolean
  paid_at: string | null
  created_at: string
  conditions?: BountyCondition[]
}

export interface InstallerStats {
  installer: Installer
  panels: number
  sqft: number
  mins: number
  avgSqftHr: number | null
  mpp: number | null
  pct: number
  favType: string
  projectCount: number
  longestPanel: Log | null
  fastestPanel: Log | null
  recentLogs: Log[]
}
