import os
import shutil
import sqlite3
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel

import chromadb
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_groq import ChatGroq
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_classic.chains.history_aware_retriever import create_history_aware_retriever
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURATION ---
embeddings = HuggingFaceEndpointEmbeddings(
    huggingfacehub_api_token=os.environ.get("HF_TOKEN"),
    repo_id="sentence-transformers/all-MiniLM-L6-v2"
)
llm = ChatGroq(model_name="llama-3.1-8b-instant") 
chroma_client = chromadb.PersistentClient(path="./chroma_db")

# --- SQLITE DATABASE SETUP (Conversational Memory) ---
def init_db():
    conn = sqlite3.connect("chat_history.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            sender TEXT NOT NULL,
            text TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_db()

# --- HELPER FUNCTIONS ---
def get_chat_history(session_id: str, limit: int = 6):
    """Fetches the last N messages for a specific session to prevent context overflow."""
    conn = sqlite3.connect("chat_history.db")
    cursor = conn.cursor()
    # Get the last 'limit' messages, ordered by oldest to newest
    cursor.execute("""
        SELECT sender, text FROM (
            SELECT sender, text, timestamp FROM messages 
            WHERE session_id = ? 
            ORDER BY timestamp DESC LIMIT ?
        ) ORDER BY timestamp ASC
    """, (session_id, limit))
    
    rows = cursor.fetchall()
    conn.close()
    
    history = []
    for sender, text in rows:
        if sender == "You":
            history.append(HumanMessage(content=text))
        else:
            history.append(AIMessage(content=text))
    return history

def save_message(session_id: str, sender: str, text: str):
    """Saves a single message to the database."""
    conn = sqlite3.connect("chat_history.db")
    cursor = conn.cursor()
    cursor.execute("INSERT INTO messages (session_id, sender, text) VALUES (?, ?, ?)", (session_id, sender, text))
    conn.commit()
    conn.close()

# --- API MODELS ---
class QueryRequest(BaseModel):
    session_id: str # Crucial for identifying the user
    question: str

# --- ENDPOINTS ---

@app.post("/upload")
async def upload_files(
    session_id: str = Form(...), # Require session_id from frontend
    files: List[UploadFile] = File(...)
):
    try:
        # 1. Create a unique collection for this specific user/session
        collection_name = f"study_notes_{session_id}"
        
        all_splits = []
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=600, chunk_overlap=100)

        for file in files:
            file_location = file.filename
            with open(file_location, "wb+") as file_object:
                shutil.copyfileobj(file.file, file_object)

            loader = PyPDFLoader(file_location)
            docs = loader.load()
            splits = text_splitter.split_documents(docs)
            all_splits.extend(splits)

            os.remove(file_location)

        # 2. Append to the user's collection (No more delete_collection!)
        vectorstore = Chroma.from_documents(
            documents=all_splits, 
            embedding=embeddings, 
            persist_directory="./chroma_db",
            collection_name=collection_name
        )

        return {"message": f"Successfully added {len(files)} document(s) to your knowledge base!"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/query")
async def query_notes(request: QueryRequest):
    collection_name = f"study_notes_{request.session_id}"
    
    # 1. Check if the user has uploaded anything yet
    try:
        vectorstore = Chroma(
            persist_directory="./chroma_db", 
            embedding_function=embeddings,
            collection_name=collection_name
        )
    except:
        raise HTTPException(status_code=400, detail="Please upload a document first.")

    # 2. Reduced 'k' to 6 to prevent context window stuffing
    retriever = vectorstore.as_retriever(search_kwargs={"k": 6})

    # 3. Retrieve only the last 6 messages from the database
    chat_history = get_chat_history(request.session_id, limit=6)

    contextualize_q_prompt = ChatPromptTemplate.from_messages([
        ("system", "Given a chat history and the latest user question, formulate a standalone question which can be understood without the chat history. Do NOT answer the question, just reformulate it if needed and otherwise return it as is."),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ])
    history_aware_retriever = create_history_aware_retriever(llm, retriever, contextualize_q_prompt)

    qa_prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful study assistant. Use the following context to answer the user's question. Context: {context}"),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ])
    question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)
    rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)

    # 4. Invoke RAG
    response = rag_chain.invoke({
        "input": request.question,
        "chat_history": chat_history
    })
    
    # 5. Save the new interaction to the database
    save_message(request.session_id, "You", request.question)
    save_message(request.session_id, "AI", response["answer"])
    
    # Extract Sources
    source_info = []
    for doc in response["context"]:
        file_path = doc.metadata.get("source", "Unknown")
        filename = os.path.basename(file_path)
        page = doc.metadata.get("page", 0) + 1
        source_info.append(f"{filename} (Pg {page})")
            
    unique_sources = sorted(list(set(source_info)))
    
    return {
        "answer": response["answer"],
        "sources": unique_sources 
    }

@app.get("/history/{session_id}")
async def get_frontend_history(session_id: str):
    """Endpoint for the frontend to fetch past chat history on page load."""
    conn = sqlite3.connect("chat_history.db")
    cursor = conn.cursor()
    cursor.execute("SELECT sender, text FROM messages WHERE session_id = ? ORDER BY timestamp ASC", (session_id,))
    rows = cursor.fetchall()
    conn.close()
    
    return {"history": [{"sender": row[0], "text": row[1]} for row in rows]}