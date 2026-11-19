import { AdminDashboard } from '@/components/admin/dashboard'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminDashboardData } from '@/lib/admin-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin | The Visionary Voice', robots: { index: false, follow: false } }

export default async function AdminPage() {
  const admin = await requireAdmin()
  const data = await getAdminDashboardData(admin.id)
  return <AdminDashboard userId={admin.id} email={admin.email} {...data} />
}
