import { Header } from '@/components/layout/header'
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-surface-primary">
      <Header />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 lg:flex-row lg:px-8">
        <DashboardSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
