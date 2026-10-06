import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { Mandala } from '@/components/decor'

const links = [
  { href: '#craft', label: 'The Craft' },
  { href: '#studio', label: 'Studio' },
  { href: '#faq', label: 'FAQ' },
]

export default function Nav() {
  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      <nav className="vessel-soft flex w-full max-w-3xl items-center justify-between gap-4 rounded-full py-2 pl-3 pr-2 shadow-glow backdrop-blur-xl">
        <a href="#top" className="flex items-center gap-2.5">
          <Mandala size={34} strokeWidth={2.2} className="shrink-0 animate-spin-slower" />
          <span className="leading-none">
            <span className="block font-display text-lg font-semibold tracking-wide text-cream">
              Nexora
            </span>
            <span className="block font-mono text-[9px] uppercase tracking-[0.3em] text-sand">
              नेक्सोरा
            </span>
          </span>
        </a>

        <div className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-sand transition-colors duration-300 hover:bg-white/5 hover:text-gold"
            >
              {l.label}
            </a>
          ))}
        </div>

        <a
          href="#studio"
          className="group flex items-center gap-1.5 rounded-full bg-gradient-to-r from-saffron to-sindoor px-4 py-2 text-[13px] font-semibold text-ink transition-transform duration-300 hover:scale-[1.04] active:scale-95"
        >
          <Sparkles className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-12" />
          Open Studio
        </a>
      </nav>
    </motion.header>
  )
}
