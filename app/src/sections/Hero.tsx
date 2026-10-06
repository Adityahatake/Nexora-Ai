import { motion } from 'framer-motion'
import { ArrowDown, BookOpenText, FileText, MessagesSquare } from 'lucide-react'
import { Mandala, StitchDivider } from '@/components/decor'

const ease = [0.16, 1, 0.3, 1] as const

const ticker = ['Upload', 'Weave', 'Ask', 'Discover', 'पढ़ें', 'पूछें', 'जानें']

function TickerRow() {
  const row = [...ticker, ...ticker]
  return (
    <div className="flex w-max animate-marquee items-center">
      {[0, 1].map((half) => (
        <div key={half} className="flex items-center">
          {row.map((w, i) => (
            <span key={`${half}-${i}`} className="flex items-center">
              <span className="px-6 font-mono text-xs uppercase tracking-[0.35em] text-sand/80">{w}</span>
              <svg width="10" height="10" viewBox="-5 -5 10 10" aria-hidden="true">
                <path d="M 0 -4 L 4 0 L 0 4 L -4 0 Z" fill="none" stroke="#EE9B01" strokeWidth="1.2" />
              </svg>
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Floating mini preview of an answer, like a stitched patch. */
function PreviewPatch() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, rotate: 2 }}
      animate={{ opacity: 1, y: 0, rotate: -1.5 }}
      transition={{ duration: 1.1, delay: 0.7, ease }}
      className="vessel animate-float-soft relative mx-auto w-full max-w-sm rounded-2xl p-5 shadow-glow-lg backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <MessagesSquare className="h-4 w-4 text-saffron" />
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sand">Asked Nexora</p>
      </div>
      <p className="mt-3 font-display text-[15px] italic text-cream/95">
        “What does the author say about the river?”
      </p>
      <div className="my-3 h-px bg-gradient-to-r from-saffron/40 via-sindoor/30 to-transparent" />
      <p className="text-[13px] leading-relaxed text-cream/75">
        The river is described as a “silver ribbon threading the valley,” carrying both harvest and
        memory…
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-full border border-gold/40 px-2.5 py-0.5 font-mono text-[10px] text-gold">
          p. 47
        </span>
        <span className="rounded-full border border-rani/40 px-2.5 py-0.5 font-mono text-[10px] text-rani">
          4 chunks retrieved
        </span>
      </div>
    </motion.div>
  )
}

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-10 pt-36 sm:pt-44">
      {/* mandala halo behind the wordmark */}
      <Mandala
        size={760}
        className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 opacity-[0.13] animate-spin-slow"
      />

      <div className="relative mx-auto max-w-5xl px-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease }}
          className="label-stitch mx-auto flex w-max items-center gap-3"
        >
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-saffron" />
          RAG Book Assistant · crafted with Indian thread
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-saffron" />
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.12, ease }}
          className="display-tight mt-6 font-display font-semibold"
        >
          <span className="block text-[clamp(3.6rem,12vw,8.5rem)] text-gradient drop-shadow-[0_0_45px_rgba(238,155,1,0.25)]">
            Nexora
          </span>
          <span className="mt-1 block text-[clamp(1.4rem,3.4vw,2.6rem)] font-medium italic text-cream/90">
            where books speak back
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.26, ease }}
          className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-sand"
        >
          Upload any PDF and Nexora weaves it into a living thread of knowledge — chunked,
          embroidered into vectors, and ready to answer your questions with page-perfect citations.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.38, ease }}
          className="mt-9 flex flex-wrap items-center justify-center gap-4"
        >
          <a
            href="#studio"
            className="group flex items-center gap-2 rounded-full bg-gradient-to-r from-saffron via-sindoor to-rani px-7 py-3.5 text-sm font-semibold text-ink shadow-glow transition-transform duration-300 hover:scale-[1.05] active:scale-95"
          >
            <BookOpenText className="h-4 w-4 transition-transform duration-300 group-hover:-rotate-6" />
            Begin the weave
          </a>
          <a
            href="#craft"
            className="vessel-soft flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium text-cream/90 transition-colors duration-300 hover:text-gold"
          >
            <FileText className="h-4 w-4" />
            See the craft
          </a>
        </motion.div>

        {/* pipeline chips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.55 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.2em] text-sand/70"
        >
          <span>chunk 1000 / overlap 200</span>
          <span className="text-saffron">✦</span>
          <span>MMR retrieval · k = 4</span>
          <span className="text-saffron">✦</span>
          <span>Groq-speed answers</span>
        </motion.div>

        <StitchDivider className="mx-auto mt-12 max-w-xl opacity-80" />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.7 }}
          className="mt-10 flex justify-center"
        >
          <PreviewPatch />
        </motion.div>

        <motion.a
          href="#studio"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="mx-auto mt-12 flex w-max items-center gap-2 text-sand/60 transition-colors hover:text-gold"
        >
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span className="font-mono text-[10px] uppercase tracking-[0.3em]">scroll</span>
        </motion.a>
      </div>

      {/* ticker */}
      <div className="relative mt-14 overflow-hidden border-y border-saffron/15 py-3 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <TickerRow />
      </div>
    </section>
  )
}
