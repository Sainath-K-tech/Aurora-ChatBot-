import React, { useEffect, useRef, useState } from "react";
import "./App.css";
// Put your logo at: src/assets/logo.png  (or change this path)
import logo from "./assets/logo.png";

function App() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);

  // typing + voice + UI states
  const [typingMessage, setTypingMessage] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);

  // sidebar edit
  const [editingChatId, setEditingChatId] = useState(null);

  // drag/drop highlight
  const [isDragOver, setIsDragOver] = useState(false);

  const messagesRef = useRef(null);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);

  // ----- Quick actions (chips) -----
  // Each action maps to a slash command prefix that shows as a pill
  const quickActions = [
    { key: "code", label: "Code", slash: "/code ", icon: "💻" },
    { key: "analyze", label: "Analyze images", slash: "/analyze ", icon: "🔍" },
    { key: "plan", label: "Make a plan", slash: "/plan ", icon: "💡" },
    { key: "summarize", label: "Summarize text", slash: "/summarize ", icon: "📝" },
    { key: "brainstorm", label: "Brainstorm", slash: "/brainstorm ", icon: "✨" },
    { key: "analyze-data", label: "Analyze data", slash: "/analyze-data ", icon: "🎓" },
    { key: "advice", label: "Get advice", slash: "/advice ", icon: "🎯" },
  ];

  const matchedAction =
    query.startsWith("/")
      ? quickActions.find((a) => query.toLowerCase().startsWith(a.slash.trim()))
      : null;

  // ----- Load & save to localStorage -----
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("chatHistory")) || [];
    setChatHistory(saved);
    if (saved.length > 0) {
      setCurrentChatId(saved[0].id);
      setMessages(saved[0].messages || []);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("chatHistory", JSON.stringify(chatHistory));
  }, [chatHistory]);

  const startNewChat = () => {
    const id = Date.now();
    const chat = { id, name: `Chat ${chatHistory.length + 1}`, messages: [] };
    setChatHistory((prev) => [chat, ...prev]);
    setCurrentChatId(id);
    setMessages([]);
  };

  // ----- Scroll listener for header animation -----
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const onScroll = () => setHeaderScrolled(el.scrollTop > 8);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [messagesRef]);

  // ----- Voice input (Web Speech API) -----
  const ensureRecognition = () => {
    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    return rec;
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = ensureRecognition();
    if (!rec) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    recognitionRef.current = rec;
    setIsRecording(true);
    let finalText = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " ";
        else interim += t;
      }
      setQuery((finalText + interim).trim());
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);
    rec.start();
  };

  // ----- Helpers -----
  const loadChat = (chatId) => {
    const chat = chatHistory.find((c) => c.id === chatId);
    if (!chat) return;
    setCurrentChatId(chatId);
    setMessages(chat.messages || []);
  };

  const deleteChat = (chatId) => {
    const updated = chatHistory.filter((c) => c.id !== chatId);
    setChatHistory(updated);
    if (currentChatId === chatId) {
      if (updated.length) {
        setCurrentChatId(updated[0].id);
        setMessages(updated[0].messages || []);
      } else {
        setCurrentChatId(null);
        setMessages([]);
      }
    }
  };

  const handleRenameChat = (chatId, newName) => {
    const name = (newName || "").trim() || "Untitled";
    setChatHistory((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, name } : c))
    );
    setEditingChatId(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Quick action click -> insert slash command
  const handleQuickAction = (action) => {
    setQuery(action.slash);
    // show caret at end and focus
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // ----- Image pick / drag & drop -----
  const handleImagePick = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setPreviewImage(URL.createObjectURL(file));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewImage(URL.createObjectURL(file));
    }
  };

  const clearPreview = () => {
    setPreviewImage(null);
    setImageFile(null);
  };

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result.split(",")[1]); // drop data: prefix
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });

  // ----- Send message -----
  const handleSubmit = async () => {
    if (!query.trim() && !imageFile) return;
    if (!currentChatId) startNewChat(); // auto-create a chat if none

    setLoading(true);

    // Add user message (with optional image preview)
    const userMsg = {
      type: "user",
      text: query || (imageFile ? "[Image uploaded]" : ""),
      image: imageFile ? URL.createObjectURL(imageFile) : null,
    };
    const pending = [...messages, userMsg];
    setMessages(pending);

    try {
      // Build Gemini request
      const apiKey = "AIzaSyCj0bc14sUOm3mjRg7B2yTvyWQX28TFiuY"; // ⚠️ Don’t hardcode in production
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
        apiKey;

      const parts = [];
      if (query.trim()) parts.push({ text: query.trim() });

      if (imageFile) {
        const base64 = await fileToBase64(imageFile);
        parts.push({
          inline_data: {
            mime_type: imageFile.type || "image/png",
            data: base64,
          },
        });
      }

      const payload = {
        contents: [{ parts }],
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      let aiText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No response generated.";

      // Typing animation
      setTypingMessage("");
      let shown = "";
      for (let i = 0; i < aiText.length; i++) {
        shown += aiText[i];
        setTypingMessage(shown);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 20));
      }

      const final = [...pending, { type: "ai", text: aiText }];
      setMessages(final);
      setTypingMessage("");

      // persist
      setChatHistory((prev) =>
        prev.map((c) => (c.id === currentChatId ? { ...c, messages: final } : c))
      );

      setQuery("");
      clearPreview();
    } catch (e) {
      console.error(e);
      const errFinal = [
        ...pending,
        { type: "ai", text: "Sorry, something went wrong." },
      ];
      setMessages(errFinal);
      setChatHistory((prev) =>
        prev.map((c) => (c.id === currentChatId ? { ...c, messages: errFinal } : c))
      );
    } finally {
      setLoading(false);
      // auto-scroll down
      setTimeout(() => {
        messagesRef.current?.scrollTo({
          top: messagesRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
    }
  };

  return (
    <div className="chat-app">

      {/* Sidebar */}
      <aside className="chat-history">
        <div className="history-header">
          <h2>Chat History</h2>
          <button className="new-chat-btn" onClick={startNewChat}>➕ New</button>
        </div>

        <div className="history-list">
          {chatHistory.map((chat) => (
            <div
              key={chat.id}
              className={`history-item ${chat.id === currentChatId ? "active" : ""}`}
            >
              {editingChatId === chat.id ? (
                <input
                  className="rename-input"
                  type="text"
                  autoFocus
                  defaultValue={chat.name}
                  onBlur={(e) => handleRenameChat(chat.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameChat(chat.id, e.target.value);
                    if (e.key === "Escape") setEditingChatId(null);
                  }}
                />
              ) : (
                <button
                  className="history-title"
                  onClick={() => loadChat(chat.id)}
                  onDoubleClick={() => setEditingChatId(chat.id)}
                  title="Double-click to rename"
                >
                  {chat.name}
                </button>
              )}
              <button className="icon-btn ghost" title="Delete" onClick={() => deleteChat(chat.id)}>
                🗑
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main panel */}
      <main className="app-container">

        {/* Sticky top with Dynamic Island style */}
        <header className={`topbar ${headerScrolled ? "scrolled" : ""}`}>
          <div className="dynamic-island">
  <span className="aurora-title">Aurora Bot ✨</span>
</div>

        </header>

        {/* Quick Action Chips */}
        <div className="quick-actions">
          {quickActions.map((a) => (
            <button
              key={a.key}
              className="qa-chip"
              onClick={() => handleQuickAction(a)}
              title={a.label}
            >
              <span className="qa-icon">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>

        <section className="messages-container" ref={messagesRef}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`message-box ${msg.type === "user" ? "user-message" : "ai-message"}`}
            >
              {msg.image && (
                <img src={msg.image} alt="upload" className="uploaded-img" />
              )}
              <div className="message-content">
                <div className="bubble-meta">
                  <span className="bubble-author">
                    {msg.type === "user" ? "You" : "AI"}
                  </span>
                </div>
                <p>{msg.text}</p>
              </div>
            </div>
          ))}

          {typingMessage && (
            <div className="message-box ai-message">
              <div className="message-content">
                <div className="bubble-meta"><span className="bubble-author">AI</span></div>
                <p>{typingMessage}</p>
              </div>
            </div>
          )}
        </section>

        {/* Composer */}
        <div
          className={`composer ${isDragOver ? "drag-over" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {/* Command pill (like the screenshot) */}
          {matchedAction && (
            <div className="command-pill" aria-live="polite">
              <span className="pill-icon">{matchedAction.icon}</span>
              {matchedAction.label}
              <span className="pill-slash">/{matchedAction.key}</span>
            </div>
          )}

          {/* Small preview of picked image */}
          {previewImage && (
            <div className="preview-thumb" title="Image selected">
              <img src={previewImage} alt="preview" />
              <button className="thumb-x" onClick={clearPreview}>✕</button>
            </div>
          )}

          {/* Hidden file input */}
          <label className="icon-btn upload-btn" title="Upload image">
            <input
              type="file"
              accept="image/*"
              onChange={handleImagePick}
              hidden
            />
            +
          </label>

          <textarea
            ref={inputRef}
            className="query-input"
            placeholder="Type a message…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <button
            className={`icon-btn mic-btn ${isRecording ? "recording" : ""}`}
            title="Voice input"
            onClick={toggleRecording}
          >
            🎤
          </button>

          <button
            className="send-button"
            onClick={handleSubmit}
            disabled={loading}
            title="Send"
          >
            {loading ? "…" : "➤"}
          </button>

          {/* Drag-n-drop overlay hint */}
          {isDragOver && (
            <div className="drop-overlay">
              Drop image to attach
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
