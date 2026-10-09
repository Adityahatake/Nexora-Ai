/* ------------------------------------------------------------------ */
/*  Nexora · Concept Quiz & AI Validation Engine                      */
/*  Supports MCQs and Fill-in-the-Blank with Semantic AI Validation   */
/*  Functions seamlessly both offline (client) and with backend API.  */
/* ------------------------------------------------------------------ */

import type { Chunk, BookDoc } from './rag'

export type QuestionType = 'mcq' | 'fill_in_the_blank'
export type QuizDifficulty = 'easy' | 'medium' | 'hard'

export interface QuizQuestion {
  id: string
  type: QuestionType
  difficulty: QuizDifficulty
  question: string
  options?: string[] // For MCQs: 4 options [A, B, C, D]
  correctAnswer: string // MCQ option text or Fill-in-the-Blank target term
  acceptableAnswers?: string[] // Synonyms/variations for fill-in-the-blank
  blankContext?: {
    prefix: string
    blankPlaceholder: string
    suffix: string
  }
  explanation: string
  sourceChunkText: string
  page: number
  conceptTag: string
}

export interface QuizValidationResult {
  isCorrect: boolean
  score: number // 0 to 100
  verdict: 'correct' | 'partially_correct' | 'incorrect'
  feedback: string
  expectedAnswer: string
  userAnswer: string
  conceptInsight?: string
}

export interface QuizTest {
  id: string
  title: string
  topic: string
  createdAt: number
  questions: QuizQuestion[]
  difficulty: QuizDifficulty
  docName: string
  totalQuestions: number
}

export interface QuestionUserAnswer {
  questionId: string
  userAnswer: string
  validation?: QuizValidationResult
  isValidating?: boolean
  answeredAt?: number
}

export interface QuizReport {
  testId: string
  topic: string
  docName: string
  totalQuestions: number
  scorePercentage: number
  correctCount: number
  partialCount: number
  incorrectCount: number
  mcqAccuracy: number
  fillBlankAccuracy: number
  masteryLevel: 'Sage' | 'Master Weaver' | 'Apprentice' | 'Seeker'
  masteryTitle: string
  masteryDescription: string
  timeTakenSeconds: number
  answers: Record<string, QuestionUserAnswer>
}

/* ----------------------- Heuristic Question Extraction ----------------------- */

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'for', 'of',
  'with', 'as', 'by', 'that', 'this', 'it', 'from', 'or', 'be', 'are', 'was',
  'were', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'but', 'not', 'can',
  'could', 'should', 'would', 'will', 'then', 'into', 'also', 'more', 'such',
  'their', 'they', 'them', 'these', 'those', 'its', 'about', 'than', 'when',
  'where', 'how', 'what', 'who', 'whom', 'why', 'there', 'here', 'all', 'both'
])

function extractKeyTerms(text: string): string[] {
  // Extract capitalized words, quoted terms, technical keywords, numbers with units
  const matches = text.match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*|[a-z]{4,}(?:-[a-z]+)?)\b/g) || []
  const counts = new Map<string, number>()
  for (const m of matches) {
    const lower = m.toLowerCase()
    if (!STOP_WORDS.has(lower) && lower.length > 3) {
      counts.set(m, (counts.get(m) || 0) + 1)
    }
  }
  return Array.from(counts.keys())
}

