import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AuthForm } from '@/components/admin/auth-form'

export const metadata = { title: 'Admin sign in | The Visionary Voice', robots: { index: false, follow: false } }

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user && session.user.email.toLowerCase() === process.env.ADMIN_EMAIL?.trim().toLowerCase()) redirect('/admin')
  const params = await searchParams
  return <AuthForm mode="sign-in" nextPath={params.next} />
}
