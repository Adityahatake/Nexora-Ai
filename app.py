import os
import shutil
import tempfile
import uuid
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

# -------------------- Serve React Frontend (Production) --------------------
# If app/dist exists, serve the React build directly on the same port!
DIST_DIR = os.path.join(os.path.dirname(__file__), "app", "dist")
if os.path.exists(DIST_DIR):
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)