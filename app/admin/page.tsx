import { AdminDashboard } from '@/components/admin/dashboard'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminDashboardData } from '@/lib/admin-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin | The Visionary Voice', robots: { index: false, follow: false } }
// Summaries are generated in the background after an upload (see after() in lib/actions/admin.ts);
// reading a large PDF with Gemini can take a few minutes.
export const maxDuration = 300

export default async function AdminPage(props: PageProps<'/admin'>) {
  const admin = await requireAdmin()
  const { panel, saved, tab } = await props.searchParams
  const data = await getAdminDashboardData(admin.id)
  // `?saved=<id>` comes from the edit page after a save, to confirm it.
  return <AdminDashboard userId={admin.id} email={admin.email} adminName={admin.name ?? ''} initialPanel={typeof panel === 'string' ? panel : undefined} initialTab={typeof tab === 'string' ? tab : undefined} savedIssueId={typeof saved === 'string' ? saved : undefined} {...data} />
}
