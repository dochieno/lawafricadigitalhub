import React, { useEffect, useMemo, useState } from "react";
import {
  askCommentary,
  deleteCommentaryThread,
  getCommentaryThread,
  listCommentaryThreads,
} from "../../api/aiCommentary";

// If you already have a markdown renderer in your app, use it.
// Otherwise: npm i react-markdown
import ReactMarkdown from "react-markdown";

export default function CommentaryPlayground() {
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("basic");
  const [allowExternalContext, setAllowExternalContext] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refreshThreads() {
    const data = await listCommentaryThreads({ take: 50, skip: 0 });
    setThreads(data.items || []);
  }

  async function loadThread(threadId) {
    const data = await getCommentaryThread(threadId, { takeMessages: 200 });
    setActiveThreadId(threadId);
    setActiveThread(data.thread || null);
    setMessages(data.messages || []);
  }

  useEffect(() => {
    (async () => {
      try {
        setError("");
        await refreshThreads();
      } catch (e) {
        setError(e?.response?.data?.message || e?.message || "Failed to load threads");
      }
    })();
  }, []);

  async function onAsk({ newThread = false } = {}) {
    const q = question.trim();
    if (!q) return;

    setBusy(true);
    setError("");
    try {
      const resp = await askCommentary({
        question: q,
        mode,
        allowExternalContext,
        threadId: newThread ? null : activeThreadId,
      });

      // Ensure we keep the returned threadId
      const tid = resp.threadId;
      if (tid && tid !== activeThreadId) {
        await refreshThreads();
        await loadThread(tid);
      } else if (activeThreadId) {
        // reload current thread to pull DB-saved messages + sources
        await loadThread(activeThreadId);
      } else if (tid) {
        await refreshThreads();
        await loadThread(tid);
      }

      setQuestion("");
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Ask failed");
    } finally {
      setBusy(false);
    }
  }

  async function onNewThread() {
    setActiveThreadId(null);
    setActiveThread(null);
    setMessages([]);
    setQuestion("");
    setError("");
  }

  async function onDeleteThread(threadId) {
    if (!threadId) return;
    setBusy(true);
    setError("");
    try {
      await deleteCommentaryThread(threadId);
      await refreshThreads();
      if (activeThreadId === threadId) {
        await onNewThread();
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const headerTitle = useMemo(() => {
    if (!activeThread) return "AI Commentary (Playground)";
    return activeThread.title || `Thread #${activeThread.threadId}`;
  }, [activeThread]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, padding: 18 }}>
      {/* Left: threads */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #e5e7eb", display: "flex", gap: 8 }}>
          <button onClick={onNewThread} disabled={busy} style={btn()}>
            + New
          </button>
          <button onClick={refreshThreads} disabled={busy} style={btn("ghost")}>
            Refresh
          </button>
        </div>

        <div style={{ maxHeight: "75vh", overflow: "auto" }}>
          {threads.map((t) => (
            <div
              key={t.threadId}
              onClick={() => loadThread(t.threadId)}
              style={{
                padding: 12,
                cursor: "pointer",
                borderBottom: "1px solid #f3f4f6",
                background: activeThreadId === t.threadId ? "#f9fafb" : "white",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                {t.title || `Thread #${t.threadId}`}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {t.countryName || "—"} • {t.mode || "basic"}
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(t.threadId);
                  }}
                  disabled={busy}
                  style={btn("danger")}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {threads.length === 0 && (
            <div style={{ padding: 14, color: "#6b7280", fontSize: 13 }}>
              No threads yet. Click <b>New</b> and ask a question.
            </div>
          )}
        </div>
      </div>

      {/* Right: chat */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800 }}>{headerTitle}</div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select value={mode} onChange={(e) => setMode(e.target.value)} disabled={busy} style={select()}>
              <option value="basic">basic</option>
              <option value="extended">extended</option>
            </select>

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#374151" }}>
              <input
                type="checkbox"
                checked={allowExternalContext}
                onChange={(e) => setAllowExternalContext(e.target.checked)}
                disabled={busy}
              />
              Allow external context
            </label>

            <button onClick={() => onAsk({ newThread: true })} disabled={busy || !question.trim()} style={btn()}>
              Ask (new thread)
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: 12, background: "#fef2f2", color: "#991b1b", borderBottom: "1px solid #fee2e2" }}>
            {error}
          </div>
        )}

        <div style={{ padding: 14, maxHeight: "65vh", overflow: "auto", background: "#fafafa" }}>
          {messages.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>
              Ask a legal question to begin. If you keep sending the returned <b>threadId</b>, the conversation continues.
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.messageId} style={msg(m.role)}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                  <b>{m.role}</b> • {m.model || "—"} • {new Date(m.createdAtUtc).toLocaleString()}
                </div>

                <ReactMarkdown>{m.contentMarkdown || ""}</ReactMarkdown>

                {/* Sources for assistant messages (if provided by controller) */}
                {m.sources?.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Sources</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {m.sources.map((s, idx) => (
                        <li key={idx} style={{ fontSize: 12, marginBottom: 6 }}>
                          <a href={s.linkUrl} target="_blank" rel="noreferrer">
                            {s.title || s.type}
                          </a>{" "}
                          {s.citation ? <span style={{ color: "#6b7280" }}>— {s.citation}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div style={{ padding: 12, borderTop: "1px solid #e5e7eb", display: "flex", gap: 10 }}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Type a legal question…"
            rows={3}
            style={{
              flex: 1,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 10,
              resize: "vertical",
            }}
          />
          <button onClick={() => onAsk({ newThread: false })} disabled={busy || !question.trim()} style={btn()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function btn(kind) {
  const base = {
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };
  if (kind === "ghost") return { ...base, border: "1px solid #e5e7eb", background: "white" };
  if (kind === "danger") return { ...base, border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b" };
  return { ...base, border: "1px solid #6b233b", background: "#6b233b", color: "white" };
}

function select() {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 12,
  };
}

function msg(role) {
  const isUser = role === "user";
  return {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    maxWidth: "900px",
    marginLeft: isUser ? "auto" : 0,
  };
}
