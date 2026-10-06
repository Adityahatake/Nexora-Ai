import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { StitchDivider } from '@/components/decor'

const ease = [0.16, 1, 0.3, 1] as const

const faqs = [
  {
    q: 'What exactly is Nexora?',
    a: 'Nexora is a retrieval-augmented generation studio for books. You upload a PDF, it builds a searchable tapestry of the text, and then answers your questions strictly from that document — with page citations.',
  },
  {
    q: 'How does the “weaving” work?',
    a: 'Your PDF is read page by page, split into 1000-character threads with 200 characters of overlap so no thought is cut mid-sentence, then embedded into vectors and stored. At question time, MMR retrieval selects the four most relevant threads.',
  },
  {
    q: 'Will it answer things outside my book?',
    a: 'No. Nexora is bound to the page — if an answer is not present in the document, it plainly says: “I could not find the answer in the document.”',
  },
  {
    q: 'Where does my book go?',
    a: 'In this demo studio, everything happens inside your browser — parsing, chunking and retrieval never leave your device. In the full setup, files flow to your own FastAPI + Chroma backend.',
  },
  {
    q: 'What powers the full pipeline?',
    a: 'The production weave uses OpenAI text-embedding-3-small for vectors, Chroma as the tapestry store, and a Groq-hosted LLM for the final generative answer.',
  },
]

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 1, ease }}
          className="text-center"
        >
          <p className="label-stitch">Questions · प्रश्न</p>
          <h2 className="display-tight mt-4 font-display text-4xl font-semibold sm:text-5xl">
            Threads of <span className="text-gradient-gold">curiosity</span>
          </h2>
          <StitchDivider className="mx-auto mt-8 max-w-md opacity-70" />
        </motion.div>

        <div className="mt-12">
          {faqs.map((f, i) => {
            const isOpen = open === i
            return (
              <motion.div
                key={f.q}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.8, delay: i * 0.08, ease }}
                className="border-b border-saffron/15"
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center gap-4 py-6 text-left"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-500 ${
                      isOpen
                        ? 'rotate-[135deg] border-sindoor/60 bg-sindoor/15 text-sindoor'
                        : 'border-saffron/40 text-saffron'
                    }`}
                  >
                    <Plus className="h-4 w-4" />
                  </span>
                  <span
                    className={`font-display text-lg font-medium transition-colors duration-300 ${
                      isOpen ? 'text-gradient-gold' : 'text-cream/90'
                    }`}
                  >
                    {f.q}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.5, ease }}
                      className="overflow-hidden"
                    >
                      <p className="pb-7 pl-12 pr-4 text-sm leading-relaxed text-sand">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
