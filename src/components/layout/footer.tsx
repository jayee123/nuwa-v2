import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

const PRODUCT_LINKS = [
  { href: '/', label: '課程總覽' },
  { href: '/subscribe', label: '訂閱方案' },
  { href: '#', label: 'AI 家教' },
]

const SUPPORT_LINKS = [
  { href: '/faq', label: '常見問題' },
  { href: '#', label: '聯絡我們' },
  { href: '/refund', label: '退費政策' },
]

const LEGAL_LINKS = [
  { href: '/terms', label: '服務條款' },
  { href: '/privacy', label: '隱私政策' },
]

export function Footer() {
  return (
    <footer className="border-t border-surface-secondary bg-surface-inverse text-fg-inverse">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <Logo variant="white" href="/" />
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              羽升幸福養成學苑 — 成為更好的自己
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="mb-4 text-sm font-medium">產品</h4>
            <ul className="space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="mb-4 text-sm font-medium">支援</h4>
            <ul className="space-y-2.5">
              {SUPPORT_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="mb-4 text-sm font-medium">法律</h4>
            <ul className="space-y-2.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-white/40">
          &copy; {new Date().getFullYear()} 羽升幸福養成學苑. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
