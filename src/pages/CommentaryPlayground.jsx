// src/pages/CommentaryPlayground.jsx (or your route file)
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  askCommentary,
  deleteCommentaryThread,
  getCommentaryThread,
  listCommentaryThreads,
} from "../api/aiCommentary";

import ReactMarkdown from "react-markdown";
import "../styles/commentaryAi.css";

/* ---------------------------
   Helpers
---------------------------- */

function fmtWhen(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "";
  }
}

function useTypewriter(text, enabled, speedMs = 12) {
  const [out, setOut] = useState("");
  const timerRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    // cleanup helpers
    const clearAll = () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };

    clearAll();

    const t = text || "";

    // ALWAYS schedule state updates (eslint wants no direct setState in effect)
    if (!enabled) {
      rafRef.current = window.requestAnimationFrame(() => setOut(t));
      return clearAll;
    }

    // enabled: start from empty, then reveal progressively (scheduled)
    rafRef.current = window.requestAnimationFrame(() => setOut(""));

    if (!t) return clearAll;

    let i = 0;
    timerRef.current = window.setInterval(() => {
      i += 6; // chunk size
      // schedule setOut so it's not "synchronous within effect"
      rafRef.current = window.requestAnimationFrame(() => {
        setOut(t.slice(0, i));
      });

      if (i >= t.length) {
        clearAll();
      }
    }, speedMs);

    return clearAll;
  }, [text, enabled, speedMs]);

  return out;
}

/**
 * Convert assistant markdown into "Screen 1" blocks:
 * - OVERVIEW
 * - KEY POINTS
 * - IMPORTANT TERMS
 * - SOURCES
 *
 * Works best when your AI uses headings like:
 * ### Overview / ### Key points / ### Important terms / ### Sources
 */