function cleanSentence(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Identify high-value sentences (definitions, causality, core statements)
 */
function findSalientSentences(chunks: Chunk[], topic?: string): Array<{ sentence: string; chunk: Chunk }> {
  const salient: Array<{ sentence: string; chunk: Chunk }> = []
  const topicLower = topic ? topic.toLowerCase().trim() : ''

  for (const chunk of chunks) {
    if (!chunk.text) continue
    const text = chunk.text
    if (topicLower && !text.toLowerCase().includes(topicLower)) {
      continue
    }

    const sentences = text
      .split(/(?<=[.!?।])\s+/)
      .map(cleanSentence)
      .filter((s) => s.length >= 45 && s.length <= 260)

    for (const s of sentences) {
      // Prioritize definition/informative markers
      const lower = s.toLowerCase()
      const hasDefinitionMarker =
        lower.includes(' is ') ||
        lower.includes(' are ') ||
        lower.includes(' defined as ') ||
        lower.includes(' known as ') ||
        lower.includes(' refers to ') ||
        lower.includes(' because ') ||
        lower.includes(' causes ') ||
        lower.includes(' result in ') ||
        lower.includes(' consists of ') ||
        lower.includes(' key ') ||
        lower.includes(' important ') ||
        lower.includes(' principle ') ||
        lower.includes(' function ') ||
        lower.includes(' method ') ||
        lower.includes(' process ')

      if (hasDefinitionMarker || Math.random() < 0.4) {
        salient.push({ sentence: s, chunk })
      }
    }
  }

  // If topic filter was too strict and found too few, fallback to all chunks
  if (salient.length < 5 && topicLower && chunks.length > 0) {
    return findSalientSentences(chunks, '')
  }

  return salient
}

/* ----------------------- Client Quiz Generator ----------------------- */

export function generateClientQuiz(
  book: BookDoc,
  options: {
    count?: number
    quizType?: 'mixed' | 'mcq' | 'fill_in_the_blank'
    difficulty?: QuizDifficulty
    topic?: string
  } = {}
): QuizTest {
  const count = options.count || 5
  const quizType = options.quizType || 'mixed'
  const difficulty = options.difficulty || 'medium'
  const topic = options.topic || ''

  const salient = findSalientSentences(book.chunks, topic)
  const pool = salient.length > 0 ? salient : book.chunks.map((c) => ({ sentence: c.text.slice(0, 200), chunk: c }))

  // Collect a pool of vocabulary terms across the document for plausible distractors
  const allTerms: string[] = []
  for (const c of book.chunks) {
    allTerms.push(...extractKeyTerms(c.text))
  }
  const uniqueTerms = Array.from(new Set(allTerms)).filter((t) => t.length > 3)

  const questions: QuizQuestion[] = []
  const usedSentences = new Set<string>()

  // Decide types distribution
  const targetTypes: QuestionType[] = []
  for (let i = 0; i < count; i++) {
    if (quizType === 'mcq') {
      targetTypes.push('mcq')
    } else if (quizType === 'fill_in_the_blank') {
      targetTypes.push('fill_in_the_blank')
    } else {
      // Mixed: alternate between MCQ and Fill-in-the-Blank
      targetTypes.push(i % 2 === 0 ? 'mcq' : 'fill_in_the_blank')
    }
  }

  // Shuffle candidate sentences
  const candidates = [...pool].sort(() => Math.random() - 0.5)

  let candidateIdx = 0
  for (let i = 0; i < count; i++) {
    const qType = targetTypes[i]
    let candidate = candidates[candidateIdx % candidates.length]
    candidateIdx++

    // Find candidate not yet used
    while (candidate && usedSentences.has(candidate.sentence) && candidateIdx < candidates.length * 2) {
      candidate = candidates[candidateIdx % candidates.length]
      candidateIdx++
    }
    if (candidate) usedSentences.add(candidate.sentence)

    const rawSentence = candidate ? candidate.sentence : 'The core concept is defined by the underlying principles of the text.'
    const sourceChunk = candidate ? candidate.chunk : book.chunks[0] || { id: 0, text: rawSentence, page: 0 }

    // Extract potential key terms from this sentence
    const sentenceTerms = extractKeyTerms(rawSentence)
    const targetTerm = sentenceTerms.length > 0 ? sentenceTerms[0] : 'concept'

    if (qType === 'fill_in_the_blank') {
      // Create fill-in-the-blank question
      const reg = new RegExp(`\\b${escapeRegExp(targetTerm)}\\b`, 'i')
      const match = rawSentence.match(reg)

      let maskedSentence = rawSentence
      let prefix = ''
      let suffix = ''

      if (match && match.index !== undefined) {
        prefix = rawSentence.substring(0, match.index)
        suffix = rawSentence.substring(match.index + match[0].length)
        maskedSentence = `${prefix}_______________${suffix}`
      } else {
        maskedSentence = rawSentence.replace(new RegExp(escapeRegExp(targetTerm), 'gi'), '_______________')
      }

      questions.push({
        id: `fib-${i + 1}-${Date.now().toString(36)}`,
        type: 'fill_in_the_blank',
        difficulty,
        question: `Fill in the missing thread: "${maskedSentence}"`,
        correctAnswer: targetTerm,
        acceptableAnswers: [
          targetTerm.toLowerCase(),
          targetTerm.toUpperCase(),
          targetTerm.endsWith('s') ? targetTerm.slice(0, -1) : targetTerm + 's',
        ],
        blankContext: {
          prefix,
          blankPlaceholder: '_______________',
          suffix,
        },
        explanation: `In the manuscript on page ${sourceChunk.page + 1}, this concept is articulated as: "${rawSentence}". The vital term is "${targetTerm}".`,
        sourceChunkText: sourceChunk.text,
        page: sourceChunk.page + 1,
        conceptTag: topic || 'Core Principle',
      })
    } else {
      // Create MCQ question
      // Select 3 distractors from the document vocabulary
      const otherTerms = uniqueTerms
        .filter((t) => t.toLowerCase() !== targetTerm.toLowerCase() && Math.abs(t.length - targetTerm.length) < 8)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)

      const fallbackDistractors = ['Synthetic synthesis', 'Contextual abstraction', 'Parametric flow', 'Recursive hierarchy']
      while (otherTerms.length < 3) {
        otherTerms.push(fallbackDistractors[otherTerms.length])
      }

      // 4 options: correct answer + 3 distractors
      const rawOptions = [targetTerm, ...otherTerms]
      // Shuffle options
      const shuffledOptions = [...rawOptions].sort(() => Math.random() - 0.5)

      // Mask term in sentence for the prompt stem
      const maskedStem = rawSentence.replace(new RegExp(`\\b${escapeRegExp(targetTerm)}\\b`, 'i'), '_____')

      questions.push({
        id: `mcq-${i + 1}-${Date.now().toString(36)}`,
        type: 'mcq',
        difficulty,
        question: `Based on page ${sourceChunk.page + 1}, which concept completes this statement?\n"${maskedStem}"`,
        options: shuffledOptions,
        correctAnswer: targetTerm,
        explanation: `According to the document (page ${sourceChunk.page + 1}): "${rawSentence}". Thus, "${targetTerm}" is the correct answer.`,
        sourceChunkText: sourceChunk.text,
        page: sourceChunk.page + 1,
        conceptTag: topic || 'Knowledge Weave',
      })
    }
  }

  const title = topic
    ? `Mastery Test · ${topic}`
    : `Comprehension Test · ${book.name.replace(/\.pdf$/i, '')}`

  return {
    id: `test-${Date.now()}`,
    title,
    topic: topic || 'Entire Manuscript',
    createdAt: Date.now(),
    questions,
    difficulty,
    docName: book.name,
    totalQuestions: questions.length,
  }
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ----------------------- AI Semantic Validation ----------------------- */

/**
 * Calculates normalized string similarity using Levenshtein distance
 */
function levenshteinDistance(a: string, b: string): number {
  const an = a.length
  const bn = b.length
  if (an === 0) return bn
  if (bn === 0) return an
  const matrix: number[][] = []
  for (let i = 0; i <= bn; ++i) matrix[i] = [i]
  for (let i = 0; i <= an; ++i) matrix[0][i] = i
  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1) // insertion, deletion
        )
      }
    }
  }
  return matrix[bn][an]
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * AI-grade semantic validation of student answers
 */
