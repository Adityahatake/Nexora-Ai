import { Heart } from 'lucide-react'
import { Mandala, PaisleyBand } from '@/components/decor'

export default function Footer() {
  return (
    <footer className="relative mt-10">
      <PaisleyBand className="opacity-70" />
      <div className="border-t border-saffron/10 py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 text-center">
          <Mandala size={84} className="animate-spin-slower opacity-80" />
          <p className="font-display text-2xl font-semibold">
            <span className="text-gradient">Nexora</span>
          </p>
          <p className="max-w-md text-sm leading-relaxed text-sand">
            A book is a woven thing. Nexora simply hands you the other end of the thread.
          </p>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-sand/70">
            woven with <Heart className="h-3 w-3 fill-sindoor text-sindoor" /> and Indian craft
          </p>
          <p className="font-mono text-[10px] tracking-[0.2em] text-sand/40">
            RAG · CHROMA · GROQ · OPENAI EMBEDDINGS
          </p>
        </div>
      </div>
      <PaisleyBand flip className="opacity-40" />
    </footer>
  )
}
