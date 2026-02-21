// =======================================================
// FILE: src/pages/CommentaryPlayground.jsx
// Update:
// - Full-page AI screen
// - LEFT SIDEBAR for threads
// - Small checkbox styling hook
// - Add Abort/Timeout + Stop button (prevents stuck "Thinking")
// =======================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  askCommentary,
  deleteCommentaryThread,
  getCommentaryThread,
  listCommentaryThreads,askCommentaryStream,
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

    if (!enabled) {
      rafRef.current = window.requestAnimationFrame(() => setOut(t));
      return clearAll;
    }

    rafRef.current = window.requestAnimationFrame(() => setOut(""));

    if (!t) return clearAll;

    let i = 0;
    timerRef.current = window.setInterval(() => {
      i += 6;
      rafRef.current = window.requestAnimationFrame(() => {
        setOut(t.slice(0, i));
      });

      if (i >= t.length) clearAll();
    }, speedMs);

    return clearAll;
  }, [text, enabled, speedMs]);

  return out;
}

/**
 * Convert assistant markdown into blocks:
 * - OVERVIEW
 * - KEY POINTS
 * - IMPORTANT TERMS
 * - SOURCES
 */
function parseIntoBlocks(markdown) {
  const raw = (markdown || "").trim();
  if (!raw) return [];

  const lines = raw.split("\n");
  const sections = [];
  let current = { title: "Answer", key: "answer", content: [] };

  function pushCurrent() {
    const content = current.content.join("\n").trim();
    if (content) sections.push({ ...current, content });
  }

  for (const ln of lines) {
    const m = ln.match(/^#{2,4}\s+(.*)\s*$/);
    if (m) {
      const title = (m[1] || "").trim();
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

  const hasKnown = sections.some((s) =>
    ["overview", "key_points", "important_terms", "sources"].includes(s.key)
  );
  if (!hasKnown) return [{ title: "ANSWER", key: "answer", content: raw }];

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

  // ✅ request cancellation + timeout
  const abortRef = useRef(null);
  const timeoutRef = useRef(null);

  const clearInFlight = () => {
    try {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      abortRef.current = null;
    } catch {
      //
    }
  };

  const stopNow = () => {
    try {
      if (abortRef.current) abortRef.current.abort();
    } catch {
      //
    }
    clearInFlight();
    setBusy(false);

    // remove any typing bubble if present
    setMessages((prev) => prev.filter((m) => !m.__typing || !m.__temp));
  };

  async function refreshThreads({ keepSelection = true } = {}) {
    const data = await listCommentaryThreads({ take: 100, skip: 0 });
    const items = data.items || [];
    setThreads(items);

    if (!keepSelection) return;

    if (activeThreadId && !items.some((t) => t.threadId === activeThreadId)) {
      await onNewThread();
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-scroll to bottom when messages change
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollTop = el.scrollHeight;
    }, 50);
    return () => window.clearTimeout(t);
  }, [messages]);

  // cleanup on unmount (avoid stuck busy)
  useEffect(() => {
    return () => {
      try {
        if (abortRef.current) abortRef.current.abort();
      } catch {
        //
      }
      clearInFlight();
    };
  }, []);

  async function onNewThread() {
    setActiveThreadId(null);
    setActiveThread(null);
    setMessages([]);
    setQuestion("");
    setError("");
  }

  async function onDeleteThread(threadId) {
    if (!threadId || busy) return;
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

    // cancel any previous in-flight (defensive)
    try {
      if (abortRef.current) abortRef.current.abort();
    } catch {
      //
    }
    clearInFlight();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

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
      contentMarkdown: "",
      sources: [],
      __typing: true,
      __temp: true,
    };

    setMessages((prev) => [...prev, optimisticUser, optimisticAssistant]);
    setQuestion("");

    // ✅ hard timeout to prevent "stuck thinking"
    const TIMEOUT_MS = 25000;
    timeoutRef.current = window.setTimeout(() => {
      try {
        ctrl.abort();
      } catch {
        //
      }
    }, TIMEOUT_MS);

try {
  // Prefer streaming for “fast feel”
  const useStream = true;

  if (useStream) {
    let streamed = "";
    let resolvedThreadId = null;

    await askCommentaryStream(
      {
        question: q,
        mode,
        allowExternalContext,
        threadId: newThread ? null : activeThreadId,
      },
      {
        signal: ctrl.signal,
        onEvent: (evt) => {
          if (evt.type === "delta" && evt.data?.text) {
            streamed += evt.data.text;

            // update the optimistic assistant bubble live
            setMessages((prev) =>
              prev.map((m) =>
                m.messageId === tempAssistantId
                  ? { ...m, contentMarkdown: streamed, __typing: true }
                  : m
              )
            );
          }

          if (evt.type === "done") {
            resolvedThreadId = evt.data?.threadId ?? null;
          }
        },
      }
    );

    // stop typing flag
    setMessages((prev) =>
      prev.map((m) =>
        m.messageId === tempAssistantId ? { ...m, __typing: false } : m
      )
    );

    const tid = resolvedThreadId;

    if (tid && tid !== activeThreadId) {
      await refreshThreads();
      await loadThread(tid);
    } else if (activeThreadId) {
      await loadThread(activeThreadId);
    } else if (tid) {
      await refreshThreads();
      await loadThread(tid);
    }

    return; // ✅ done
  }

  // Fallback (non-stream)
  const resp = await askCommentary(
    {
      question: q,
      mode,
      allowExternalContext,
      threadId: newThread ? null : activeThreadId,
    },
    { signal: ctrl.signal }
  );

  const tid = resp.threadId;

  if (tid && tid !== activeThreadId) {
    await refreshThreads();
    await loadThread(tid);
  } else if (activeThreadId) {
    await loadThread(activeThreadId);
  } else if (tid) {
    await refreshThreads();
    await loadThread(tid);
  }
  // existing error handling...
}catch (e) {
      // aborted / timeout should not look like a crash
      const aborted =
        e?.name === "AbortError" ||
        e?.code === "ERR_CANCELED" ||
        String(e?.message || "").toLowerCase().includes("canceled");

      if (aborted) {
        setError("Request stopped.");
      } else {
        setError(e?.response?.data?.message || e?.message || "Ask failed");
      }

      // remove typing bubble if failed
      setMessages((prev) => prev.filter((m) => m.messageId !== tempAssistantId));
    } finally {
      clearInFlight();
      setBusy(false);
    }
  }

  const headerTitle = useMemo(() => {
    if (!activeThread) return "LegalAI Commentary";
    return activeThread.title || `Thread #${activeThread.threadId}`;
  }, [activeThread]);

  return (
    <div className="laAiPage laAiFull">
      <div className="laAiShell">
        {/* LEFT NAV (Threads) */}
        <aside className="laAiSide">
          <div className="laAiSideHead">
            <div className="laAiSideTitle">
              <span className="laAiSideDot" />
              Threads
            </div>

            <div className="laAiSideActions">
              <button
                className="laAiIconBtn laAiIconBtnSm"
                onClick={() => refreshThreads()}
                disabled={busy}
              >
                Refresh
              </button>
              <button className="laAiIconBtn laAiIconBtnSm" onClick={onNewThread} disabled={busy}>
                New
              </button>
            </div>
          </div>

          <div className="laAiSideList">
            {threads.length === 0 ? (
              <div className="laAiSideEmpty">No threads yet.</div>
            ) : (
              threads.map((t) => {
                const isActive = t.threadId === activeThreadId;
                return (
                  <button
                    key={t.threadId}
                    type="button"
                    className={`laAiThreadItem ${isActive ? "active" : ""}`}
                    onClick={() => loadThread(t.threadId)}
                    disabled={busy}
                    title={t.title || `Thread #${t.threadId}`}
                  >
                    <div className="laAiThreadTop">
                      <div className="laAiThreadTitle">
                        {(t.title || `Thread #${t.threadId}`).slice(0, 64)}
                      </div>
                      <div className="laAiThreadMeta">{t.countryName || "—"}</div>
                    </div>

                    <div className="laAiThreadBottom">
                      <div className="laAiThreadWhen">
                        {fmtWhen(t.lastActivityAtUtc || t.createdAtUtc)}
                      </div>

                      <button
                        type="button"
                        className="laAiThreadDel"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDeleteThread(t.threadId);
                        }}
                        disabled={busy}
                        title="Delete thread"
                        aria-label="Delete thread"
                      >
                        ✕
                      </button>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* MAIN (Chat) */}
        <section className="laAiMain">
          {/* Header */}
          <div className="laAiDrawerHeader">
            <div className="laAiHeaderRow">
              <div className="laAiTitle">
                <div className="laAiTitleBadge">AI</div>
                <div className="laAiTitleText">
                  <h3>{headerTitle}</h3>
                  <p>
                    {activeThreadId ? `Thread #${activeThreadId}` : "New conversation"} •{" "}
                    {activeThread?.countryName ? `Jurisdiction: ${activeThread.countryName}` : "Jurisdiction: from profile"}
                  </p>
                </div>
              </div>
            </div>

            <div className="laAiControls">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                disabled={busy}
                className="laAiSelect"
              >
                <option value="basic">basic</option>
                <option value="extended">extended</option>
              </select>

              {/* ✅ Smaller checkbox (CSS below) */}
            <label className={`laSwitch ${busy ? "isDisabled" : ""}`} title="Allow external sources">
              <input
                type="checkbox"
                checked={allowExternalContext}
                onChange={(e) => setAllowExternalContext(e.target.checked)}
                disabled={busy}
              />
              <span className="laSwitchTrack" aria-hidden="true" />
              <span className="laSwitchLabel">External sources</span>
            </label>
            </div>

            {error && <div className="laAiError">{error}</div>}
          </div>

          {/* Body */}
          <div className="laAiBody" ref={bodyRef}>
            {messages.length === 0 ? (
              <div className="laAiEmpty">
                Ask a legal question to begin. The assistant will answer with structured blocks (Overview, Key Points,
                Important Terms, Sources) when possible.
              </div>
            ) : (
              messages.map((m) => <ChatMessage key={m.messageId} msg={m} />)
            )}
          </div>

          {/* Composer */}
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

            <div className="laAiComposerBtns">
              {/* ✅ Stop button only when busy */}
              {busy ? (
                <button className="laAiStopBtn" type="button" onClick={stopNow}>
                  Stop
                </button>
              ) : null}

              <button
                className="laAiSendBtn"
                onClick={() => onAsk({ newThread: !activeThreadId })}
                disabled={busy || !question.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------------------
   Message renderer
---------------------------- */

function ChatMessage({ msg }) {
  const isUser = msg.role === "user";
  const sideClass = isUser ? "laAiMsg laAiRight" : "laAiMsg laAiLeft";

  const shouldType = !isUser && (msg.__typing || msg.__temp) && (msg.contentMarkdown || "").length > 0;

  const typed = useTypewriter(msg.contentMarkdown || "", shouldType);
  const assistantContent = shouldType ? typed : msg.contentMarkdown || "";

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
                        {s.citation ? (
                          <span style={{ color: "rgba(15,23,42,0.62)" }}> — {s.citation}</span>
                        ) : null}
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
