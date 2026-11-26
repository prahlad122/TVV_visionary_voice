import Link from 'next/link'

type SiteHeaderProps = {
  active: 'home' | 'magazine' | 'about'
}

const navItems = [
  { href: '/', label: 'Home', key: 'home' },
  { href: '/magazine', label: 'Magazine', key: 'magazine' },
  { href: '/blog', label: 'Blog', key: 'blog' },
  { href: '/about', label: 'About Us', key: 'about' },
] as const

export function SiteHeader({ active }: SiteHeaderProps) {
  return (
    <header className="container site-header">
      <Link className="wordmark" href="/" aria-label="The Visionary Voice home">
        <span className="wordmark-title"><span className="wordmark-the">The</span> Visionary Voice</span>
        <span className="wordmark-tagline">THE WORLD OF BUSINESS, IN PERSPECTIVE</span>
      </Link>
      <nav className="site-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <Link
            aria-current={active === item.key ? 'page' : undefined}
            className="nav-link"
            href={item.href}
            key={item.key}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
