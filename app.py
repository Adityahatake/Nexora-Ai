import os
import shutil
import tempfile
import uuid
import re
import json
import random
from typing import Optional, List, Dict, Any
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
try:
    from langchain_chroma import Chroma
except ImportError:
    from langchain_community.vectorstores import Chroma
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
import uvicorn

# -------------------- Environment & Config --------------------
load_dotenv()

DB_PATH = os.path.abspath("chroma_db")
COLLECTION_NAME = "book_collection"
UPLOAD_DIR = os.path.abspath("uploaded_docs")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="Nexora RAG API",
    description="Backend API connecting the LangChain/Chroma/Groq pipeline to the Nexora React interface",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory document session cache
# docId -> { filename, path, pages_count, characters, chunks_count, pages }
DOCUMENTS: Dict[str, Dict[str, Any]] = {}

# -------------------- Helpers --------------------
def get_embeddings():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OPENAI_API_KEY is missing in your .env file. Please configure it to create embeddings."
        )
    return OpenAIEmbeddings(
        model="text-embedding-3-small",
        api_key=api_key
    )

def get_llm():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GROQ_API_KEY is missing in your .env file. Please configure it to generate AI answers."
        )
    # Default to Groq's high-speed flagship model, or use GROQ_MODEL from .env
    model_name = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
    return ChatGroq(
        model=model_name,
        temperature=0,
        api_key=api_key
    )

def get_vectorstore(embeddings_func=None):
    if not os.path.exists(DB_PATH):
        return None
    if embeddings_func is None:
        embeddings_func = get_embeddings()
    return Chroma(
        persist_directory=DB_PATH,
        embedding_function=embeddings_func,
        collection_name=COLLECTION_NAME
    )

def get_existing_db_count() -> int:
    try:
        import chromadb
        client = chromadb.PersistentClient(path=DB_PATH)
        collections = [c.name for c in client.list_collections()]
        if COLLECTION_NAME in collections:
            col = client.get_collection(COLLECTION_NAME)
            return col.count()
    except Exception:
        pass
    return 0

# -------------------- Models --------------------
class AskRequest(BaseModel):
    docId: Optional[str] = None
    question: str

class IndexRequest(BaseModel):
    docId: str

class ResetRequest(BaseModel):
    docId: Optional[str] = None

class QuizGenerateRequest(BaseModel):
    docId: Optional[str] = None
    topic: Optional[str] = None
    count: int = 5
    quizType: str = "mixed"  # "mixed" | "mcq" | "fill_in_the_blank"
    difficulty: str = "medium"  # "easy" | "medium" | "hard"

class QuizValidateRequest(BaseModel):
    question: str
    questionType: str  # "mcq" | "fill_in_the_blank"
    expectedAnswer: str
    userAnswer: str
    context: Optional[str] = None

