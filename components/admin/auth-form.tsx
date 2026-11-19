'use client'

import { type FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

type AuthFormProps = { mode: 'sign-in' | 'sign-up'; nextPath?: string }

export function AuthForm({ mode, nextPath = '/admin' }: AuthFormProps) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    try {
      const result = mode === 'sign-in'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(form.get('name') ?? '').trim() })

      if (result.error) {
      setError(mode === 'sign-in' ? 'We couldn’t sign you in with those details.' : 'This account could not be created. Use the configured admin email and try again.')
        return
      }
      router.replace(nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/admin')
      router.refresh()
    } catch {
      setError('The authentication service could not be reached. Check the server configuration and try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-shell">
      <Link className="wordmark" href="/">
        <span className="wordmark-title"><span className="wordmark-the">The</span> Visionary Voice</span>
        <span className="wordmark-tagline">ADMINISTRATOR ACCESS</span>
      </Link>
      <section className="auth-card" aria-labelledby="auth-title">
        <span className="eyebrow">Private workspace</span>
        <h1 className="editorial" id="auth-title">{mode === 'sign-in' ? 'Welcome back.' : 'Set up your admin account.'}</h1>
        <p className="auth-description">{mode === 'sign-in' ? 'Sign in to manage your magazine, contacts and audience insights.' : 'Only the configured administrator email can create this account.'}</p>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'sign-up' && <label>Name<input name="name" autoComplete="name" required maxLength={120} /></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Password<div className="password-input-wrap"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={12} required /><button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={pending}>{pending ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create administrator account'}</button>
        </form>
        {mode === 'sign-in' ? <p className="auth-switch">First time? <Link href="/sign-up">Create the configured admin account</Link></p> : <p className="auth-switch"><Link href="/sign-in">Back to sign in</Link></p>}
      </section>
      <Link className="auth-back" href="/">← Return to the magazine</Link>
    </main>
  )
}
