import os
import shutil
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import List
from pydantic import BaseModel

import chromadb
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
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
    allow_origins=["*"], # Allows your Vercel frontend to connect
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
llm = ChatGroq(model_name="llama-3.1-8b-instant") 

chroma_client = chromadb.PersistentClient(path="./chroma_db")
COLLECTION_NAME = "study_notes"

class Message(BaseModel):
    sender: str
    text: str

class QueryRequest(BaseModel):
    question: str
    history: List[Message] = []

@app.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    try:
        try:
            chroma_client.delete_collection(name=COLLECTION_NAME)
        except:
            pass 

        all_splits = []
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=600, chunk_overlap=100)

        for file in files:
            # Keep original filename so it shows up in citations!
            file_location = file.filename
            with open(file_location, "wb+") as file_object:
                shutil.copyfileobj(file.file, file_object)

            loader = PyPDFLoader(file_location)
            docs = loader.load()
            splits = text_splitter.split_documents(docs)
            all_splits.extend(splits)

            os.remove(file_location)

        vectorstore = Chroma.from_documents(
            documents=all_splits, 
            embedding=embeddings, 
            persist_directory="./chroma_db",
            collection_name=COLLECTION_NAME
        )

        return {"message": f"Successfully processed {len(files)} document(s)!"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/query")
async def query_notes(request: QueryRequest):
    vectorstore = Chroma(
        persist_directory="./chroma_db", 
        embedding_function=embeddings,
        collection_name=COLLECTION_NAME
    )
    
    # INCREASED to 15 chunks so it can read across multiple PDFs!
    retriever = vectorstore.as_retriever(search_kwargs={"k": 15})

    chat_history = []
    for msg in request.history:
        if msg.sender == "You":
            chat_history.append(HumanMessage(content=msg.text))
        else:
            chat_history.append(AIMessage(content=msg.text))

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

    response = rag_chain.invoke({
        "input": request.question,
        "chat_history": chat_history
    })
    
    # --- EXTRACT DOCUMENT NAME + PAGE NUMBER ---
    source_info = []
    for doc in response["context"]:
        file_path = doc.metadata.get("source", "Unknown")
        filename = os.path.basename(file_path) # Gets just the file name
        page = doc.metadata.get("page", 0) + 1
        source_info.append(f"{filename} (Pg {page})")
            
    unique_sources = sorted(list(set(source_info)))
    
    return {
        "answer": response["answer"],
        "sources": unique_sources # Changed 'pages' to 'sources'
    }