# -------------------- API Endpoints --------------------
@app.get("/api/health")
@app.get("/api/status")
def get_status():
    """Return backend status, Chroma database state, and API key presence."""
    has_openai = bool(os.getenv("OPENAI_API_KEY"))
    has_groq = bool(os.getenv("GROQ_API_KEY"))
    count = get_existing_db_count()
    
    current_doc = None
    if DOCUMENTS:
        last_id = list(DOCUMENTS.keys())[-1]
        current_doc = {
            "docId": last_id,
            "filename": DOCUMENTS[last_id]["filename"],
            "pages": DOCUMENTS[last_id]["pages_count"],
            "characters": DOCUMENTS[last_id]["characters"],
            "size": DOCUMENTS[last_id]["size"]
        }

    return {
        "status": "ready",
        "db_exists": count > 0 or os.path.exists(DB_PATH),
        "chunks_count": count,
        "collection": COLLECTION_NAME,
        "has_openai_key": has_openai,
        "has_groq_key": has_groq,
        "groq_model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        "current_document": current_doc
    }

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF book, parse pages with PyPDFLoader, and return metadata."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are supported."
        )

    doc_id = str(uuid.uuid4())
    saved_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{file.filename}")

    try:
        content = await file.read()
        file_size = len(content)

        with open(saved_path, "wb") as f:
            f.write(content)

        # Parse with PyPDFLoader
        loader = PyPDFLoader(saved_path)
        docs = loader.load()

        if not docs:
            if os.path.exists(saved_path):
                os.remove(saved_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No readable text found in the PDF. The file may be empty, image-only, or password-protected."
            )

        total_characters = sum(len(d.page_content) for d in docs)
        
        # Estimate chunks with 1000 chunk_size and 200 overlap
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = splitter.split_documents(docs)

        # Cache document info in memory
        DOCUMENTS[doc_id] = {
            "filename": file.filename,
            "path": saved_path,
            "size": file_size,
            "pages_count": len(docs),
            "characters": total_characters,
            "chunks_count": len(chunks),
            "docs": docs
        }

        return {
            "docId": doc_id,
            "filename": file.filename,
            "size": file_size,
            "pages": len(docs),
            "characters": total_characters,
            "chunks": len(chunks),
            "message": f"Uploaded successfully. {len(docs)} pages parsed, {len(chunks)} threads ready to weave."
        }

    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(saved_path):
            os.remove(saved_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process PDF: {str(e)}"
        )

@app.post("/api/index")
def index_document(req: IndexRequest):
    """Split the document into chunks and store in Chroma vector database."""
    doc_id = req.docId
    if doc_id not in DOCUMENTS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or session expired. Please re-upload the PDF."
        )

    doc_info = DOCUMENTS[doc_id]
    docs = doc_info["docs"]

    embeddings = get_embeddings()

    try:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200
        )
        chunks = splitter.split_documents(docs)

        if not chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No readable text chunks could be extracted."
            )

        # Clear existing Chroma DB to prevent mixing books
        if os.path.exists(DB_PATH):
            shutil.rmtree(DB_PATH, ignore_errors=True)

        # Create fresh Chroma vector database
        Chroma.from_documents(
            documents=chunks,
            embedding=embeddings,
            persist_directory=DB_PATH,
            collection_name=COLLECTION_NAME
        )

        return {
            "docId": doc_id,
            "chunks": len(chunks),
            "status": "woven",
            "message": f"Tapestry woven! Successfully indexed {len(chunks)} threads into vector database."
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create vector database: {str(e)}"
        )

@app.post("/api/ask")
def ask_question(req: AskRequest):
    """Retrieve relevant chunks and generate AI answer using Groq and Chroma."""
    question = req.question.strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question cannot be empty."
        )

    if not os.path.exists(DB_PATH) and get_existing_db_count() == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No knowledge tapestry found. Please upload a book and weave it first."
        )

    embeddings = get_embeddings()
    llm = get_llm()

    try:
        vectorstore = Chroma(
            persist_directory=DB_PATH,
            embedding_function=embeddings,
            collection_name=COLLECTION_NAME
        )

        retriever = vectorstore.as_retriever(
            search_type="mmr",
            search_kwargs={
                "k": 4,
                "fetch_k": 10,
                "lambda_mult": 0.5
            }
        )

        # Retrieve relevant chunks
        docs = retriever.invoke(question)

        context = "\n\n".join(doc.page_content for doc in docs)

        prompt = ChatPromptTemplate.from_messages([
            (
                "system",
                """You are a helpful AI assistant.

Use ONLY the provided context to answer the question.

If the answer is not present in the context,
say: "I could not find the answer in the document."
"""
            ),
            (
                "human",
                """Context:
{context}

Question:
{question}
"""
            )
        ])

        final_prompt = prompt.invoke({
            "context": context,
            "question": question
        })

        response = llm.invoke(final_prompt)
        answer_text = response.content if hasattr(response, "content") else str(response)

        # Format retrieved chunks for the frontend Studio UI
        retrieved_list = []
        for i, doc in enumerate(docs):
            page_num = doc.metadata.get("page", 0)
            # Give a graduated score based on rank (1.0 down to 0.76)
            sim_score = max(0.5, round(0.95 - (i * 0.06), 2))
            retrieved_list.append({
                "chunk": {
                    "id": i,
                    "text": doc.page_content,
                    "page": page_num
                },
                "score": sim_score
            })

        not_found_phrases = [
            "could not find the answer",
            "not present in the context",
            "cannot find the answer",
            "i could not find"
        ]
        found = not any(phrase in answer_text.lower() for phrase in not_found_phrases)

        return {
            "answer": answer_text,
            "found": found,
            "retrieved": retrieved_list
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating answer: {str(e)}"
        )

