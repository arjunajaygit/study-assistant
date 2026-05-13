# 📚 STUDY.AI

> 🚧 **Note:** This project is currently in active development. Features, UI, and API endpoints are subject to change as improvements are being made.

An AI-powered RAG (Retrieval-Augmented Generation) study assistant that allows users to upload PDFs and interact with them through context-aware conversations.

🌐 **Live Demo:** [https://study-assistant-xii-seven.vercel.app/](https://study-assistant-xii-seven.vercel.app/)

---

## ✨ Features

- **📄 Document Processing:** Upload and process multiple PDF study materials simultaneously.
- **🧠 Intelligent QA:** AI-powered question answering utilizing a robust RAG architecture.
- **💬 Conversational Memory:** Context-aware chat sessions that remember the flow of your study session.
- **⚡ High-Speed Generation:** Lightning-fast responses powered by Groq and Llama 3.
- **🔍 Semantic Search:** Highly accurate document retrieval using HuggingFace vector embeddings.
- **📑 Source Citations:** AI responses include precise citations mapping back to the exact PDF file name and page number.
- **💾 Persistent History:** Chat history safely stored and managed using a local SQLite database.
- **🚀 Full-Stack App:** Seamless integration between a React/Vite frontend and a FastAPI backend.

---

## 🛠️ Tech Stack

### Backend
- **Python** & **FastAPI**
- **LangChain** (AI Orchestration)
- **Groq** (`llama-3.1-8b-instant`)
- **HuggingFace Embeddings** (`all-MiniLM-L6-v2`)
- **ChromaDB** (Vector Database)
- **SQLite** (Relational Database)

### Frontend
- **React.js**
- **Vite**
- **CSS**

---

## 🏗️ Architecture Flow

```text
[ PDF Upload ]
      ↓
[ Text Extraction (PyPDFLoader) ]
      ↓
[ Chunking & Embedding Generation ]
      ↓
[ Store Embeddings in ChromaDB ]
      ↓
[ User Query ]
      ↓
[ Similarity Search in Vector DB ]
      ↓
[ LLM Response Generation (Llama 3) ]
      ↓
[ Answer delivered with Source Citations ]