function parseIntoBlocks(markdown) {
  const raw = (markdown || "").trim();
  if (!raw) return [];

  // Normalize headings
  const lines = raw.split("\n");
  const sections = [];
  let current = { title: "Answer", key: "answer", content: [] };

  function pushCurrent() {
    const content = current.content.join("\n").trim();
    if (content) sections.push({ ...current, content });
  }

  for (const ln of lines) {
    const m = ln.match(/^#{2,4}\s+(.*)\s*$/); // ## or ### or ####
    if (m) {
      const title = (m[1] || "").trim();
      // if we had content, push old
      pushCurrent();

      const norm = title.toLowerCase();
      let key = "answer";
      if (norm.includes("overview")) key = "overview";
      else if (norm.includes("key issues") || norm.includes("key points")) key = "key_points";
      else if (norm.includes("important terms") || norm.includes("definitions")) key = "important_terms";
      else if (norm.includes("sources")) key = "sources";

      current = {
        title:
          key === "overview"
            ? "OVERVIEW"
            : key === "key_points"
            ? "KEY POINTS"
            : key === "important_terms"
            ? "IMPORTANT TERMS"
            : key === "sources"
            ? "SOURCES"
            : title || "Answer",
        key,
        content: [],
      };
    } else {
      current.content.push(ln);
    }
  }

  pushCurrent();

  // If we ended with only "Answer", don't force cards.
  const hasKnown = sections.some((s) => ["overview", "key_points", "important_terms", "sources"].includes(s.key));
  if (!hasKnown) return [{ title: "ANSWER", key: "answer", content: raw }];

  // Drop empty generic answer blocks
  return sections.filter((s) => (s.content || "").trim().length > 0);
}

function BlockCard({ title, kind, markdown }) {
  return (
    <div className="aiBlock" data-kind={kind}>
      <div className="aiBlockHead">
        <span className="aiPill" />
        <div className="aiBlockTitle">{title}</div>
      </div>
      <div className="aiBlockBody">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </div>
    </div>
  );
}

/* ---------------------------
   Page
---------------------------- */

export default function CommentaryPlayground() {
  const [open, setOpen] = useState(false);

  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);

  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("basic");
  const [allowExternalContext, setAllowExternalContext] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const bodyRef = useRef(null);

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

  // initial load
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

  // auto-scroll to bottom when messages change
  useEffect(() => {
    if (!open) return;
    const el = bodyRef.current;
    if (!el) return;
    // allow DOM paint
    const t = window.setTimeout(() => {
      el.scrollTop = el.scrollHeight;
    }, 50);
    return () => window.clearTimeout(t);
  }, [messages, open]);

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

  async function onAsk({ newThread = false } = {}) {
    const q = question.trim();
    if (!q || busy) return;

    setBusy(true);
    setError("");

    // optimistic UI: push user message + temporary assistant typing bubble
    const tempUserId = `temp_u_${Date.now()}`;
    const tempAssistantId = `temp_a_${Date.now()}`;

    const optimisticUser = {
      messageId: tempUserId,
      role: "user",
      model: null,
      createdAtUtc: new Date().toISOString(),
      contentMarkdown: q,
      sources: [],
      __temp: true,
    };

    const optimisticAssistant = {
      messageId: tempAssistantId,
      role: "assistant",
      model: "LegalAI",
      createdAtUtc: new Date().toISOString(),
      contentMarkdown: "", // will fill later
      sources: [],
      __typing: true,
      __temp: true,
    };

    setMessages((prev) => [...prev, optimisticUser, optimisticAssistant]);
    setQuestion("");

    try {
      const resp = await askCommentary({
        question: q,
        mode,
        allowExternalContext,
        threadId: newThread ? null : activeThreadId,
      });

      const tid = resp.threadId;

      // Load server thread/messages so we stay canonical
      if (tid && tid !== activeThreadId) {
        await refreshThreads();
        await loadThread(tid);
      } else if (activeThreadId) {
        await loadThread(activeThreadId);
      } else if (tid) {
        await refreshThreads();
        await loadThread(tid);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Ask failed");

      // remove typing bubble if failed
      setMessages((prev) => prev.filter((m) => m.messageId !== tempAssistantId));
    } finally {
      setBusy(false);
    }
  }

  const headerTitle = useMemo(() => {
    if (!activeThread) return "LegalAI Commentary";
    return activeThread.title || `Thread #${activeThread.threadId}`;
  }, [activeThread]);

  return (
    <div className="laAiPage">
      {/* Floating button */}
      <button className="laAiFab" onClick={() => setOpen(true)} disabled={busy}>
        <span className="laAiFabDot" />
        Ask AI
      </button>

      {/* Drawer */}
      {open && (
        <>
          <div className="laAiOverlay" onClick={() => setOpen(false)} />
          <div className="laAiDrawer" role="dialog" aria-modal="true">
            <div className="laAiDrawerHeader">
              <div className="laAiHeaderRow">
                <div className="laAiTitle">
                  <div className="laAiTitleBadge">AI</div>
                  <div className="laAiTitleText">
                    <h3>{headerTitle}</h3>
                    <p>
                      {activeThreadId ? `Thread #${activeThreadId}` : "New conversation"} •{" "}
                      {activeThread?.countryName || "Jurisdiction: auto"}
                    </p>
                  </div>
                </div>

                <div className="laAiHeaderActions">
                  <button className="laAiIconBtn" onClick={refreshThreads} disabled={busy}>
                    Refresh
                  </button>
                  <button className="laAiIconBtn" onClick={onNewThread} disabled={busy}>
                    New
                  </button>
                  <button className="laAiIconBtn" onClick={() => setOpen(false)}>
                    Close
                  </button>
                </div>
              </div>

              <div className="laAiControls">
                <select value={mode} onChange={(e) => setMode(e.target.value)} disabled={busy} className="laAiSelect">
                  <option value="basic">basic</option>
                  <option value="extended">extended</option>
                </select>

                <label className="laAiToggle">
                  <input
                    type="checkbox"
                    checked={allowExternalContext}
                    onChange={(e) => setAllowExternalContext(e.target.checked)}
                    disabled={busy}
                  />
                  Allow external context
                </label>

                <select
                  value={activeThreadId || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    loadThread(Number(v));
                  }}
                  disabled={busy || threads.length === 0}
                  className="laAiSelect"
                  title="Switch thread"
                >
                  <option value="">Switch thread…</option>
                  {threads.map((t) => (
                    <option key={t.threadId} value={t.threadId}>
                      {(t.title || `Thread #${t.threadId}`).slice(0, 60)}
                    </option>
                  ))}
                </select>
              </div>

              {error && <div className="laAiError">{error}</div>}
            </div>

            <div className="laAiBody" ref={bodyRef}>
              {messages.length === 0 ? (
                <div className="laAiEmpty">
                  Ask a legal question to begin. The assistant will answer with structured blocks (Overview, Key Points,
                  Important Terms, Sources) when possible.
                </div>
              ) : (
                messages.map((m) => <ChatMessage key={m.messageId} msg={m} onDeleteThread={onDeleteThread} activeThreadId={activeThreadId} />)
              )}
            </div>

            <div className="laAiComposer">
              <textarea
                className="laAiTextarea"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Type a legal question…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onAsk({ newThread: !activeThreadId });
                  }
                }}
                disabled={busy}
              />
              <button
                className="laAiSendBtn"
                onClick={() => onAsk({ newThread: !activeThreadId })}
                disabled={busy || !question.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------
   Message renderer
---------------------------- */

function ChatMessage({ msg }) {
  const isUser = msg.role === "user";
  const sideClass = isUser ? "laAiMsg laAiRight" : "laAiMsg laAiLeft";

  // typing feel for assistant: typewriter on final content (only for temp typing placeholders or very recent)
  const shouldType =
    !isUser && (msg.__typing || msg.__temp) && (msg.contentMarkdown || "").length > 0;

  const typed = useTypewriter(msg.contentMarkdown || "", shouldType);

  const assistantContent = shouldType ? typed : msg.contentMarkdown || "";

  // If assistant: try to render structured blocks (Screen 1 format)
  const blocks = !isUser ? parseIntoBlocks(assistantContent) : null;

  return (
    <div className={sideClass}>
      <div className="laAiMeta">
        <b>{msg.role}</b>
        <span>•</span>
        <span>{msg.model || "—"}</span>
        <span>•</span>
        <span>{fmtWhen(msg.createdAtUtc)}</span>
      </div>

      <div className={`laAiBubble ${isUser ? "laAiBubbleUser" : ""}`}>
        {!isUser && msg.__typing && !msg.contentMarkdown ? (
          <div className="laTyping">
            Thinking
            <span className="laDots">
              <span className="laDot" />
              <span className="laDot" />
              <span className="laDot" />
            </span>
          </div>
        ) : !isUser && blocks ? (
          <div>
            {blocks.map((b, idx) => (
              <BlockCard key={idx} title={b.title} kind={b.key} markdown={b.content} />
            ))}

            {/* Sources from server message snapshot */}
            {msg.sources?.length > 0 && (
              <div className="aiBlock" data-kind="sources">
                <div className="aiBlockHead">
                  <span className="aiPill" />
                  <div className="aiBlockTitle">SOURCES</div>
                </div>
                <div className="aiBlockBody">
                  <ul className="aiSourcesList">
                    {msg.sources.map((s, idx) => (
                      <li key={idx}>
                        <a href={s.linkUrl} target="_blank" rel="noreferrer">
                          {s.title || s.type}
                        </a>
                        {s.citation ? <span style={{ color: "rgba(15,23,42,0.62)" }}> — {s.citation}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ) : (
          <ReactMarkdown>{assistantContent}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}
