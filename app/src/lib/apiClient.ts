/* ------------------------------------------------------------------ */
/*  Nexora · backend seam                                              */
/*                                                                     */
/*  Communicates with the FastAPI backend in app.py:                   */
/*    GET  /api/status   -> health, Chroma count, API keys, doc state  */
/*    POST /api/upload   -> multipart PDF parsing via PyPDFLoader      */
/*    POST /api/index    -> Chroma vectorstore embedding & indexing   */
/*    POST /api/ask      -> MMR retrieval + Groq LLM answer            */
/*    POST /api/reset    -> clear vectorstore & session                */
/*                                                                     */
/*  Gracefully falls back to browser weaver if backend is offline.     */
/* ------------------------------------------------------------------ */

import type { Answer } from './rag'

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || ''

export interface BackendStatus {
  status: string
  db_exists: boolean
  chunks_count: number
  collection: string
  has_openai_key: boolean
  has_groq_key: boolean
  groq_model: string
  current_document?: {
    docId: string
    filename: string
    pages: number
    characters: number
    size: number
  } | null
}

export interface UploadResult {
  docId: string
  filename: string
  size: number
  pages: number
  characters: number
  chunks: number
  message: string
}

export interface IndexResult {
  docId: string
  chunks: number
  status: string
  message: string
}

/** Check if the Python backend is live and fetch its status. */
export async function getBackendStatus(): Promise<BackendStatus | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`${API_BASE}/api/status`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Upload a PDF to the FastAPI backend. */
export async function uploadBookBackend(file: File): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: `Upload failed: ${res.statusText}` }))
    throw new Error(errorData.detail || `Upload failed (${res.status})`)
  }
  return await res.json()
}

/** Trigger embedding & Chroma indexing on the backend. */
export async function indexBookBackend(docId: string): Promise<IndexResult> {
  const res = await fetch(`${API_BASE}/api/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: `Indexing failed: ${res.statusText}` }))
    throw new Error(errorData.detail || `Indexing failed (${res.status})`)
  }
  return await res.json()
}

/** Ask a question to the backend RAG pipeline (Chroma MMR + Groq LLM). */
export async function askBackend(docId: string | undefined, question: string): Promise<Answer> {
  const res = await fetch(`${API_BASE}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, question }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: `Error: ${res.statusText}` }))
    throw new Error(errorData.detail || `Backend error (${res.status})`)
  }
  const data = await res.json()
  return {
    text: data.answer,
    found: data.found ?? true,
    retrieved: data.retrieved || [],
  }
}

/** Reset backend database and active sessions. */
export async function resetBackend(): Promise<void> {
  await fetch(`${API_BASE}/api/reset`, { method: 'POST' }).catch(() => {})
}

export interface QuizGenerateParams {
  docId?: string
  topic?: string
  count?: number
  quizType?: 'mixed' | 'mcq' | 'fill_in_the_blank'
  difficulty?: 'easy' | 'medium' | 'hard'
}

/** Request test generation from the backend LLM */
export async function generateQuizBackend(params: QuizGenerateParams): Promise<any> {
  const res = await fetch(`${API_BASE}/api/quiz/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: `Quiz generation failed: ${res.statusText}` }))
    throw new Error(errorData.detail || `Quiz generation failed (${res.status})`)
  }
  return await res.json()
}

/** Request AI semantic validation for an answer */
export async function validateQuizBackend(params: {
  question: string
  questionType: string
  expectedAnswer: string
  userAnswer: string
  context?: string
}): Promise<any> {
  const res = await fetch(`${API_BASE}/api/quiz/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: `Validation failed: ${res.statusText}` }))
    throw new Error(errorData.detail || `Validation failed (${res.status})`)
  }
  return await res.json()
}
