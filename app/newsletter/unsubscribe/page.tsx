import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { unsubscribe, validUnsubscribeToken } from '@/lib/newsletter'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Unsubscribe | The Visionary Voice', robots: { index: false, follow: false } }

/** Asks before unsubscribing, so a mail scanner opening the link does not unsubscribe anyone. */
export default async function UnsubscribePage(props: PageProps<'/newsletter/unsubscribe'>) {
  const { e, t, done } = await props.searchParams
  const email = typeof e === 'string' ? e.trim().toLowerCase() : ''
  const token = typeof t === 'string' ? t : ''
  const valid = Boolean(email && token && validUnsubscribeToken(email, token))

  async function confirm() {
    'use server'
    if (!valid) return
    await unsubscribe(email)
    redirect(`/newsletter/unsubscribe?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}&done=1`)
  }

  return <main className="auth-shell">
    <Link className="wordmark" href="/"><span className="wordmark-title"><span className="wordmark-the">The</span> Visionary Voice</span><span className="wordmark-tagline">NEWSLETTER</span></Link>
    <section className="auth-card" aria-labelledby="unsubscribe-title">
      {!valid
        ? <><span className="eyebrow">Unsubscribe</span><h1 className="editorial" id="unsubscribe-title">This link is not valid.</h1><p className="auth-description">Use the Unsubscribe link from one of our emails, or contact us and we will remove you.</p></>
        : done
          ? <><span className="eyebrow">Unsubscribed</span><h1 className="editorial" id="unsubscribe-title">You will not hear from us again.</h1><p className="auth-description"><strong>{email}</strong> has been removed from The Visionary Voice emails. You can subscribe again at any time from the site.</p></>
          : <><span className="eyebrow">Unsubscribe</span><h1 className="editorial" id="unsubscribe-title">Stop receiving our emails?</h1><p className="auth-description">We will stop sending new-edition emails to <strong>{email}</strong>.</p>
            <form action={confirm} className="auth-form"><button className="primary-button" type="submit">Unsubscribe</button></form></>}
    </section>
    <Link className="auth-back" href="/">← Return to the magazine</Link>
  </main>
}
