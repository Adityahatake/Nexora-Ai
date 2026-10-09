import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Award,
  Clock,
  Loader2,
  Zap,
  MessageSquareQuote,
  Target,
} from 'lucide-react'
import { Mandala, StitchDivider } from '@/components/decor'
import type { BookDoc } from '@/lib/rag'
import {
  generateClientQuiz,
  validateClientAnswer,
  calculateQuizReport,
  type QuizTest,
  type QuestionUserAnswer,
  type QuizReport,
  type QuizDifficulty,
} from '@/lib/quizEngine'
import {
  generateQuizBackend,
  validateQuizBackend,
  type BackendStatus,
} from '@/lib/apiClient'

const ease = [0.16, 1, 0.3, 1] as const

interface QuizArenaProps {
  book: BookDoc | null
  woven: boolean
  backend: BackendStatus | null
  onOpenChatWithPrompt?: (prompt: string) => void
}

export default function QuizArena({
  book,
  woven,
  backend,
  onOpenChatWithPrompt,
}: QuizArenaProps) {
  // Arena State
  const [view, setView] = useState<'setup' | 'generating' | 'testing' | 'report'>('setup')
  const [currentTest, setCurrentTest] = useState<QuizTest | null>(null)
  const [activeQIndex, setActiveQIndex] = useState(0)
  const [userAnswers, setUserAnswers] = useState<Record<string, QuestionUserAnswer>>({})
  const [currentInput, setCurrentInput] = useState('')
  const [report, setReport] = useState<QuizReport | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Generator Config
  const [topicFocus, setTopicFocus] = useState('')
  const [quizType, setQuizType] = useState<'mixed' | 'mcq' | 'fill_in_the_blank'>('mixed')
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('medium')
  const [questionCount, setQuestionCount] = useState<number>(5)

  // Timer State
  const [secondsElapsed, setSecondsElapsed] = useState(0)
  const [timerActive, setTimerActive] = useState(false)

  // Local validation loading state
  const [validatingQId, setValidatingQId] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // Run timer when testing
  useEffect(() => {
    let interval: number | undefined
    if (timerActive && view === 'testing') {
      interval = window.setInterval(() => {
        setSecondsElapsed((s) => s + 1)
      }, 1000)
    }
    return () => {
      if (interval) window.clearInterval(interval)
    }
  }, [timerActive, view])

  // Sync input with currently selected question's answer
  useEffect(() => {
    if (currentTest && currentTest.questions[activeQIndex]) {
      const q = currentTest.questions[activeQIndex]
      const existing = userAnswers[q.id]?.userAnswer || ''
      setCurrentInput(existing)
      if (q.type === 'fill_in_the_blank') {
        setTimeout(() => inputRef.current?.focus(), 150)
      }
    }
  }, [activeQIndex, currentTest, userAnswers])

  // Generate test handler
  const handleGenerateTest = async () => {
    if (!book || !woven) {
      setErrorMsg('Please upload a PDF and weave the tapestry first.')
      return
    }

    setErrorMsg(null)
    setView('generating')
    setSecondsElapsed(0)

    try {
      // 1. Try backend if available and has groq key
      if (backend && backend.has_groq_key) {
        try {
          const beQuiz = await generateQuizBackend({
            docId: book.docId,
            topic: topicFocus.trim() || undefined,
            count: questionCount,
            quizType,
            difficulty,
          })
          if (beQuiz && beQuiz.questions && beQuiz.questions.length > 0) {
            setCurrentTest(beQuiz)
            setUserAnswers({})
            setActiveQIndex(0)
            setView('testing')
            setTimerActive(true)
            return
          }
        } catch (beErr) {
          console.warn('Backend quiz generation failed, falling back to client-side:', beErr)
        }
      }

      // 2. Client-side Generation fallback
      // Simulated brief delay for satisfying animation
      await new Promise((r) => setTimeout(r, 700))
      const clientTest = generateClientQuiz(book, {
        count: questionCount,
        quizType,
        difficulty,
        topic: topicFocus.trim() || undefined,
      })

      if (!clientTest.questions || clientTest.questions.length === 0) {
        throw new Error('Could not extract sufficient concept threads. Try a broader topic or full document.')
      }

      setCurrentTest(clientTest)
      setUserAnswers({})
      setActiveQIndex(0)
      setView('testing')
      setTimerActive(true)
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || 'Failed to generate quiz.')
      setView('setup')
    }
  }

  // Answer selection for MCQ
  const handleSelectMCQ = (optionText: string) => {
    if (!currentTest) return
    const q = currentTest.questions[activeQIndex]
    if (!q) return

    // Validate immediately
    const validation = validateClientAnswer(q, optionText)

    setUserAnswers((prev) => ({
      ...prev,
      [q.id]: {
        questionId: q.id,
        userAnswer: optionText,
        validation,
        answeredAt: Date.now(),
      },
    }))
  }

  // AI Validation for Fill-in-the-Blank
  const handleValidateFillInTheBlank = async () => {
    if (!currentTest || !currentInput.trim()) return
    const q = currentTest.questions[activeQIndex]
    if (!q) return

    setValidatingQId(q.id)

    try {
      // Try backend AI validation if online with Groq
      if (backend && backend.has_groq_key) {
        try {
          const beVal = await validateQuizBackend({
            question: q.question,
            questionType: q.type,
            expectedAnswer: q.correctAnswer,
            userAnswer: currentInput.trim(),
            context: q.sourceChunkText,
          })
          if (beVal && typeof beVal.score === 'number') {
            setUserAnswers((prev) => ({
              ...prev,
              [q.id]: {
                questionId: q.id,
                userAnswer: currentInput.trim(),
                validation: {
                  isCorrect: beVal.is_correct ?? beVal.isCorrect,
                  score: beVal.score,
                  verdict: beVal.verdict,
                  feedback: beVal.feedback,
                  expectedAnswer: q.correctAnswer,
                  userAnswer: currentInput.trim(),
                  conceptInsight: beVal.explanation || q.explanation,
                },
                answeredAt: Date.now(),
              },
            }))
            setValidatingQId(null)
            return
          }
        } catch (beErr) {
          console.warn('Backend validation failed, falling back to client-side:', beErr)
        }
      }

      // Client-side AI semantic validation
      await new Promise((r) => setTimeout(r, 350))
      const clientVal = validateClientAnswer(q, currentInput.trim())

      setUserAnswers((prev) => ({
        ...prev,
        [q.id]: {
          questionId: q.id,
          userAnswer: currentInput.trim(),
          validation: clientVal,
          answeredAt: Date.now(),
        },
      }))
    } finally {
      setValidatingQId(null)
    }
  }

  // Submit and grade test
  const handleSubmitTest = () => {
    if (!currentTest) return
    setTimerActive(false)

    // Ensure all questions have a validation result recorded
    const finalAnswers: Record<string, QuestionUserAnswer> = { ...userAnswers }
    for (const q of currentTest.questions) {
      if (!finalAnswers[q.id]) {
        finalAnswers[q.id] = {
          questionId: q.id,
          userAnswer: '',
          validation: validateClientAnswer(q, ''),
        }
      }
    }

    const calculated = calculateQuizReport(currentTest, finalAnswers, secondsElapsed)
    setReport(calculated)
    setView('report')
  }

  // Format time (MM:SS)
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  if (!woven) {
    return (
      <div className="flex h-full min-h-[460px] flex-col items-center justify-center p-8 text-center">
        <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-saffron/30 bg-saffron/10 text-saffron">
          <Mandala size={48} className="animate-spin-slow opacity-80" />
        </div>
        <h3 className="font-display text-2xl font-semibold text-cream">
          Tapestry Awaiting the Loom
        </h3>
        <p className="mt-2.5 max-w-md text-sm text-sand/80">
          Upload your book in the studio on the left and weave its knowledge tapestry. Once woven,
          you can generate comprehensive MCQs and Fill-in-the-Blank tests with AI validation!
        </p>
      </div>
    )
  }

  /* ------------------------------- GENERATING VIEW ------------------------------- */
  if (view === 'generating') {
    return (
      <div className="flex h-full min-h-[500px] flex-col items-center justify-center p-8 text-center">
        <div className="relative mb-6">
          <Mandala size={90} className="animate-spin-slow text-saffron" />
          <Sparkles className="absolute inset-0 m-auto h-8 w-8 text-gold animate-pulse" />
        </div>
        <h3 className="text-gradient font-display text-2xl font-semibold sm:text-3xl">
          Weaving Your Concept Mastery Test…
        </h3>
        <p className="mt-3 max-w-md text-sm text-sand">
          Synthesizing key definitions, formulating plausible distractors, and preparing AI semantic
          validation threads from <span className="font-medium text-cream">{book?.name}</span>.
        </p>
        <div className="mt-6 flex items-center gap-2 rounded-full border border-saffron/30 bg-saffron/10 px-4 py-1.5 text-xs text-saffron">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Generating {questionCount} questions ({quizType.toUpperCase()})</span>
        </div>
      </div>
    )
  }

  /* ------------------------------- REPORT VIEW ------------------------------- */
  if (view === 'report' && report && currentTest) {
    const strokeDash = 2 * Math.PI * 45
    const strokeOffset = strokeDash - (strokeDash * report.scorePercentage) / 100

    return (
      <div className="flex h-full flex-col overflow-y-auto p-6 sm:p-8">
        {/* Report Top Hero */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease }}
          className="vessel-soft relative overflow-hidden rounded-[2rem] p-6 text-center sm:p-8"
        >
          {/* Radial score gauge */}
          <div className="relative mx-auto flex h-32 w-32 items-center justify-center">
            <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                className="stroke-white/10"
                strokeWidth="7"
                fill="transparent"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="url(#scoreGradient)"
                strokeWidth="7"
                strokeDasharray={strokeDash}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ee9b01" />
                  <stop offset="50%" stopColor="#ef3f28" />
                  <stop offset="100%" stopColor="#0a9396" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="font-display text-3xl font-bold text-cream">
                {report.scorePercentage}%
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-sand">Score</span>
            </div>
          </div>

          {/* Mastery Badge */}
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1 text-xs font-semibold text-gold">
            <Award className="h-3.5 w-3.5" />
            <span>{report.masteryTitle}</span>
          </div>

          <h3 className="mt-3 font-display text-xl font-semibold text-cream">
            {report.topic ? `Mastery: ${report.topic}` : 'Tapestry Comprehension Assessment'}
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-sand sm:text-sm">
            {report.masteryDescription}
          </p>

          {/* Metrics ribbon */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white/[0.04] p-3">
              <p className="font-mono text-[10px] uppercase text-sand">Correct</p>
              <p className="font-display text-xl font-semibold text-peacock">
                {report.correctCount} / {report.totalQuestions}
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <p className="font-mono text-[10px] uppercase text-sand">Partial</p>
              <p className="font-display text-xl font-semibold text-gold">
                {report.partialCount}
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <p className="font-mono text-[10px] uppercase text-sand">MCQ Precision</p>
              <p className="font-display text-xl font-semibold text-saffron">
                {report.mcqAccuracy}%
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <p className="font-mono text-[10px] uppercase text-sand">Fill-Blank AI</p>
              <p className="font-display text-xl font-semibold text-rani">
                {report.fillBlankAccuracy}%
              </p>
            </div>
          </div>

          {/* Action row */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                setUserAnswers({})
                setActiveQIndex(0)
                setSecondsElapsed(0)
                setTimerActive(true)
                setView('testing')
              }}
              className="flex items-center gap-2 rounded-full border border-saffron/40 bg-saffron/10 px-5 py-2.5 text-xs font-semibold text-saffron transition-transform hover:scale-105 active:scale-95"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retake This Test
            </button>
            <button
              onClick={() => setView('setup')}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-saffron to-sindoor px-5 py-2.5 text-xs font-semibold text-ink shadow-glow transition-transform hover:scale-105 active:scale-95"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate New Test
            </button>
          </div>
        </motion.div>

        {/* Detailed Question Review */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h4 className="font-display text-lg font-semibold text-cream">
              Question-by-Question Deep Dive · सूक्ष्म समीक्षा
            </h4>
            <span className="font-mono text-[10px] uppercase tracking-wider text-sand">
              {currentTest.questions.length} questions
            </span>
          </div>

          <div className="mt-4 space-y-4">
            {currentTest.questions.map((q, idx) => {
              const ansState = report.answers[q.id]
              const val = ansState?.validation
              const isCorrect = val?.verdict === 'correct'
              const isPartial = val?.verdict === 'partially_correct'

              return (
                <div
                  key={q.id}
                  className="vessel-soft rounded-2xl p-5 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 font-mono text-xs font-bold text-cream">
                        {idx + 1}
                      </span>
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[9px] uppercase text-sand">
                        {q.type === 'mcq' ? 'MCQ' : 'Fill in Blank'}
                      </span>
                      <span className="font-mono text-[10px] text-gold">p. {q.page}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isCorrect ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-peacock/20 px-2.5 py-0.5 text-xs font-medium text-peacock">
                          <CheckCircle2 className="h-3 w-3" /> Correct ({val?.score}%)
                        </span>
                      ) : isPartial ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-medium text-gold">
                          <AlertCircle className="h-3 w-3" /> Partial ({val?.score}%)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sindoor/20 px-2.5 py-0.5 text-xs font-medium text-sindoor">
                          <XCircle className="h-3 w-3" /> Incorrect ({val?.score || 0}%)
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 text-sm font-medium leading-relaxed text-cream">
                    {q.question}
                  </p>

                  <div className="mt-3 grid gap-2 rounded-xl bg-black/30 p-3 text-xs sm:grid-cols-2">
                    <div>
                      <span className="font-mono text-[10px] uppercase text-sand/70">Your Answer:</span>
                      <p className={`mt-0.5 font-medium ${isCorrect ? 'text-peacock' : isPartial ? 'text-gold' : 'text-sindoor'}`}>
                        {ansState?.userAnswer || '(No answer provided)'}
                      </p>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] uppercase text-sand/70">Target Concept:</span>
                      <p className="mt-0.5 font-medium text-cream">
                        {q.correctAnswer}
                      </p>
                    </div>
                  </div>

                  {val?.feedback && (
                    <div className="mt-3 rounded-xl border border-saffron/20 bg-saffron/[0.06] p-3 text-xs text-sand">
                      <span className="block font-mono text-[9px] uppercase tracking-wider text-saffron">
                        AI Pedagogical Feedback:
                      </span>
                      <p className="mt-1 leading-relaxed text-cream/90">{val.feedback}</p>
                    </div>
                  )}

                  <div className="mt-2.5 text-xs text-sand/70">
                    <p className="italic leading-relaxed">
                      📖 <span className="font-medium text-sand">Manuscript Excerpt:</span> {q.explanation}
                    </p>
                  </div>

                  {onOpenChatWithPrompt && !isCorrect && (
                    <button
                      onClick={() =>
                        onOpenChatWithPrompt(
                          `Can you clarify why "${q.correctAnswer}" is the correct answer regarding: "${q.question}" from page ${q.page}?`
                        )
                      }
                      className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] text-gold hover:underline"
                    >
                      <MessageSquareQuote className="h-3 w-3" />
                      Ask Conversational Loom to explain this mistake
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------- SETUP VIEW ------------------------------- */
  if (view === 'setup') {
    return (
      <div className="flex h-full flex-col justify-between overflow-y-auto p-6 sm:p-8">
        <div>
          {/* Header */}
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-saffron/40 bg-saffron/10 text-saffron">
              <Target className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-xl font-semibold text-cream">
                Concept Mastery Test Loom · परीक्षा
              </h3>
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-sand">
                Validate understanding with AI-validated MCQs & Fill-in-the-Blanks
              </p>
            </div>
          </div>

          <StitchDivider className="my-5 opacity-50" />

          {errorMsg && (
            <div className="mb-4 rounded-xl border border-sindoor/30 bg-sindoor/10 p-3 text-xs text-sindoor">
              {errorMsg}
            </div>
          )}

          {/* Test Configuration Form */}
          <div className="space-y-6">
            {/* 1. Topic Scope */}
            <div>
              <label className="block font-mono text-xs uppercase tracking-wider text-sand">
                1. Concept Scope / Focus Topic (Optional)
              </label>
              <input
                type="text"
                value={topicFocus}
                onChange={(e) => setTopicFocus(e.target.value)}
                placeholder="e.g. Chapter 3, Core definitions, Key characters (Leave blank for full book)"
                className="mt-2 w-full rounded-2xl border border-saffron/25 bg-ink/70 px-4 py-3 text-sm text-cream placeholder:text-sand/40 focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/30"
              />
              <p className="mt-1 text-[11px] text-sand/60">
                You can target a specific chapter or concept to test if you truly understood it.
              </p>
            </div>

            {/* 2. Question Types */}
            <div>
              <label className="block font-mono text-xs uppercase tracking-wider text-sand">
                2. Question Formats
              </label>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setQuizType('mixed')}
                  className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                    quizType === 'mixed'
                      ? 'border-saffron bg-saffron/15 shadow-glow'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-saffron" />
                    <span className="font-display text-sm font-semibold text-cream">Mixed Test</span>
                  </div>
                  <p className="mt-1 text-[11px] text-sand">
                    Best balance: MCQs & Fill-in-the-Blank with AI check
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setQuizType('mcq')}
                  className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                    quizType === 'mcq'
                      ? 'border-gold bg-gold/15 shadow-glow'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-gold" />
                    <span className="font-display text-sm font-semibold text-cream">MCQs Only</span>
                  </div>
                  <p className="mt-1 text-[11px] text-sand">
                    Multiple choice questions with 4 contextual distractors
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setQuizType('fill_in_the_blank')}
                  className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                    quizType === 'fill_in_the_blank'
                      ? 'border-rani bg-rani/15 shadow-glow'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-rani" />
                    <span className="font-display text-sm font-semibold text-cream">Fill-in-Blank</span>
                  </div>
                  <p className="mt-1 text-[11px] text-sand">
                    Type answers with AI semantic validation
                  </p>
                </button>
              </div>
            </div>

            {/* 3. Difficulty & Count */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block font-mono text-xs uppercase tracking-wider text-sand">
                  3. Difficulty Depth
                </label>
                <div className="mt-2 flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                  {(['easy', 'medium', 'hard'] as QuizDifficulty[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(d)}
                      className={`flex-1 rounded-lg py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
                        difficulty === d
                          ? 'bg-saffron text-ink font-semibold shadow-glow'
                          : 'text-sand hover:text-cream'
                      }`}
                    >
                      {d === 'easy' ? 'Apprentice' : d === 'medium' ? 'Weaver' : 'Sage'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs uppercase tracking-wider text-sand">
                  4. Number of Questions
                </label>
                <div className="mt-2 flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                  {[3, 5, 8, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setQuestionCount(num)}
                      className={`flex-1 rounded-lg py-1.5 font-mono text-xs transition-all ${
                        questionCount === num
                          ? 'bg-saffron text-ink font-semibold shadow-glow'
                          : 'text-sand hover:text-cream'
                      }`}
                    >
                      {num} Qs
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div className="mt-8 border-t border-white/10 pt-4">
          <button
            onClick={handleGenerateTest}
            className="group flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-saffron via-sindoor to-rani py-4 font-display text-base font-semibold text-ink shadow-glow transition-transform hover:scale-[1.02] active:scale-95"
          >
            <Sparkles className="h-5 w-5 transition-transform duration-300 group-hover:rotate-12" />
            Weave & Generate Knowledge Test
          </button>
          <p className="mt-2 text-center font-mono text-[10px] text-sand/60">
            {backend?.has_groq_key
              ? '⚡ Powered by Groq LLM + Chroma Retrieval'
              : '🌱 Powered by High-Performance Client Linguistic Weaver'}
          </p>
        </div>
      </div>
    )
  }

  /* ------------------------------- ACTIVE TESTING VIEW ------------------------------- */
  if (view === 'testing' && currentTest) {
    const q = currentTest.questions[activeQIndex]
    const currentAns = userAnswers[q.id]
    const isFib = q.type === 'fill_in_the_blank'
    const totalQs = currentTest.questions.length
    const answeredCount = Object.keys(userAnswers).filter((k) => userAnswers[k]?.userAnswer).length

    return (
      <div className="flex h-full flex-col justify-between overflow-y-auto p-5 sm:p-7">
        {/* Test Navigation Bar */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-saffron/40 bg-saffron/10 px-2 py-0.5 font-mono text-[10px] uppercase text-saffron">
                {q.type === 'mcq' ? 'MCQ Choice' : 'Fill-in-the-Blank'}
              </span>
              <span className="font-mono text-xs text-sand">
                p. {q.page}
              </span>
            </div>

            {/* Question Quick-Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {currentTest.questions.map((item, idx) => {
                const ans = userAnswers[item.id]
                const isCurrent = idx === activeQIndex
                const isDone = Boolean(ans?.userAnswer)
                const isCorrect = ans?.validation?.verdict === 'correct'

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveQIndex(idx)}
                    className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs transition-all ${
                      isCurrent
                        ? 'border-2 border-saffron bg-saffron text-ink font-bold shadow-glow scale-110'
                        : isDone
                          ? isCorrect
                            ? 'border border-peacock bg-peacock/20 text-peacock'
                            : 'border border-gold bg-gold/20 text-gold'
                          : 'border border-white/15 bg-white/5 text-sand hover:border-white/30'
                    }`}
                  >
                    {idx + 1}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 font-mono text-xs text-sand">
                <Clock className="h-3.5 w-3.5 text-saffron" />
                <span>{formatTime(secondsElapsed)}</span>
              </div>
              <button
                onClick={() => setView('setup')}
                className="font-mono text-[10px] uppercase text-sand/60 hover:text-sindoor"
              >
                Exit
              </button>
            </div>
          </div>

          {/* Question Stem */}
          <div className="mt-6">
            <div className="flex items-center gap-2 text-xs font-mono text-sand">
              <span>Question {activeQIndex + 1} of {totalQs}</span>
              <span>·</span>
              <span className="text-gold capitalize">{q.difficulty} Tier</span>
            </div>

            <h3 className="mt-2 whitespace-pre-wrap font-display text-lg font-semibold leading-relaxed text-cream sm:text-xl">
              {q.question}
            </h3>
          </div>

          {/* Question Interactive Arena */}
          <div className="mt-6">
            {/* MCQ Options */}
            {!isFib && q.options && (
              <div className="grid gap-3">
                {q.options.map((opt, optIdx) => {
                  const letter = String.fromCharCode(65 + optIdx)
                  const isSelected = currentAns?.userAnswer === opt
                  const validation = currentAns?.validation
                  const isCorrectOpt = opt === q.correctAnswer

                  let buttonStyle = 'border-white/10 bg-white/[0.04] text-cream hover:border-saffron/40 hover:bg-white/[0.07]'
                  if (isSelected && validation) {
                    buttonStyle = validation.isCorrect
                      ? 'border-peacock bg-peacock/20 text-peacock shadow-glow'
                      : 'border-sindoor bg-sindoor/20 text-sindoor shadow-glow'
                  } else if (validation && isCorrectOpt) {
                    buttonStyle = 'border-peacock/60 bg-peacock/10 text-peacock'
                  }

                  return (
                    <button
                      key={optIdx}
                      onClick={() => handleSelectMCQ(opt)}
                      className={`group flex items-center gap-3.5 rounded-2xl border p-4 text-left transition-all ${buttonStyle}`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/5 font-mono text-xs font-bold">
                        {letter}
                      </span>
                      <span className="flex-1 text-sm font-medium leading-relaxed">
                        {opt}
                      </span>
                      {isSelected && validation && (
                        validation.isCorrect ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-peacock" />
                        ) : (
                          <XCircle className="h-5 w-5 shrink-0 text-sindoor" />
                        )
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Fill-in-the-Blank Interactive Area */}
            {isFib && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-saffron/25 bg-black/40 p-5">
                  <label className="block font-mono text-xs uppercase tracking-wider text-saffron">
                    Your Concept Answer:
                  </label>
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <input
                      ref={inputRef}
                      type="text"
                      value={currentInput}
                      onChange={(e) => setCurrentInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void handleValidateFillInTheBlank()
                        }
                      }}
                      placeholder="Type the missing concept/term here…"
                      disabled={validatingQId === q.id}
                      className="flex-1 min-w-[200px] rounded-xl border border-saffron/30 bg-ink/80 px-4 py-3 text-sm text-cream placeholder:text-sand/40 focus:border-saffron focus:outline-none focus:ring-2 focus:ring-saffron/20"
                    />
                    <button
                      type="button"
                      onClick={handleValidateFillInTheBlank}
                      disabled={!currentInput.trim() || validatingQId === q.id}
                      className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-saffron to-sindoor px-5 py-3 text-sm font-semibold text-ink shadow-glow transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                    >
                      {validatingQId === q.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>AI Validating…</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 transition-transform group-hover:rotate-12" />
                          <span>Validate with AI</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* AI Semantic Feedback Box */}
                {currentAns?.validation && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-2xl border p-4.5 text-xs sm:text-sm ${
                      currentAns.validation.verdict === 'correct'
                        ? 'border-peacock/40 bg-peacock/10'
                        : currentAns.validation.verdict === 'partially_correct'
                          ? 'border-gold/40 bg-gold/10'
                          : 'border-sindoor/40 bg-sindoor/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider font-bold">
                        AI Semantic Evaluation · {currentAns.validation.score}% Score
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                          currentAns.validation.verdict === 'correct'
                            ? 'bg-peacock/20 text-peacock'
                            : currentAns.validation.verdict === 'partially_correct'
                              ? 'bg-gold/20 text-gold'
                              : 'bg-sindoor/20 text-sindoor'
                        }`}
                      >
                        {currentAns.validation.verdict.replace('_', ' ')}
                      </span>
                    </div>

                    <p className="mt-2 font-medium leading-relaxed text-cream">
                      {currentAns.validation.feedback}
                    </p>

                    <div className="mt-3 border-t border-white/10 pt-2.5 text-xs text-sand/80">
                      <p>
                        <span className="font-semibold text-cream">Target Concept:</span>{' '}
                        <span className="font-mono text-gold">{q.correctAnswer}</span>
                      </p>
                      <p className="mt-1 italic leading-relaxed text-sand/70">
                        {q.explanation}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Explanation reveal for MCQ if answered */}
            {!isFib && currentAns?.validation && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-sand"
              >
                <span className="block font-mono text-[9px] uppercase tracking-wider text-gold">
                  Understanding Insight & Manuscript Excerpt:
                </span>
                <p className="mt-1 leading-relaxed text-cream/90">{q.explanation}</p>
              </motion.div>
            )}
          </div>
        </div>

        {/* Bottom Navigation & Submission Bar */}
        <div className="mt-8 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setActiveQIndex((i) => Math.max(0, i - 1))}
              disabled={activeQIndex === 0}
              className="flex items-center gap-1 rounded-full border border-white/15 px-4 py-2 font-mono text-xs uppercase text-sand transition-colors hover:bg-white/5 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>

            <span className="font-mono text-xs text-sand">
              {answeredCount} of {totalQs} answered
            </span>

            {activeQIndex < totalQs - 1 ? (
              <button
                onClick={() => setActiveQIndex((i) => Math.min(totalQs - 1, i + 1))}
                className="flex items-center gap-1 rounded-full border border-saffron/40 bg-saffron/10 px-5 py-2 font-mono text-xs uppercase font-semibold text-saffron transition-all hover:bg-saffron/20"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmitTest}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-saffron to-peacock px-6 py-2.5 font-display text-xs font-semibold uppercase tracking-wider text-ink shadow-glow transition-transform hover:scale-105 active:scale-95"
              >
                <Award className="h-4 w-4" />
                Finish & View Scorecard
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
