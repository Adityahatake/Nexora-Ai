/* ------------------------------------------------------------------ */
/*  Nexora · client-side demo RAG engine                               */
/*                                                                     */
/*  Mirrors the Python pipeline:                                       */
/*    PyPDFLoader            -> extractPages()                         */
/*    RecursiveCharacterText -> chunkPages()   (1000 chars / 200 over) */
/*    Chroma + MMR (k=4)     -> retrieve()     (top-4, diversified)    */
/*    Groq LLM answer        -> composeAnswer() (demo composer)        */
/*                                                                     */
/*  To go live, swap composeAnswer()/retrieve() with calls to your     */
/*  FastAPI backend — see src/lib/apiClient.ts.                        */
/* ------------------------------------------------------------------ */

export interface PageText {
  page: number // 0-indexed, matches PyPDFLoader metadata
  text: string
}

export interface Chunk {
  id: number
  text: string
  page: number
}

export interface BookDoc {
  name: string
  size: number
  pages: number
  chunks: Chunk[]
  characters: number
  docId?: string
}

export interface Retrieved {
  chunk: Chunk
  score: number // 0..1 relevance
}

export interface Answer {
  text: string
  found: boolean
  retrieved: Retrieved[]
}

/* ---------------------------- extraction --------------------------- */

export async function extractPages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<{ pages: PageText[]; pageCount: number }> {
  // pdf.js (~1.2 MB) loads only when a book is actually offered
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const pages: PageText[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    pages.push({ page: i - 1, text })
    onProgress?.(i, pdf.numPages)
  }
  await pdf.destroy()
  return { pages, pageCount: pdf.numPages }
}

/* ---------------------------- chunking ----------------------------- */

const CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 200

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function chunkPages(pages: PageText[]): Chunk[] {
  const chunks: Chunk[] = []
  let id = 0

  for (const { page, text } of pages) {
    if (!text) continue
    const sentences = splitSentences(text)
    let current = ''
    let carry = ''

    for (const sentence of sentences) {
      if ((current + ' ' + sentence).trim().length > CHUNK_SIZE && current) {
        chunks.push({ id: id++, text: current.trim(), page })
        // carry ~CHUNK_OVERLAP characters into the next chunk
        carry = current.slice(-CHUNK_OVERLAP)
        const cut = carry.indexOf(' ')
        current = (cut > 0 ? carry.slice(cut + 1) : carry) + ' ' + sentence
      } else {
        current = (current + ' ' + sentence).trim()
      }
    }
    if (current.trim()) chunks.push({ id: id++, text: current.trim(), page })
  }
  return chunks
}

export function buildBook(name: string, size: number, pages: PageText[]): BookDoc {
  const chunks = chunkPages(pages)
  return {
    name,
    size,
    pages: pages.length,
    chunks,
    characters: pages.reduce((n, p) => n + p.text.length, 0),
  }
}

/* ---------------------------- retrieval ---------------------------- */

const STOPWORDS = new Set(
  ('a,an,the,is,are,was,were,be,been,being,have,has,had,do,does,did,will,would,shall,should,' +
    'can,could,may,might,must,of,at,by,for,with,about,against,between,into,through,during,' +
    'before,after,above,below,to,from,up,down,in,out,on,off,over,under,again,further,then,' +
    'once,here,there,when,where,why,how,all,any,both,each,few,more,most,other,some,such,no,' +
    'nor,not,only,own,same,so,than,too,very,just,and,but,if,or,because,as,until,while,what,' +
    'which,who,whom,this,that,these,those,i,you,he,she,it,we,they,me,him,her,us,them,my,your,' +
    'his,its,our,their,explain,tell,describe,summarize,summary,give,say'
  ).split(','),
)

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
}

/** Top-k retrieval with light diversity (MMR-style, k=4 like the app). */
export function retrieve(book: BookDoc, query: string, k = 4, fetchK = 10): Retrieved[] {
  const terms = tokenize(query)
  if (!terms.length) return []

  // document frequency for idf weighting
  const df = new Map<string, number>()
  const chunkTokens = book.chunks.map((c) => tokenize(c.text))
  for (const toks of chunkTokens) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const N = book.chunks.length
  const idf = (t: string) => Math.log(1 + N / (1 + (df.get(t) ?? 0)))

  const scored = book.chunks.map((chunk, i) => {
    const toks = chunkTokens[i]
    if (!toks.length) return { chunk, raw: 0 }
    const tf = new Map<string, number>()
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1)
    let raw = 0
    for (const term of terms) {
      const f = tf.get(term) ?? 0
      if (f) raw += (1 + Math.log(f)) * idf(term)
      // stemming-lite: prefix match for plural/tense variants
      else {
        for (const [tok, f2] of tf) {
          if (tok.startsWith(term) || term.startsWith(tok)) {
            raw += 0.5 * (1 + Math.log(f2)) * idf(term)
            break
          }
        }
      }
    }
    raw /= Math.sqrt(toks.length) + 1
    return { chunk, raw }
  })

  const max = Math.max(...scored.map((s) => s.raw), 1e-9)
  const candidates = scored
    .filter((s) => s.raw > 0)
    .sort((a, b) => b.raw - a.raw)
    .slice(0, fetchK)

  // diversity: avoid two chunks from the same page when possible
  const picked: typeof candidates = []
  const usedPages = new Set<number>()
  for (const c of candidates) {
    if (picked.length >= k) break
    if (!usedPages.has(c.chunk.page)) {
      picked.push(c)
      usedPages.add(c.chunk.page)
    }
  }
  for (const c of candidates) {
    if (picked.length >= k) break
    if (!picked.includes(c)) picked.push(c)
  }

  return picked.map((p) => ({ chunk: p.chunk, score: Math.min(1, p.raw / max) }))
}

/* ------------------------- answer composer -------------------------- */

/** Demo answer composer — quotes the most relevant passages with page cites. */
export function composeAnswer(book: BookDoc, query: string): Answer {
  const retrieved = retrieve(book, query)
  const strong = retrieved.filter((r) => r.score > 0.12)
  if (!strong.length) {
    return {
      text: 'I could not find the answer in the document.',
      found: false,
      retrieved: [],
    }
  }

  const terms = tokenize(query)
  const sentences: { s: string; page: number; hits: number }[] = []
  for (const r of strong.slice(0, 3)) {
    for (const s of splitSentences(r.chunk.text)) {
      const low = s.toLowerCase()
      const hits = terms.reduce((n, t) => n + (low.includes(t) ? 1 : 0), 0)
      if (hits > 0 && s.length > 30 && s.length < 420) {
        sentences.push({ s, page: r.chunk.page, hits })
      }
    }
  }
  sentences.sort((a, b) => b.hits - a.hits)

  const picked: typeof sentences = []
  for (const s of sentences) {
    if (picked.length >= 3) break
    if (!picked.some((p) => p.s === s.s)) picked.push(s)
  }

  const title = book.name.replace(/\.pdf$/i, '')
  let text: string
  if (picked.length) {
    const body = picked
      .map((p) => `${p.s} (p. ${p.page + 1})`)
      .join(' ')
    text = `Based on “${title}”:\n\n${body}`
  } else {
    const top = strong[0]
    const excerpt = top.chunk.text.slice(0, 380).trim()
    text = `The closest passage in “${title}” (p. ${top.chunk.page + 1}):\n\n${excerpt}…`
  }

  return { text, found: true, retrieved }
}