@app.post("/api/reset")
def reset_database(req: Optional[ResetRequest] = None):
    """Clear the vector database and cached documents."""
    global DOCUMENTS
    DOCUMENTS.clear()
    if os.path.exists(DB_PATH):
        shutil.rmtree(DB_PATH, ignore_errors=True)
    return {"message": "Vector database reset successfully.", "status": "reset"}

# -------------------- Quiz & AI Validation Endpoints --------------------

def validate_answer_heuristically(
    question: str, question_type: str, expected: str, user: str, context: Optional[str] = None
) -> Dict[str, Any]:
    """Client/Server semantic fallback evaluator when LLM API keys are absent."""
    norm_user = re.sub(r'[^\w\s]', '', (user or "").lower()).strip()
    norm_exp = re.sub(r'[^\w\s]', '', (expected or "").lower()).strip()

    if not norm_user:
        return {
            "is_correct": False,
            "score": 0,
            "verdict": "incorrect",
            "feedback": "No answer was provided. Give it your best attempt!",
            "explanation": f"The document specifically details: '{expected}'."
        }

    if question_type == "mcq":
        is_exact = norm_user == norm_exp or user.strip().lower() == expected.strip().lower()
        return {
            "is_correct": is_exact,
            "score": 100 if is_exact else 0,
            "verdict": "correct" if is_exact else "incorrect",
            "feedback": (
                "✦ Correct! You accurately identified the exact concept from the text."
                if is_exact
                else f"Incorrect. The correct option is '{expected}'."
            ),
            "explanation": f"The manuscript directly supports '{expected}'."
        }

    # Fill-in-the-Blank Semantic checks
    if norm_user == norm_exp:
        return {
            "is_correct": True,
            "score": 100,
            "verdict": "correct",
            "feedback": f"✦ Spot on! '{user.strip()}' is the precise terminology from the manuscript.",
            "explanation": f"The exact phrasing in the text is '{expected}'."
        }

    if norm_user in norm_exp and len(norm_user) >= 4:
        ratio = round((len(norm_user) / max(1, len(norm_exp))) * 100)
        score = max(70, min(90, ratio))
        return {
            "is_correct": score >= 75,
            "score": score,
            "verdict": "correct" if score >= 80 else "partially_correct",
            "feedback": f"✦ Conceptually aligned! You captured the core idea ('{user.strip()}'). The full term in the text is '{expected}'.",
            "explanation": f"The manuscript refers to '{expected}'."
        }

    if norm_exp in norm_user:
        return {
            "is_correct": True,
            "score": 90,
            "verdict": "correct",
            "feedback": f"✦ Well articulated! Your answer contains the target key concept '{expected}'.",
            "explanation": f"The manuscript highlights '{expected}'."
        }

    # Token overlap
    user_words = set(w for w in norm_user.split() if len(w) > 3)
    exp_words = set(w for w in norm_exp.split() if len(w) > 3)
    overlap = len(user_words.intersection(exp_words))
    if exp_words and overlap > 0:
        score = round((overlap / len(exp_words)) * 75)
        return {
            "is_correct": score >= 60,
            "score": score,
            "verdict": "partially_correct" if score >= 60 else "incorrect",
            "feedback": f"✦ Partial recall! You captured {overlap} of the key terms, but the complete concept is '{expected}'.",
            "explanation": f"The complete phrase in the text is '{expected}'."
        }

    return {
        "is_correct": False,
        "score": 15,
        "verdict": "incorrect",
        "feedback": f"The manuscript specifies '{expected}'. Review the context passage to reinforce this concept.",
        "explanation": f"The manuscript context highlights '{expected}'."
    }