export function validateClientAnswer(
  question: QuizQuestion,
  rawUserAnswer: string
): QuizValidationResult {
  const user = normalize(rawUserAnswer)
  const expected = normalize(question.correctAnswer)

  if (!user) {
    return {
      isCorrect: false,
      score: 0,
      verdict: 'incorrect',
      feedback: 'No answer was provided. Give it your best shot!',
      expectedAnswer: question.correctAnswer,
      userAnswer: rawUserAnswer,
      conceptInsight: question.explanation,
    }
  }

  // 1. MCQ Validation
  if (question.type === 'mcq') {
    const isExact = user === expected || rawUserAnswer.trim() === question.correctAnswer.trim()
    return {
      isCorrect: isExact,
      score: isExact ? 100 : 0,
      verdict: isExact ? 'correct' : 'incorrect',
      feedback: isExact
        ? '✦ Correct! You accurately identified the exact concept referenced in the text.'
        : `Incorrect. The correct choice is "${question.correctAnswer}".`,
      expectedAnswer: question.correctAnswer,
      userAnswer: rawUserAnswer,
      conceptInsight: question.explanation,
    }
  }

  // 2. Fill-in-the-Blank Semantic Validation
  // Check exact normalized match
  if (user === expected) {
    return {
      isCorrect: true,
      score: 100,
      verdict: 'correct',
      feedback: `✦ Spot on! "${rawUserAnswer.trim()}" is the exact terminology woven into the manuscript.`,
      expectedAnswer: question.correctAnswer,
      userAnswer: rawUserAnswer,
      conceptInsight: question.explanation,
    }
  }

  // Check acceptable alternatives list
  if (question.acceptableAnswers && question.acceptableAnswers.length > 0) {
    for (const alt of question.acceptableAnswers) {
      if (user === normalize(alt)) {
        return {
          isCorrect: true,
          score: 100,
          verdict: 'correct',
          feedback: `✦ Excellent! "${rawUserAnswer.trim()}" is an accepted variation of "${question.correctAnswer}".`,
          expectedAnswer: question.correctAnswer,
          userAnswer: rawUserAnswer,
          conceptInsight: question.explanation,
        }
      }
    }
  }

  // Check substring / inclusion (e.g. user wrote "Neural Network" for "Deep Neural Network")
  if (expected.includes(user) && user.length >= 4) {
    const ratio = Math.round((user.length / expected.length) * 100)
    const score = Math.max(70, Math.min(90, ratio))
    return {
      isCorrect: score >= 75,
      score,
      verdict: score >= 80 ? 'correct' : 'partially_correct',
      feedback: `✦ Conceptually aligned! You captured the essence ("${rawUserAnswer.trim()}"). The fuller phrase in the text is "${question.correctAnswer}".`,
      expectedAnswer: question.correctAnswer,
      userAnswer: rawUserAnswer,
      conceptInsight: question.explanation,
    }
  }

  if (user.includes(expected)) {
    return {
      isCorrect: true,
      score: 90,
      verdict: 'correct',
      feedback: `✦ Nicely articulated! Your answer includes the target key concept "${question.correctAnswer}".`,
      expectedAnswer: question.correctAnswer,
      userAnswer: rawUserAnswer,
      conceptInsight: question.explanation,
    }
  }

  // Levenshtein typo / spelling tolerance
  const dist = levenshteinDistance(user, expected)
  const maxLen = Math.max(user.length, expected.length)
  const similarity = 1 - dist / maxLen

  if (dist <= 2 && maxLen >= 5) {
    return {
      isCorrect: true,
      score: 85,
      verdict: 'correct',
      feedback: `✦ Minor spelling variation detected ("${rawUserAnswer.trim()}"), but your conceptual understanding of "${question.correctAnswer}" is solid!`,
      expectedAnswer: question.correctAnswer,
      userAnswer: rawUserAnswer,
      conceptInsight: question.explanation,
    }
  }

  // Check token overlap for multi-word answers
  const userTokens = new Set(user.split(' ').filter((t) => !STOP_WORDS.has(t) && t.length > 2))
  const expTokens = new Set(expected.split(' ').filter((t) => !STOP_WORDS.has(t) && t.length > 2))
  let overlapCount = 0
  for (const t of userTokens) {
    if (expTokens.has(t)) overlapCount++
  }

  if (expTokens.size > 0 && overlapCount > 0) {
    const overlapRatio = overlapCount / expTokens.size
    const score = Math.round(overlapRatio * 80)
    return {
      isCorrect: score >= 60,
      score,
      verdict: score >= 60 ? 'partially_correct' : 'incorrect',
      feedback: `✦ Partially understood. You correctly recalled part of the phrase (${overlapCount}/${expTokens.size} core terms), but the complete term is "${question.correctAnswer}".`,
      expectedAnswer: question.correctAnswer,
      userAnswer: rawUserAnswer,
      conceptInsight: question.explanation,
    }
  }

  // No match
  return {
    isCorrect: false,
    score: Math.max(0, Math.round(similarity * 40)),
    verdict: 'incorrect',
    feedback: `The tapestry anticipated "${question.correctAnswer}". Review the passage excerpt below to reinforce this concept.`,
    expectedAnswer: question.correctAnswer,
    userAnswer: rawUserAnswer,
    conceptInsight: question.explanation,
  }
}

