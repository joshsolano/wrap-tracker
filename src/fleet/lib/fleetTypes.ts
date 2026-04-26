export type FleetRole = 'admin' | 'manager' | 'remover' | 'installer' | 'qc'

export type VehicleStatus =
  | 'not_started'
  | 'removing'
  | 'removal_complete'
  | 'ready_for_install'
  | 'installing'
  | 'install_complete'
  | 'qc'
  | 'completed'
  | 'flagged'

export type PhotoType =
  | 'before_front'
  | 'before_driver'
  | 'before_passenger'
  | 'before_rear'
  | 'before_damage'
  | 'after_front'
  | 'after_driver'
  | 'after_passenger'
  | 'after_rear'
  | 'vin_sticker'
  | 'tire_size'

export interface FleetUser {
  id: string
  user_id: string | null
  email: string | null
  name: string
  phone: string | null
  role: FleetRole
  active: boolean
  created_at: string
}

export interface FleetJob {
  id: string
  name: string
  customer: string
  location: string | null
  start_date: string | null
  target_end_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface FleetVehicle {
  id: string
  fleet_job_id: string
  vin: string
  unit_number: string | null
  year: string | null
  make: string | null
  model: string | null
  vehicle_type: string | null
  department: string | null
  location: string | null
  notes: string | null
  status: VehicleStatus
  flagged: boolean
  flag_reason: string | null
  created_at: string
}

export interface FleetVehiclePhoto {
  id: string
  vehicle_id: string
  fleet_job_id: string
  photo_type: PhotoType
  storage_path: string
  uploaded_by: string | null
  created_at: string
  publicUrl?: string
}

export interface FleetTimeLog {
  id: string
  vehicle_id: string
  fleet_user_id: string | null
  log_type: 'removal' | 'install'
  start_ts: string | null
  end_ts: string | null
  notes: string | null
  created_at: string
  fleet_user?: FleetUser
}

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  not_started: 'Not Started',
  removing: 'Removing',
  removal_complete: 'Removal Done',
  ready_for_install: 'Ready to Install',
  installing: 'Installing',
  install_complete: 'Install Done',
  qc: 'QC Review',
  completed: 'Complete',
  flagged: 'Flagged',
}

export const STATUS_COLOR: Record<VehicleStatus, string> = {
  not_started: '#6B7280',
  removing: '#F97316',
  removal_complete: '#3B82F6',
  ready_for_install: '#06B6D4',
  installing: '#8B5CF6',
  install_complete: '#6366F1',
  qc: '#A855F7',
  completed: '#22C55E',
  flagged: '#EF4444',
}

export const PHOTO_LABEL: Record<PhotoType, string> = {
  before_front: 'Front',
  before_driver: 'Driver Side',
  before_passenger: 'Pass. Side',
  before_rear: 'Rear',
  before_damage: 'Damage',
  after_front: 'Front',
  after_driver: 'Driver Side',
  after_passenger: 'Pass. Side',
  after_rear: 'Rear',
  vin_sticker: 'VIN Sticker',
  tire_size: 'Tire Size',
}

export const REQUIRED_BEFORE: PhotoType[] = ['before_front', 'before_driver', 'before_passenger', 'before_rear']
export const REQUIRED_AFTER: PhotoType[] = ['after_front', 'after_driver', 'after_passenger', 'after_rear', 'vin_sticker', 'tire_size']
