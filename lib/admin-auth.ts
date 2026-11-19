import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export async function getAdminUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  const allowedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  if (!session?.user || !allowedEmail || session.user.email.toLowerCase() !== allowedEmail) return null
  return session.user
}

export async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) redirect('/sign-in?next=/admin')
  return user
}

export async function requireAdminAction() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
  return user
}