/* ----------------------- Report & Mastery Calculation ----------------------- */

export function calculateQuizReport(
  test: QuizTest,
  answers: Record<string, QuestionUserAnswer>,
  timeTakenSeconds: number
): QuizReport {
  let totalScorePoints = 0
  let correctCount = 0
  let partialCount = 0
  let incorrectCount = 0

  let mcqTotal = 0
  let mcqCorrect = 0
  let fibTotal = 0
  let fibScoreSum = 0

  for (const q of test.questions) {
    const ans = answers[q.id]
    const val = ans?.validation || validateClientAnswer(q, ans?.userAnswer || '')

    totalScorePoints += val.score

    if (val.verdict === 'correct') {
      correctCount++
    } else if (val.verdict === 'partially_correct') {
      partialCount++
    } else {
      incorrectCount++
    }

    if (q.type === 'mcq') {
      mcqTotal++
      if (val.isCorrect) mcqCorrect++
    } else {
      fibTotal++
      fibScoreSum += val.score
    }
  }

  const scorePercentage = Math.round(totalScorePoints / test.questions.length)
  const mcqAccuracy = mcqTotal > 0 ? Math.round((mcqCorrect / mcqTotal) * 100) : 100
  const fillBlankAccuracy = fibTotal > 0 ? Math.round(fibScoreSum / fibTotal) : 100

  let masteryLevel: 'Sage' | 'Master Weaver' | 'Apprentice' | 'Seeker' = 'Seeker'
  let masteryTitle = 'Knowledge Seeker · जिज्ञासु'
  let masteryDescription = 'You have begun unravelling the threads. Re-read the chapters and re-weave to solidify comprehension.'

  if (scorePercentage >= 90) {
    masteryLevel = 'Sage'
    masteryTitle = 'Master Sage · प्रज्ञावान्'
    masteryDescription = 'Flawless mastery! You have grasped the intricate nuances, definitions, and relationships in the manuscript.'
  } else if (scorePercentage >= 75) {
    masteryLevel = 'Master Weaver'
    masteryTitle = 'Expert Weaver · कुशल बुनकर'
    masteryDescription = 'Strong conceptual foundation! Most core threads are deeply integrated, with only minor gaps.'
  } else if (scorePercentage >= 50) {
    masteryLevel = 'Apprentice'
    masteryTitle = 'Diligent Apprentice · शिक्षार्थी'
    masteryDescription = 'Good grasp of the primary facts, but complex concepts need reinforcement. Review the missed threads below.'
  }

  return {
    testId: test.id,
    topic: test.topic,
    docName: test.docName,
    totalQuestions: test.questions.length,
    scorePercentage,
    correctCount,
    partialCount,
    incorrectCount,
    mcqAccuracy,
    fillBlankAccuracy,
    masteryLevel,
    masteryTitle,
    masteryDescription,
    timeTakenSeconds,
    answers,
  }
}
