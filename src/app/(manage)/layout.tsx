import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'
import { ManageSidebar } from '@/components/manage/manage-sidebar'

export default async function ManageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check admin role
  const admin = createAdminClient()
  const { data: userData } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!isAdminRole(userData?.role)) redirect('/dashboard')

  return (
    <div className="flex min-h-screen">
      <ManageSidebar />
      <main className="min-w-0 flex-1 bg-surface-primary">
        <div className="px-8 py-6">{children}</div>
      </main>
    </div>
  )
}