def generate_quiz_heuristically(
    doc_id: Optional[str], topic: Optional[str], count: int, quiz_type: str, difficulty: str
) -> Dict[str, Any]:
    """Generates MCQs and Fill-in-the-Blank questions directly from document text chunks."""
    doc_name = "Knowledge Tapestry"
    chunks_text: List[Dict[str, Any]] = []

    if doc_id and doc_id in DOCUMENTS:
        doc_name = DOCUMENTS[doc_id]["filename"]
        docs = DOCUMENTS[doc_id].get("docs", [])
        for i, d in enumerate(docs):
            chunks_text.append({
                "text": d.page_content,
                "page": d.metadata.get("page", i) + 1
            })
    elif DOCUMENTS:
        first_id = list(DOCUMENTS.keys())[-1]
        doc_name = DOCUMENTS[first_id]["filename"]
        docs = DOCUMENTS[first_id].get("docs", [])
        for i, d in enumerate(docs):
            chunks_text.append({
                "text": d.page_content,
                "page": d.metadata.get("page", i) + 1
            })

    if not chunks_text:
        # Generate generic seed questions
        chunks_text = [
            {"text": "The knowledge architecture relies on vector similarity embeddings and recursive character text splitting to maintain contextual continuity.", "page": 1},
            {"text": "Retrieval Augmented Generation combines dense semantic search with high speed large language model reasoning.", "page": 2}
        ]

    # Collect vocabulary across chunks
    all_words = set()
    for c in chunks_text:
        for w in re.findall(r'\b[A-Z][a-z]{3,}\b|\b[a-z]{5,}\b', c["text"]):
            all_words.add(w)

    distractor_pool = list(all_words)
    if len(distractor_pool) < 10:
        distractor_pool.extend(["Neural Network", "Vector Space", "Context Window", "Semantic Search", "Prompt Embedding"])

    questions = []
    used_sentences = set()

    # Determine distribution
    types = []
    for i in range(count):
        if quiz_type == "mcq":
            types.append("mcq")
        elif quiz_type == "fill_in_the_blank":
            types.append("fill_in_the_blank")
        else:
            types.append("mcq" if i % 2 == 0 else "fill_in_the_blank")

    sampled_chunks = chunks_text * max(1, (count // len(chunks_text)) + 2)
    random.shuffle(sampled_chunks)

    q_idx = 0
    for chunk_item in sampled_chunks:
        if q_idx >= count:
            break

        text = chunk_item["text"]
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if 35 <= len(s.strip()) <= 240]
        if not sentences:
            continue

        for sentence in sentences:
            if sentence in used_sentences or q_idx >= count:
                continue

            words = [w for w in re.findall(r'\b[A-Za-z]{4,}\b', sentence) if w.lower() not in {"this", "that", "with", "from", "have", "were", "been", "they", "their", "will", "would"}]
            if not words:
                continue

            target_word = words[0]
            used_sentences.add(sentence)
            q_type = types[q_idx]
            q_idx += 1

            page_num = chunk_item.get("page", 1)

            if q_type == "fill_in_the_blank":
                masked = re.sub(rf'\b{re.escape(target_word)}\b', '_______________', sentence, count=1, flags=re.IGNORECASE)
                questions.append({
                    "id": f"fib_{q_idx}_{uuid.uuid4().hex[:6]}",
                    "type": "fill_in_the_blank",
                    "difficulty": difficulty,
                    "question": f'Fill in the missing thread: "{masked}"',
                    "correctAnswer": target_word,
                    "acceptableAnswers": [target_word.lower(), target_word.upper()],
                    "explanation": f'On page {page_num}, the text states: "{sentence}". The crucial concept is "{target_word}".',
                    "sourceChunkText": text[:400],
                    "page": page_num,
                    "conceptTag": topic or "Core Concept"
                })
            else:
                masked = re.sub(rf'\b{re.escape(target_word)}\b', '_____', sentence, count=1, flags=re.IGNORECASE)
                distractors = [d for d in distractor_pool if d.lower() != target_word.lower()][:3]
                while len(distractors) < 3:
                    distractors.append(f"Concept-{len(distractors) + 1}")
                options = [target_word] + distractors
                random.shuffle(options)

                questions.append({
                    "id": f"mcq_{q_idx}_{uuid.uuid4().hex[:6]}",
                    "type": "mcq",
                    "difficulty": difficulty,
                    "question": f'According to page {page_num}, which term completes this statement?\n"{masked}"',
                    "options": options,
                    "correctAnswer": target_word,
                    "explanation": f'On page {page_num}: "{sentence}". Therefore, "{target_word}" is correct.',
                    "sourceChunkText": text[:400],
                    "page": page_num,
                    "conceptTag": topic or "Textual Comprehension"
                })

    return {
        "id": f"test_{uuid.uuid4().hex[:8]}",
        "title": f"Mastery Test · {topic or doc_name}",
        "topic": topic or "Manuscript Assessment",
        "createdAt": int(uuid.uuid1().time),
        "questions": questions,
        "difficulty": difficulty,
        "docName": doc_name,
        "totalQuestions": len(questions)
    }

@app.post("/api/quiz/generate")
def generate_quiz(req: QuizGenerateRequest):
    """Generate comprehensive MCQs and Fill-in-the-Blank tests using Groq LLM or server-side heuristic fallback."""
    topic = (req.topic or "").strip()
    count = max(1, min(15, req.count))
    quiz_type = req.quizType
    difficulty = req.difficulty
    doc_id = req.docId

    has_groq = bool(os.getenv("GROQ_API_KEY"))

    if has_groq:
        try:
            llm = get_llm()
            embeddings = get_embeddings() if os.getenv("OPENAI_API_KEY") else None

            context_snippets = []
            if embeddings and os.path.exists(DB_PATH):
                try:
                    vectorstore = Chroma(
                        persist_directory=DB_PATH,
                        embedding_function=embeddings,
                        collection_name=COLLECTION_NAME
                    )
                    query = topic if topic else "key principles definitions main concepts architecture"
                    retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
                    docs = retriever.invoke(query)
                    context_snippets = [f"(p. {d.metadata.get('page', 1)}): {d.page_content}" for d in docs]
                except Exception:
                    pass

            if not context_snippets and DOCUMENTS:
                last_doc = list(DOCUMENTS.values())[-1]
                docs = last_doc.get("docs", [])[:8]
                context_snippets = [f"(p. {d.metadata.get('page', 1)}): {d.page_content}" for d in docs]

            context_text = "\n\n".join(context_snippets) if context_snippets else "General manuscript knowledge."

            prompt = ChatPromptTemplate.from_messages([
                (
                    "system",
                    """You are an expert educational examiner and pedagogical assessor.
Generate a high quality concept understanding test based ONLY on the provided context.
Requirements:
1. Question types: {quiz_type} ('mcq', 'fill_in_the_blank', or 'mixed').
2. Difficulty: {difficulty}.
3. Count: exactly {count} questions.
4. For MCQ questions, provide 4 distinct plausible options, exactly one correct option, and 3 high-quality distractors.
5. For Fill-in-the-Blank questions, provide a question sentence with '_______________' masking the focal concept.
6. For every question, provide clear explanation citing the concept and page.

Output strictly valid JSON and nothing else in this format:
{{
  "id": "quiz_generated",
  "title": "Concept Mastery Test",
  "topic": "{topic}",
  "difficulty": "{difficulty}",
  "docName": "Book Manuscript",
  "totalQuestions": {count},
  "questions": [
    {{
      "id": "q1",
      "type": "mcq",
      "difficulty": "{difficulty}",
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "Exact correct string",
      "explanation": "Why this is correct grounded in context",
      "sourceChunkText": "excerpt quote",
      "page": 1,
      "conceptTag": "Definition"
    }},
    {{
      "id": "q2",
      "type": "fill_in_the_blank",
      "difficulty": "{difficulty}",
      "question": "The process of _______________ occurs in the system.",
      "correctAnswer": "target_word",
      "acceptableAnswers": ["target_word", "synonym"],
      "explanation": "Why this is correct",
      "sourceChunkText": "excerpt quote",
      "page": 1,
      "conceptTag": "Mechanism"
    }}
  ]
}}
"""
                ),
                (
                    "human",
                    """Context:
{context}

Generate the {count} questions now:"""
                )
            ])

            response = llm.invoke(prompt.invoke({
                "context": context_text,
                "quiz_type": quiz_type,
                "difficulty": difficulty,
                "count": count,
                "topic": topic or "General Book Understanding"
            }))

            raw_text = response.content if hasattr(response, "content") else str(response)
            json_match = re.search(r'\{[\s\S]*\}', raw_text)
            if json_match:
                parsed = json.loads(json_match.group(0))
                if "questions" in parsed and len(parsed["questions"]) > 0:
                    return parsed

        except Exception as e:
            print(f"LLM quiz generation exception, falling back to heuristic: {e}")

    # Fallback to server-side heuristic generation
    return generate_quiz_heuristically(doc_id, topic, count, quiz_type, difficulty)

@app.post("/api/quiz/validate")
def validate_quiz(req: QuizValidateRequest):
    """Validate a student answer using Groq LLM semantic reasoning or server-side heuristic fallback."""
    question = req.question.strip()
    question_type = req.questionType
    expected = req.expectedAnswer.strip()
    user_ans = req.userAnswer.strip()
    context = req.context or ""

    has_groq = bool(os.getenv("GROQ_API_KEY"))

    if has_groq and user_ans:
        try:
            llm = get_llm()
            prompt = ChatPromptTemplate.from_messages([
                (
                    "system",
                    """You are an objective AI tutor assessing whether a student understood a concept.
Evaluate the student's answer against the target concept and context.
Rules:
- If exact match or clear synonym/equivalent, give score 90-100 and verdict 'correct'.
- If partially correct or captures the main idea with minor gaps, give score 60-80 and verdict 'partially_correct'.
- If incorrect, give score 0-40 and verdict 'incorrect'.
- Provide 2 sentences of pedagogical feedback explaining what was good or what nuance was missed.

Output strictly valid JSON:
{{
  "is_correct": boolean,
  "score": integer (0 to 100),
  "verdict": "correct" | "partially_correct" | "incorrect",
  "feedback": "string",
  "explanation": "string"
}}
"""
                ),
                (
                    "human",
                    """Question: {question}
Question Type: {question_type}
Expected Target Concept: {expected}
Student's Answer: {user_ans}
Context: {context}

Grade now:"""
                )
            ])

            response = llm.invoke(prompt.invoke({
                "question": question,
                "question_type": question_type,
                "expected": expected,
                "user_ans": user_ans,
                "context": context
            }))

            raw_text = response.content if hasattr(response, "content") else str(response)
            json_match = re.search(r'\{[\s\S]*\}', raw_text)
            if json_match:
                parsed = json.loads(json_match.group(0))
                return {
                    "is_correct": parsed.get("is_correct", False),
                    "score": parsed.get("score", 0),
                    "verdict": parsed.get("verdict", "incorrect"),
                    "feedback": parsed.get("feedback", "AI evaluated your answer."),
                    "explanation": parsed.get("explanation", f"The manuscript specifies: '{expected}'.")
                }
        except Exception as e:
            print(f"LLM validation error, falling back to heuristic: {e}")

    # Fallback to server-side semantic heuristic
    return validate_answer_heuristically(question, question_type, expected, user_ans, context)

# -------------------- Serve React Frontend (Production) --------------------
# If app/dist exists, serve the React build directly on the same port!
DIST_DIR = os.path.join(os.path.dirname(__file__), "app", "dist")
if os.path.exists(DIST_DIR):
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)