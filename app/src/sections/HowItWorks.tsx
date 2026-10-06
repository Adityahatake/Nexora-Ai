import { motion } from 'framer-motion'
import { BookUp2, MessagesSquare, Waypoints } from 'lucide-react'
import { StitchDivider } from '@/components/decor'

const ease = [0.16, 1, 0.3, 1] as const

const steps = [
  {
    n: '०१',
    icon: BookUp2,
    title: 'Offer your book',
    body: 'Drop in any PDF — a novel, a thesis, a manual. Nexora reads every page with care, the way a scribe unrolls a manuscript.',
    chip: 'PyPDFLoader',
  },
  {
    n: '०२',
    icon: Waypoints,
    title: 'Weave the index',
    body: 'The text is split into 1000-character threads with 200 characters of overlap, then embroidered into a vector tapestry of meaning.',
    chip: 'Chroma · OpenAI embeddings',
  },
  {
    n: '०३',
    icon: MessagesSquare,
    title: 'Converse & discover',
    body: 'Ask in plain words. MMR retrieval pulls the four richest passages and the answer returns, stitched to its page numbers.',
    chip: 'MMR · k = 4 · Groq',
  },
]

export default function HowItWorks() {
  return (
    <section id="craft" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 1, ease }}
          className="text-center"
        >
          <p className="label-stitch">The Craft · कारीगरी</p>
          <h2 className="display-tight mt-4 font-display text-4xl font-semibold sm:text-5xl">
            Three motions of the <span className="text-gradient-gold">loom</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-sand">
            The same pipeline as your Python backend — rendered here with a little more zari and
            zardozi.
          </p>
          <StitchDivider className="mx-auto mt-8 max-w-md opacity-70" />
        </motion.div>

        <div className="relative mt-16 grid gap-6 md:grid-cols-3">
          {/* connecting stitched thread */}
          <svg
            className="pointer-events-none absolute -top-3 left-0 hidden h-6 w-full md:block"
            preserveAspectRatio="none"
            viewBox="0 0 1000 24"
            aria-hidden="true"
          >
            <path
              d="M 40 12 H 960"
              fill="none"
              stroke="#E8B54D"
              strokeWidth="1.4"
              strokeDasharray="0.1 8"
              strokeLinecap="round"
              opacity="0.5"
            />
          </svg>

          {steps.map((s, i) => (
            <motion.article
              key={s.n}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.9, delay: i * 0.15, ease }}
              className={`vessel group relative p-7 backdrop-blur-sm transition-transform duration-500 hover:-translate-y-1.5 ${
                i % 2 === 0
                  ? 'rounded-tl-[2.75rem] rounded-br-[2.75rem] rounded-tr-xl rounded-bl-xl'
                  : 'rounded-tr-[2.75rem] rounded-bl-[2.75rem] rounded-tl-xl rounded-br-xl'
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="font-display text-4xl font-semibold text-gradient">{s.n}</span>
                <span className="rounded-full border border-saffron/30 bg-saffron/10 p-3 text-saffron transition-colors duration-500 group-hover:border-saffron/60 group-hover:text-gold">
                  <s.icon className="h-5 w-5" />
                </span>
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold text-cream">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-sand">{s.body}</p>
              <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.25em] text-saffron/80">
                {s.chip}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}
