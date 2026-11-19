'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

const consentName = 'vv_analytics_consent'

function hasConsent() {
  return document.cookie.split('; ').some((item) => item === `${consentName}=accepted`)
}

function sendPageView(pathname: string) {
  if (!hasConsent()) return
  const search = new URLSearchParams(window.location.search)
  const payload = {
    pagePath: pathname,
    referrer: document.referrer,
    utmSource: search.get('utm_source') ?? '',
    utmMedium: search.get('utm_medium') ?? '',
    utmCampaign: search.get('utm_campaign') ?? '',
  }
  const body = JSON.stringify(payload)
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics', new Blob([body], { type: 'application/json' }))
  } else {
    void fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
  }
}

export function AnalyticsTracker() {
  const pathname = usePathname()
  const lastTracked = useRef('')

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin') || pathname === '/sign-in' || pathname === '/sign-up' || lastTracked.current === pathname) return
    const track = () => {
      if (!hasConsent()) return
      lastTracked.current = pathname
      sendPageView(pathname)
    }
    track()
    window.addEventListener('vv-analytics-consent', track)
    return () => window.removeEventListener('vv-analytics-consent', track)
  }, [pathname])

  return null
}

export function AnalyticsConsent() {
  const pathname = usePathname()
  const onReader = pathname?.startsWith('/read/') ?? false
  const [choice, setChoice] = useState<'unknown' | 'accepted' | 'rejected'>('unknown')

  useEffect(() => {
    const value = document.cookie.split('; ').find((item) => item.startsWith(`${consentName}=`))?.split('=')[1]
    if (value === 'accepted' || value === 'rejected') setChoice(value)
  }, [])

  function choose(value: 'accepted' | 'rejected') {
    document.cookie = `${consentName}=${value}; Path=/; Max-Age=15552000; SameSite=Lax; Secure`
    setChoice(value)
    if (value === 'accepted') window.dispatchEvent(new Event('vv-analytics-consent'))
  }

  return <>
    {!onReader && choice !== 'unknown' && <button className="consent-settings" onClick={() => setChoice('unknown')}>Privacy settings</button>}
    {!onReader && choice === 'unknown' && <aside className="consent-banner" aria-label="Analytics consent">
      <div><strong>Help us understand what readers find useful.</strong><p>Optional, privacy-conscious analytics count page views and broad traffic sources only after you agree. We don’t store raw IP addresses.</p></div>
      <div className="consent-actions"><button className="secondary-button" onClick={() => choose('rejected')}>Decline</button><button className="primary-button" onClick={() => choose('accepted')}>Allow analytics</button></div>
    </aside>}
    <AnalyticsTracker />
  </>
}
