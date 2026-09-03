export type UserRole = 'user' | 'admin' | 'superadmin'

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'superadmin'
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === 'superadmin'
}
