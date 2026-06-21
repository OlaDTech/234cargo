export const PERMISSIONS = [
  'dashboard',
  'clients',
  'goods',
  'scan',
  'containers',
  'receipts',
  'finance',
  'messages',
  'purchases',
]

export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'warehouse_manager', label: 'Warehouse Manager' },
]

export const DEFAULT_PERMISSIONS_BY_ROLE = {
  admin: PERMISSIONS,
  staff: ['dashboard', 'clients', 'goods', 'scan', 'receipts', 'messages', 'purchases'],
  warehouse_manager: ['dashboard', 'goods', 'scan', 'containers'],
}

export function roleLabel(role) {
  return ROLE_OPTIONS.find(option => option.value === role)?.label || 'Staff'
}
