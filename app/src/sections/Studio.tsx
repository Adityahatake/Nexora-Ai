import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpenText,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  RefreshCcw,
  Send,
  Sparkles,
  UploadCloud,
  Server,
  Key,
  Target,
} from 'lucide-react'
import { Mandala, StitchDivider } from '@/components/decor'
import { buildBook, composeAnswer, extractPages, type Answer, type BookDoc } from '@/lib/rag'
import QuizArena from '@/components/quiz/QuizArena'
import {
  getBackendStatus,
  uploadBookBackend,
  indexBookBackend,
  askBackend,
  type BackendStatus,
} from '@/lib/apiClient'

const ease = [0.16, 1, 0.3, 1] as const

type Msg = {
  id: number
  role: 'user' | 'nexora'
  text: string
  answer?: Answer
}

const WEAVE_STAGES = [
  'Splitting pages into 1000-char threads',
  'Carrying 200-char overlap across seams',
  'Embroidering threads into the Chroma tapestry',
]

const SUGGESTIONS = [
  'What is this book about?',
  'Summarize the main argument',
  'Who are the key characters?',
]

function fmtSize(bytes: number) {
  if (bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/* ------------------------------ typing ------------------------------ */

function useTypewriter(text: string, active: boolean) {
  const [shown, setShown] = useState(active ? '' : text)
  useEffect(() => {
    if (!active) {
      setShown(text)
      return
    }
    setShown('')
    let i = 0
    const step = Math.max(1, Math.round(text.length / 220))
    const t = window.setInterval(() => {
      i += step
      setShown(text.slice(0, i))
      if (i >= text.length) window.clearInterval(t)
    }, 16)
    return () => window.clearInterval(t)
  }, [text, active])
  return shown
}

function AnswerBody({ msg, fresh }: { msg: Msg; fresh: boolean }) {
  const shown = useTypewriter(msg.text, fresh)
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-cream/90">
      {shown}
      {fresh && shown.length < msg.text.length && (
        <span className="ml-0.5 inline-block h-3.5 w-[7px] animate-caret-blink bg-saffron align-middle" />
      )}
    </p>
  )
}

/* ------------------------------ studio ------------------------------ */

export default function Studio() {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null)
  const [book, setBook] = useState<BookDoc | null>(null)
  const [weaveStage, setWeaveStage] = useState<number | null>(null)
  const [woven, setWoven] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [backend, setBackend] = useState<BackendStatus | null>(null)
  const [backendChecked, setBackendChecked] = useState(false)

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [asking, setAsking] = useState(false)
  const [freshId, setFreshId] = useState<number | null>(null)
  const [openCtx, setOpenCtx] = useState<number | null>(null)
  const [studioTab, setStudioTab] = useState<'chat' | 'quiz'>('chat')

  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)

  const busy = reading !== null || weaveStage !== null

  // Check backend health & status on mount
  const refreshBackend = useCallback(async () => {
    const status = await getBackendStatus()
    setBackend(status)
    setBackendChecked(true)
    if (status && status.chunks_count > 0) {
      setWoven(true)
      setBook((prev) => {
        if (prev) return prev
        const doc = status.current_document
        return {
          name: doc?.filename || 'Existing Chroma Tapestry',
          size: doc?.size || 0,
          pages: doc?.pages || Math.max(1, Math.ceil(status.chunks_count / 4)),
          characters: doc?.characters || status.chunks_count * 800,
          chunks: new Array(status.chunks_count).fill(0).map((_, i) => ({ id: i, text: '', page: 0 })),
          docId: doc?.docId,
        }
      })
    }
  }, [])

  useEffect(() => {
    void refreshBackend()
  }, [refreshBackend])

  const accept = useCallback(
    async (f: File) => {
      setError(null)
      setWoven(false)
      setMessages([])
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
        setError('Only PDF manuscripts, please — a .pdf file.')
        return
      }
      setFile(f)
      setReading({ done: 0, total: 1 })

      // First try sending to FastAPI backend
      try {
        const beRes = await uploadBookBackend(f)
        setBook({
          name: beRes.filename,
          size: beRes.size,
          pages: beRes.pages,
          characters: beRes.characters,
          chunks: new Array(beRes.chunks).fill(0).map((_, i) => ({ id: i, text: '', page: 0 })),
          docId: beRes.docId,
        })
        setReading(null)
        void refreshBackend()
        return
      } catch (beErr) {
        console.warn('Backend upload fell back to client-side extraction:', beErr)
      }

      // Fallback: client-side pdf extraction
      try {
        const { pages } = await extractPages(f, (done, total) => setReading({ done, total }))
        const built = buildBook(f.name, f.size, pages)
        if (!built.chunks.length) {
          setError('No readable text found in the PDF.')
          setBook(null)
        } else {
          setBook(built)
        }
      } catch {
        setError('This PDF could not be read — it may be scanned or protected.')
        setBook(null)
      } finally {
        setReading(null)
      }
    },
    [refreshBackend],
  )

  const weave = useCallback(async () => {
    if (!book || busy) return
    setWeaveStage(0)
    let stage = 0
    const tickTimer = window.setInterval(() => {
      stage += 1
      if (stage < WEAVE_STAGES.length) {
        setWeaveStage(stage)
      }
    }, 850)

    try {
      if (book.docId) {
        await indexBookBackend(book.docId)
        window.clearInterval(tickTimer)
        setWeaveStage(WEAVE_STAGES.length - 1)
        window.setTimeout(() => {
          setWeaveStage(null)
          setWoven(true)
          void refreshBackend()
        }, 500)
        return
      }
    } catch (err: any) {
      console.warn('Backend indexing failed, falling back to client-side:', err)
      setError(err.message || 'Backend indexing error')
    }

    // Client-side simulation fallback
    const tick = () => {
      stage += 1
      if (stage < WEAVE_STAGES.length) {
        setWeaveStage(stage)
        window.setTimeout(tick, 850)
      } else {
        window.setTimeout(() => {
          window.clearInterval(tickTimer)
          setWeaveStage(null)
          setWoven(true)
        }, 650)
      }
    }
    window.setTimeout(tick, 850)
  }, [book, busy, refreshBackend])

  const ask = useCallback(
    async (q: string) => {
      const question = q.trim()
      if (!question || !book || !woven || asking) return
      setInput('')
      setAsking(true)
      const uid = ++idRef.current
      setMessages((m) => [...m, { id: uid, role: 'user', text: question }])

      // Try FastAPI backend first
      if (backend) {
        try {
          const answer = await askBackend(book.docId, question)
          const aid = ++idRef.current
          setMessages((m) => [...m, { id: aid, role: 'nexora', text: answer.text, answer }])
          setFreshId(aid)
          setAsking(false)
          return
        } catch (beErr: any) {
          console.warn('Backend ask error:', beErr)
          // If error is related to missing keys or server error, display helpful message
          const msg = beErr?.message || 'Server error'
          const aid = ++idRef.current
          setMessages((m) => [
            ...m,
            {
              id: aid,
              role: 'nexora',
              text: `⚠️ ${msg}`,
              answer: { text: msg, found: false, retrieved: [] },
            },
          ])
          setFreshId(aid)
          setAsking(false)
          return
        }
      }

      // Fallback: client-side demo composition
      window.setTimeout(
        () => {
          const answer = composeAnswer(book, question)
          const aid = ++idRef.current
          setMessages((m) => [...m, { id: aid, role: 'nexora', text: answer.text, answer }])
          setFreshId(aid)
          setAsking(false)
        },
        900 + Math.random() * 600,
      )
    },
    [book, woven, asking, backend],
  )

  const handleOpenChatWithPrompt = useCallback(
    (prompt: string) => {
      setStudioTab('chat')
      setInput(prompt)
      window.setTimeout(() => {
        void ask(prompt)
      }, 250)
    },
    [ask],
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, asking])

  const stats = useMemo(
    () =>
      book
        ? [
            { k: 'Pages', v: String(book.pages) },
            { k: 'Size', v: fmtSize(book.size) },
            { k: 'Characters', v: book.characters.toLocaleString() },
            { k: woven ? 'Threads woven' : 'Threads ready', v: String(book.chunks.length) },
          ]
        : [],
    [book, woven],
  )

  return (
    <section id="studio" className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 1, ease }}
          className="text-center"
        >
          <p className="label-stitch">The Studio · कार्यशाला</p>
          <h2 className="display-tight mt-4 font-display text-4xl font-semibold sm:text-5xl">
            Weave a book, <span className="text-gradient">then converse</span>
          </h2>

          {/* Backend Connection Indicator Badge */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {backend ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-peacock/40 bg-peacock/10 px-3.5 py-1 text-xs text-peacock">
                <span className="h-2 w-2 rounded-full bg-peacock animate-pulse" />
                <span>FastAPI Backend Live</span>
                <span className="text-sand/50">·</span>
                <span>Chroma DB ({backend.chunks_count} threads)</span>
                <span className="text-sand/50">·</span>
                <span>Groq LLM</span>
              </span>
            ) : backendChecked ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-saffron/30 bg-saffron/10 px-3.5 py-1 text-xs text-saffron">
                <Server className="h-3 w-3" />
                <span>Client Weaver Mode · Run &apos;python app.py&apos; to connect live backend</span>
              </span>
            ) : null}

            {backend && (!backend.has_openai_key || !backend.has_groq_key) && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sindoor/40 bg-sindoor/10 px-3 py-1 text-xs text-sindoor">
                <Key className="h-3 w-3" />
                <span>
                  Missing in .env:{' '}
                  {[
                    !backend.has_openai_key && 'OPENAI_API_KEY',
                    !backend.has_groq_key && 'GROQ_API_KEY',
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </span>
            )}
          </div>

          <StitchDivider className="mx-auto mt-8 max-w-md opacity-70" />
        </motion.div>

        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* ------------------------- left: upload & weave ------------------------- */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.9, ease }}
            className="flex flex-col gap-6"
          >
            {/* dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const f = e.dataTransfer.files?.[0]
                if (f) void accept(f)
              }}
              onClick={() => inputRef.current?.click()}
              className={`vessel group relative cursor-pointer overflow-hidden rounded-[2rem] p-10 text-center transition-all duration-500 ${
                dragging ? 'scale-[1.02] shadow-glow' : 'hover:shadow-glow'
              }`}
            >
              {/* stitched inner frame */}
              <svg className="pointer-events-none absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)]" aria-hidden="true">
                <rect
                  x="1"
                  y="1"
                  width="calc(100% - 2px)"
                  height="calc(100% - 2px)"
                  rx="22"
                  fill="none"
                  stroke={dragging ? '#EE9B01' : '#E8B54D'}
                  strokeOpacity={dragging ? 0.9 : 0.4}
                  strokeWidth="1.5"
                  strokeDasharray="0.1 8"
                  strokeLinecap="round"
                />
              </svg>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void accept(f)
                  e.target.value = ''
                }}
              />
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-saffron/40 bg-saffron/10 text-saffron transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">
                {busy && reading ? (
                  <Loader2 className="h-7 w-7 animate-spin" />
                ) : (
                  <UploadCloud className="h-7 w-7" />
                )}
              </div>
              <p className="mt-5 font-display text-xl font-semibold text-cream">
                {reading
                  ? `Reading pages… ${reading.done}/${reading.total}`
                  : file
                    ? file.name
                    : book?.name
                      ? book.name
                      : 'Offer a PDF to the loom'}
              </p>
              <p className="mt-2 text-sm text-sand">
                {reading
                  ? 'Unrolling and parsing your manuscript'
                  : 'Drag & drop, or click to browse — novels, theses, manuals'}
              </p>
              {reading && (
                <div className="mx-auto mt-5 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="thread-shimmer h-full rounded-full bg-gradient-to-r from-saffron to-sindoor transition-all duration-300"
                    style={{ width: `${Math.round((reading.done / reading.total) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            {error && (
              <p className="vessel-soft rounded-xl px-4 py-3 text-center text-sm text-sindoor">
                {error}
              </p>
            )}

            {/* document card */}
            <AnimatePresence>
              {book && (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.7, ease }}
                  className="vessel rounded-[1.75rem] p-6"
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-xl border border-gold/30 bg-gold/10 p-2.5 text-gold">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-semibold text-cream">
                        {book.name}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-sand">
                        {woven ? 'tapestry woven' : 'awaiting the weave'}
                      </p>
                    </div>
                    {woven && <Check className="ml-auto h-5 w-5 text-peacock" />}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {stats.map((s) => (
                      <div key={s.k} className="rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                        <p className="font-display text-lg font-semibold text-gradient-gold">{s.v}</p>
                        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sand/80">
                          {s.k}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* weave control */}
                  {!woven && weaveStage === null && (
                    <button
                      onClick={weave}
                      className="group mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-saffron via-sindoor to-rani px-6 py-3.5 text-sm font-semibold text-ink shadow-glow transition-transform duration-300 hover:scale-[1.02] active:scale-95"
                    >
                      <Sparkles className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
                      Weave the knowledge tapestry
                    </button>
                  )}

                  {weaveStage !== null && (
                    <div className="mt-6 space-y-2.5">
                      {WEAVE_STAGES.map((s, i) => (
                        <div key={s} className="flex items-center gap-3 text-sm">
                          <span className="flex h-5 w-5 items-center justify-center">
                            {i < weaveStage ? (
                              <Check className="h-4 w-4 text-peacock" />
                            ) : i === weaveStage ? (
                              <Loader2 className="h-4 w-4 animate-spin text-saffron" />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-sand/30" />
                            )}
                          </span>
                          <span className={i <= weaveStage ? 'text-cream/90' : 'text-sand/50'}>
                            {s}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {woven && (
                    <div className="mt-6 flex flex-col gap-3">
                      <button
                        onClick={() => setStudioTab('quiz')}
                        className="group flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-saffron via-sindoor to-rani py-3.5 px-4 font-display text-sm font-semibold text-ink shadow-glow transition-transform duration-300 hover:scale-[1.02] active:scale-95"
                      >
                        <Target className="h-4 w-4" />
                        <span>Generate Concept Test & Quizzes</span>
                        <Sparkles className="h-3.5 w-3.5 text-cream transition-transform group-hover:rotate-12" />
                      </button>

                      <div className="flex items-center justify-between gap-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-peacock">
                          {book.chunks.length} threads woven · ready to converse
                        </p>
                        <button
                          onClick={() => inputRef.current?.click()}
                          className="flex items-center gap-1.5 rounded-full border border-saffron/40 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-saffron transition-colors hover:bg-saffron/10"
                        >
                          <RefreshCcw className="h-3 w-3" />
                          new book
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ------------------------- right: chat / quiz arena ------------------------- */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.9, delay: 0.12, ease }}
            className="vessel flex min-h-[580px] flex-col overflow-hidden rounded-[2rem]"
          >
            {/* studio tab header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-saffron/15 bg-white/[0.03] px-5 py-3.5 sm:px-6">
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 p-1">
                <button
                  type="button"
                  onClick={() => setStudioTab('chat')}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 font-display text-xs font-semibold transition-all ${
                    studioTab === 'chat'
                      ? 'bg-gradient-to-r from-saffron to-sindoor text-ink shadow-glow'
                      : 'text-sand hover:text-cream'
                  }`}
                >
                  <BookOpenText className="h-3.5 w-3.5" />
                  <span>Conversational Loom</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStudioTab('quiz')}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 font-display text-xs font-semibold transition-all ${
                    studioTab === 'quiz'
                      ? 'bg-gradient-to-r from-saffron to-peacock text-ink shadow-glow'
                      : 'text-sand hover:text-cream'
                  }`}
                >
                  <Target className="h-3.5 w-3.5" />
                  <span>Concept Test & Quizzes</span>
                  <span className="rounded-full bg-rani/30 px-1.5 py-0.2 font-mono text-[9px] text-cream">AI</span>
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-2">
                <Mandala size={20} strokeWidth={2.4} />
                <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-sand">
                  {studioTab === 'chat'
                    ? (woven ? 'tapestry threaded' : 'awaiting woven book')
                    : (woven ? 'ready to test' : 'weave book to test')}
                </p>
              </div>
            </div>

            {studioTab === 'quiz' ? (
              <div className="flex-1 flex flex-col min-h-[500px]">
                <QuizArena
                  book={book}
                  woven={woven}
                  backend={backend}
                  onOpenChatWithPrompt={handleOpenChatWithPrompt}
                />
              </div>
            ) : (
              <>
                {/* messages */}
                <div ref={scrollRef} className="fabric flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-6">
                  {messages.length === 0 && !asking && (
                    <div className="flex h-full min-h-[380px] flex-col items-center justify-center text-center">
                      <Mandala size={120} className="opacity-40 animate-spin-slow" />
                      <p className="mt-6 max-w-xs font-display text-lg italic text-cream/70">
                        {woven
                          ? 'The threads are listening. Ask your book anything or take a Concept Test.'
                          : 'Upload a book and weave its tapestry to begin the conversation.'}
                      </p>
                      {woven && (
                        <div className="mt-6 flex flex-wrap justify-center gap-2">
                          {SUGGESTIONS.map((s) => (
                            <button
                              key={s}
                              onClick={() => ask(s)}
                              className="rounded-full border border-gold/30 px-3.5 py-1.5 text-xs text-gold transition-colors hover:bg-gold/10"
                            >
                              {s}
                            </button>
                          ))}
                          <button
                            onClick={() => setStudioTab('quiz')}
                            className="flex items-center gap-1.5 rounded-full border border-saffron/40 bg-saffron/10 px-3.5 py-1.5 text-xs font-semibold text-saffron transition-colors hover:bg-saffron/20"
                          >
                            <Target className="h-3 w-3" />
                            🎯 Test My Understanding
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <AnimatePresence initial={false}>
                    {messages.map((m) =>
                      m.role === 'user' ? (
                        <motion.div
                          key={m.id}
                          initial={{ opacity: 0, y: 24 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.6, ease }}
                          className="flex justify-end"
                        >
                          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-r from-saffron to-sindoor px-4 py-2.5 text-sm font-medium text-ink shadow-glow">
                            {m.text}
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key={m.id}
                          initial={{ opacity: 0, y: 24 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.6, ease }}
                          className="flex gap-3"
                        >
                          <Mandala size={26} strokeWidth={2.6} className="mt-1 shrink-0" />
                          <div className="vessel-soft max-w-[88%] rounded-2xl rounded-tl-sm px-4 py-3">
                            <AnswerBody msg={m} fresh={m.id === freshId} />

                            {m.answer && m.answer.retrieved && m.answer.retrieved.length > 0 && (
                              <div className="mt-3 border-t border-saffron/15 pt-2.5">
                                <button
                                  onClick={() => setOpenCtx(openCtx === m.id ? null : m.id)}
                                  className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-saffron/90 transition-colors hover:text-gold"
                                >
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 transition-transform duration-300 ${
                                      openCtx === m.id ? 'rotate-180' : ''
                                    }`}
                                  />
                                  retrieved threads · {m.answer.retrieved.length}
                                </button>
                                <AnimatePresence initial={false}>
                                  {openCtx === m.id && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.45, ease }}
                                      className="overflow-hidden"
                                    >
                                      <div className="mt-3 space-y-2.5">
                                        {m.answer.retrieved.map((r, i) => (
                                          <div key={i} className="rounded-xl bg-white/[0.04] p-3">
                                            <div className="mb-1.5 flex items-center gap-2">
                                              <span className="rounded-full border border-gold/40 px-2 py-0.5 font-mono text-[9px] text-gold">
                                                p. {r.chunk.page + 1}
                                              </span>
                                              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                                                <div
                                                  className="h-full rounded-full bg-gradient-to-r from-saffron to-rani"
                                                  style={{ width: `${Math.round(r.score * 100)}%` }}
                                                />
                                              </div>
                                              <span className="font-mono text-[9px] text-sand">
                                                {Math.round(r.score * 100)}%
                                              </span>
                                            </div>
                                            <p className="line-clamp-3 text-xs leading-relaxed text-sand">
                                              {r.chunk.text}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}

                            {m.answer && !m.answer.found && (
                              <p className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-sand/70">
                                beyond the tapestry — try other words
                              </p>
                            )}
                          </div>
                        </motion.div>
                      ),
                    )}
                  </AnimatePresence>

                  {asking && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3"
                    >
                      <Mandala size={26} strokeWidth={2.6} className="mt-1 shrink-0 animate-spin-slow" />
                      <div className="vessel-soft rounded-2xl rounded-tl-sm px-4 py-3">
                        <p className="thread-shimmer animate-shimmer rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-cream/80">
                          tracing threads through the tapestry…
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void ask(input)
                  }}
                  className="border-t border-saffron/15 bg-white/[0.03] p-4"
                >
                  <div className="flex items-center gap-3">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={!woven || asking}
                      placeholder={woven ? 'Ask your book anything…' : 'Weave a book first…'}
                      className="flex-1 rounded-full border border-saffron/25 bg-ink/60 px-5 py-3 text-sm text-cream placeholder:text-sand/50 focus:border-saffron/60 focus:outline-none focus:ring-2 focus:ring-saffron/20 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={!woven || asking || !input.trim()}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-saffron to-sindoor text-ink shadow-glow transition-transform duration-300 hover:scale-110 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
