import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AuthForm } from '@/components/admin/auth-form'

export const metadata = { title: 'Admin account setup | The Visionary Voice', robots: { index: false, follow: false } }

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user && session.user.email.toLowerCase() === process.env.ADMIN_EMAIL?.trim().toLowerCase()) redirect('/admin')
  return <AuthForm mode="sign-up" />
}
