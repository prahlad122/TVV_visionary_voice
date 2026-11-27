'use client'

import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'

/**
 * The "Subscribe" button in page headers. Opens a small popup that takes an email address and
 * saves it (through /api/contacts, like the footer form) for new-edition emails.
 */
export function SubscribeButton({ className, label = 'Subscribe' }: { className: string; label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const id = useId()

  function open() {
    setStatus((current) => current === 'success' ? 'idle' : current)
    dialog.current?.showModal()
    requestAnimationFrame(() => input.current?.focus())
  }

  function close() {
    dialog.current?.close()
  }

  // Clicking the dimmed backdrop (outside the card) closes the popup.
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const onClick = (event: MouseEvent) => { if (event.target === element) element.close() }
    element.addEventListener('click', onClick)
    return () => element.removeEventListener('click', onClick)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setStatus('pending')
    setError('')
    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.get('email'),
          emailConsent: values.get('consent') === 'on',
          sourcePage: window.location.pathname,
          referrer: document.referrer,
          website: values.get('website'),
        }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'We could not subscribe you. Please try again.')
      form.reset()
      setStatus('success')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'We could not subscribe you. Please try again.')
      setStatus('error')
    }
  }

  return <>
    <button className={className} type="button" onClick={open} aria-haspopup="dialog">{label}</button>
    <dialog ref={dialog} className="subscribe-dialog" aria-labelledby={`${id}-title`}>
      <div className="subscribe-card">
        <button className="subscribe-close" type="button" onClick={close} aria-label="Close"><X aria-hidden="true" /></button>
        {status === 'success'
          ? <div className="subscribe-done" role="status">
            <span className="eyebrow">You are subscribed</span>
            <h2 className="editorial" id={`${id}-title`}>Thank you. Look out for our next edition.</h2>
            <p>We will email you when a new magazine edition or blog post is published. Every email has an unsubscribe link.</p>
            <button className="primary-button" type="button" onClick={close}>Continue reading</button>
          </div>
          : <form onSubmit={submit} noValidate={false}>
            <span className="eyebrow">The next perspective</span>
            <h2 className="editorial" id={`${id}-title`}>Good stories. In good company.</h2>
            <p>New editions, interviews and ideas worth your time, in your inbox.</p>
            <label className="subscribe-field" htmlFor={`${id}-email`}>Your email address</label>
            <input ref={input} className="subscribe-input" id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" />
            {/* Hidden from people; bots fill it in, and those submissions are ignored. */}
            <input className="subscribe-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <label className="subscribe-consent"><input name="consent" type="checkbox" required /> <span>I agree to receive emails about new editions and posts. Unsubscribe anytime.</span></label>
            {status === 'error' && <p className="subscribe-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={status === 'pending'}>{status === 'pending' ? 'Subscribing…' : 'Subscribe'} <span aria-hidden="true">→</span></button>
          </form>}
      </div>
    </dialog>
  </>
}
