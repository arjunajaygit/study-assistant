import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { 
  UploadCloud, Send, FileText, Bot, User, 
  Menu, X, Trash2, Sparkles, Circle, Layers
} from 'lucide-react'
import './App.css'

function App() {
  const [files, setFiles] = useState([]) 
  const [question, setQuestion] = useState("")
  const [chat, setChat] = useState([])
  const [isProcessed, setIsProcessed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [docStats, setDocStats] = useState({ count: 0 })
  const [sessionId, setSessionId] = useState("") // --- NEW: Session State ---

  const chatEndRef = useRef(null)
  
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chat, loading])

  // --- NEW: FETCH HISTORY ON PAGE LOAD ---
  useEffect(() => {
    // 1. Get or create a session ID
    let storedSession = localStorage.getItem("study_session_id");
    if (!storedSession) {
      storedSession = crypto.randomUUID(); // Built-in browser function
      localStorage.setItem("study_session_id", storedSession);
    }
    setSessionId(storedSession);

    // 2. Fetch history from the backend
    const fetchHistory = async () => {
      try {
        const res = await axios.get(`https://study-assistant-backend-gldu.onrender.com/history/${storedSession}`);
        if (res.data.history && res.data.history.length > 0) {
          setChat(res.data.history);
          setIsProcessed(true); // If they have history, they've already uploaded files
        }
      } catch (err) {
        console.log("No previous history or server waking up.");
      }
    };

    fetchHistory();
  }, []);

  const suggestions = ["Summarize key points", "What is the main argument?", "List important dates"]

  const uploadFiles = async () => {
    if (files.length === 0) return
    setLoading(true)
    
    const formData = new FormData()
    // --- NEW: Add session_id to formData ---
    formData.append("session_id", sessionId) 
    
    Array.from(files).forEach(file => {
      formData.append("files", file)
    })

    try {
      const res = await axios.post("https://study-assistant-backend-gldu.onrender.com/upload", formData)
      setIsProcessed(true)
      setDocStats({ count: files.length })
      setSidebarOpen(false) 
    } catch (err) { 
      // --- CHANGED: This will print the exact FastAPI error so we know what is missing ---
      console.error("Backend rejected the upload:", err.response?.data);
      const errorMsg = err.response?.data?.detail 
        ? JSON.stringify(err.response.data.detail) 
        : "Is the backend running?";
      alert(`Upload failed! Error: ${errorMsg}`);
    }
    setLoading(false)
  }

  const askQuestion = async (qText) => {
    const input = qText || question
    if (!input || !isProcessed) return
    
    const newHistory = [...chat, { sender: "You", text: input }]
    setChat(newHistory)
    setQuestion("")
    setLoading(true)

    try {
      // --- NEW: Send session_id, REMOVE old history array ---
      const payload = {
        session_id: sessionId,
        question: input
      }
      
      const res = await axios.post("https://study-assistant-backend-gldu.onrender.com/query", payload, {
        headers: { 'Content-Type': 'application/json' }
      })
      
      setChat(prev => [...prev, { 
        sender: "AI", 
        text: res.data.answer,
        pages: res.data.pages,
        sources: res.data.sources ?? (res.data.pages || []).map(page => `Page ${page}`)
      }])
    } catch (err) { setChat(prev => [...prev, { sender: "AI", text: "Error connecting to server." }]) }
    setLoading(false)
  }

  // --- NEW: CLEAR HISTORY FUNCTION ---
  const clearChat = () => {
    // Generate a brand new session ID to wipe the slate clean
    const newSession = crypto.randomUUID();
    localStorage.setItem("study_session_id", newSession);
    setSessionId(newSession);
    setChat([]);
    setIsProcessed(false);
  }

  return (
    <div className="app-container">
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <h2 className="syne-font" style={{ fontSize: '22px', color: '#7c6af7', letterSpacing: '1px' }}>STUDY.AI</h2>
          <X className="mobile-only" onClick={() => setSidebarOpen(false)} color="#94a3b8" />
        </div>

        <div style={{ flex: 1 }}>
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setFiles(e.dataTransfer.files); }}
            style={{ 
              border: '2px dashed var(--border-color)', borderRadius: '16px', padding: '32px 20px', 
              textAlign: 'center', backgroundColor: 'var(--bg-deep)', marginBottom: '24px', transition: 'all 0.2s'
            }}
          >
            <Layers size={36} color="var(--accent-violet)" style={{ animation: 'float 3s infinite ease-in-out', margin: '0 auto 12px auto' }} />
            <p style={{ color: 'var(--text-main)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
              {files.length > 0 ? `${files.length} document(s) selected` : "Drag & Drop PDFs"}
            </p>
            <input type="file" id="files" multiple hidden accept=".pdf" onChange={(e) => setFiles(e.target.files)} />
            <label htmlFor="files" style={{ color: 'var(--accent-violet)', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>Browse Files</label>
          </div>

          <button 
            onClick={uploadFiles} 
            disabled={files.length === 0 || loading}
            className="glow-button"
            style={{ 
              width: '100%', padding: '16px', borderRadius: '12px', border: 'none', 
              backgroundColor: files.length > 0 ? 'var(--border-color)' : 'var(--bg-deep)', 
              color: files.length > 0 ? 'white' : '#475569', fontWeight: 'bold', cursor: files.length > 0 ? 'pointer' : 'not-allowed',
              fontSize: '14px', letterSpacing: '0.5px'
            }}
          >
            {loading ? "PROCESSING..." : "PROCESS KNOWLEDGE"}
          </button>
        </div>
      </div>

      <div className="main-content">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-deep)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Menu className="mobile-only" onClick={() => setSidebarOpen(true)} color="#94a3b8" />
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '4px' }}>ACTIVE KNOWLEDGE BASE</p>
              <h4 style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
                <Circle size={10} fill={isProcessed ? "#10b981" : "#ef4444"} stroke="none" />
                {isProcessed ? "Knowledge Synced" : "Awaiting Upload..."}
              </h4>
            </div>
          </div>
          {/* --- NEW: Changed to use the clearChat function --- */}
          <button onClick={clearChat} title="Clear Chat & Restart" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px' }}>
            <Trash2 size={18} />
          </button>
        </div>

        <div className="chat-container">
          <div className="chat-inner">
            {chat.length === 0 && (
              <div style={{ margin: 'auto', textAlign: 'center', padding: '40px 20px' }}>
                <Sparkles size={48} color="var(--accent-violet)" style={{ margin: '0 auto 24px auto', filter: 'drop-shadow(0 0 12px var(--accent-glow))' }} />
                <h2 className="syne-font" style={{ fontSize: '28px', marginBottom: '12px' }}>Intelligence active.</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>Upload your notes and syllabus together to start chatting.</p>
              </div>
            )}

            {chat.map((msg, i) => (
              <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexDirection: msg.sender === "You" ? "row-reverse" : "row" }}>
                <div style={{ 
                  padding: '16px 24px', borderRadius: '24px', 
                  background: msg.sender === "You" ? 'linear-gradient(135deg, var(--accent-violet), #5a49d6)' : 'var(--surface-card)',
                  border: msg.sender === "AI" ? '1px solid var(--border-color)' : 'none',
                  maxWidth: '85%', fontSize: '15px', lineHeight: '1.6', color: 'var(--text-main)',
                  borderBottomRightRadius: msg.sender === "You" ? '8px' : '24px',
                  borderBottomLeftRadius: msg.sender === "AI" ? '8px' : '24px',
                }}>
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                  </div>
                  
                  {((msg.sources && msg.sources.length > 0) || (msg.pages && msg.pages.length > 0)) && (
                    <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'bold' }}>SOURCES:</span>
                      {(msg.sources || msg.pages.map(page => `Page ${page}`)).map(src => (
                        <span key={src} style={{ fontSize: '11px', backgroundColor: 'rgba(124, 106, 247, 0.15)', color: '#a78bfa', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(124, 106, 247, 0.3)'}}>
                          {src}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {loading && isProcessed && (
              <div style={{ display: 'flex', gap: '6px', padding: '16px 24px', backgroundColor: 'var(--surface-card)', borderRadius: '24px', borderBottomLeftRadius: '8px', width: 'fit-content', border: '1px solid var(--border-color)' }}>
                <div className="typing-dot" style={{ animationDelay: '0s' }} />
                <div className="typing-dot" style={{ animationDelay: '0.2s' }} />
                <div className="typing-dot" style={{ animationDelay: '0.4s' }} />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="input-container">
          <div className="input-inner">
            {isProcessed && chat.length === 0 && (
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {suggestions.map(s => (
                  <button key={s} onClick={() => askQuestion(s)} style={{ padding: '10px 18px', borderRadius: '100px', border: '1px solid var(--border-color)', background: 'var(--surface-card)', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent-violet)'} onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border-color)'}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            
            <div style={{ display: 'flex', backgroundColor: 'var(--surface-card)', padding: '8px', borderRadius: '20px', border: '1px solid var(--border-color)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              <input 
                disabled={!isProcessed}
                placeholder={isProcessed ? "Type your query..." : "Please process a document first..."}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && askQuestion()}
                style={{ flex: 1, background: 'none', border: 'none', color: 'white', padding: '12px 20px', outline: 'none', fontSize: '15px' }}
              />
              <button disabled={!isProcessed || !question.trim()} onClick={() => askQuestion()} style={{ background: isProcessed && question.trim() ? 'var(--accent-violet)' : 'var(--border-color)', border: 'none', borderRadius: '14px', padding: '12px 20px', cursor: isProcessed && question.trim() ? 'pointer' : 'default', transition: 'all 0.2s' }}>
                <Send size={20} color="white" />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

export default App