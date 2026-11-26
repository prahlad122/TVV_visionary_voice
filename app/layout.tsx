import type { Metadata, Viewport } from 'next'
import { AnalyticsConsent } from '@/components/analytics-consent'
import { NavigationProgress } from '@/components/navigation-progress'
import './globals.css'

export const metadata: Metadata = {
  title: 'The Visionary Voice | Ideas. Leadership. Impact.',
  description: 'Fresh perspectives on business, through the leaders and organizations shaping it.',
  applicationName: 'The Visionary Voice',
  openGraph: {
    type: 'website',
    siteName: 'The Visionary Voice',
    title: 'The Visionary Voice | Ideas. Leadership. Impact.',
    description: 'Global business perspectives on leadership, innovation and the people shaping industries.',
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#F8F7F3',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <NavigationProgress />
        <AnalyticsConsent />
      </body>
    </html>
  )
}
