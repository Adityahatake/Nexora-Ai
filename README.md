# Nexora · RAG Book Assistant 📚✨

Nexora is a high-performance RAG (Retrieval-Augmented Generation) application featuring:
- **Backend**: FastAPI with LangChain, Chroma vector database (`book_collection`), OpenAI Embeddings, and Groq LLM (`llama-3.3-70b-versatile`).
- **Frontend**: Luxury Indian-inspired aesthetic React interface built with Vite, Tailwind CSS, Lucide icons, and Framer Motion.

---

## 🚀 Quick Start

### 1. Configure Environment Variables
Edit the [`.env`](file:///.env) file in the root directory:
```env
OPENAI_API_KEY=your_openai_api_key_here
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

### 2. Run the Backend & Web App (Single Command)
Run [`app.py`](file:///app.py) using the project Python virtual environment:
```powershell
.\.venv\Scripts\python.exe app.py
```
This starts the FastAPI server on **`http://127.0.0.1:8000`** and serves:
- 🌐 **Full React Interface** at `http://127.0.0.1:8000/`
- ⚡ **REST API Endpoints** at `http://127.0.0.1:8000/api/...`
- 📑 **Interactive API Docs (Swagger UI)** at `http://127.0.0.1:8000/docs`

---

## 🛠️ Development Mode (Hot Reloading)

If you are modifying the React UI in `app/`:

1. **Start FastAPI Backend**:
   ```powershell
   .\.venv\Scripts\python.exe app.py
   ```
2. **Start Vite Dev Server** (in a separate terminal):
   ```powershell
   cd app
   npx pnpm dev
   ```
   Open **`http://localhost:3000`**. All `/api` requests will automatically proxy to the FastAPI backend running on port 8000.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status` | Vectorstore health, thread count, API key availability |
| `POST` | `/api/upload` | Multipart PDF upload & parsing with PyPDFLoader |
| `POST` | `/api/index` | Chunking & embedding into Chroma DB |
| `POST` | `/api/ask` | MMR retrieval (k=4) & Groq LLM answer generation |
| `POST` | `/api/reset` | Clear database and document session |
