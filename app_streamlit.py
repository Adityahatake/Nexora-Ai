import streamlit as st
from dotenv import load_dotenv
import tempfile
import os
import shutil
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter                                                             
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate

# -------------------- Setup --------------------
load_dotenv()

st.set_page_config(
    page_title="RAG Book Assistant",
    page_icon="Glowing Fiery Lotus Mandala.png"
)

st.title("📚 RAG Book Assistant")
st.write("Upload a PDF and ask questions from the document")

DB_PATH = "chroma_db"

# -------------------- Embeddings --------------------
@st.cache_resource
def get_embeddings():
    return OpenAIEmbeddings(
        model="text-embedding-3-small",
        api_key=os.getenv("OPENAI_API_KEY")
    )

embeddings = get_embeddings()

# -------------------- Groq LLM --------------------
@st.cache_resource
def get_llm():
    return ChatGroq(
        model="openai/gpt-oss-20b",
        temperature=0,
        api_key=os.getenv("GROQ_API_KEY")
    )

llm = get_llm()

# -------------------- PDF Upload --------------------
uploaded_file = st.file_uploader(
    "Upload a PDF book",
    type="pdf"
)

if uploaded_file:
    current_file = uploaded_file.name

    if st.session_state.get("file_name") != current_file:
        st.session_state.file_name = current_file
        st.session_state.db_created = False

    st.success("PDF uploaded successfully!")

    if st.button("Create Vector Database"):
        if not os.getenv("OPENAI_API_KEY"):
            st.error("OPENAI_API_KEY is missing in .env")
            st.stop()

        with st.spinner("Processing document..."):
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=".pdf"
            ) as tmp_file:
                tmp_file.write(uploaded_file.getvalue())
                file_path = tmp_file.name

            try:
                # Load PDF
                loader = PyPDFLoader(file_path)
                docs = loader.load()

                # Split into chunks
                splitter = RecursiveCharacterTextSplitter(
                    chunk_size=1000,
                    chunk_overlap=200
                )
                chunks = splitter.split_documents(docs)

                if not chunks:
                    st.error("No readable text found in the PDF.")
                    st.stop()

                # Remove old database to prevent mixing books
                if os.path.exists(DB_PATH):
                    shutil.rmtree(DB_PATH)

                # Create vector database
                vectorstore = Chroma.from_documents(
                    documents=chunks,
                    embedding=embeddings,
                    persist_directory=DB_PATH,
                    collection_name="book_collection"
                )

                st.session_state.db_created = True
                st.success(
                    f"Vector database created! "
                    f"Processed {len(chunks)} chunks."
                )

            except Exception as e:
                st.session_state.db_created = False
                st.error(f"Error processing PDF: {e}")

            finally:
                if os.path.exists(file_path):
                    os.remove(file_path)

# -------------------- Load Vector Database --------------------
if (
    os.path.exists(DB_PATH)
    and st.session_state.get("db_created", False)
):
    vectorstore = Chroma(
        persist_directory=DB_PATH,
        embedding_function=embeddings,
        collection_name="book_collection"
    )

    retriever = vectorstore.as_retriever(
        search_type="mmr",
        search_kwargs={
            "k": 4,
            "fetch_k": 10,
            "lambda_mult": 0.5
        }
    )

    # -------------------- Prompt --------------------
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

    # -------------------- Question Answering --------------------
    st.divider()
    st.subheader("Ask Questions From the Book")

    query = st.text_input("Enter your question")

    if query:
        with st.spinner("Finding answer..."):
            try:
                # Retrieve relevant chunks
                docs = retriever.invoke(query)

                context = "\n\n".join(
                    doc.page_content for doc in docs
                )

                # Generate response
                final_prompt = prompt.invoke({
                    "context": context,
                    "question": query 
                })

                response = llm.invoke(final_prompt)

                st.write("### AI Answer")
                st.write(response.content)

                # Display retrieved context
                with st.expander("View Retrieved Context"):
                    for doc in docs:
                        st.write(doc.page_content)

                        page = doc.metadata.get("page")
                        if page is not None:
                            st.caption(f"Page: {page + 1}")

                        st.divider()

            except Exception as e:
                st.error(f"Error generating answer: {e}")

elif uploaded_file:
    st.info("Click 'Create Vector Database' to start asking questions.")
