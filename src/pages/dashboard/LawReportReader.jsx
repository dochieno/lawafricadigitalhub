// src/pages/dashboard/LawReportReader.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import "../../styles/lawReportReader.css";

function isInstitutionUser() {
  const c = getAuthClaims();
  return !!(c?.institutionId && c?.institutionId > 0);
}

function isPublicUser() {
  const c = getAuthClaims();
  const userType = c?.payload?.userType || c?.payload?.UserType || null;
  const inst = c?.institutionId;
  return String(userType).toLowerCase() === "public" && (!inst || inst <= 0);
}

function isProbablyHtml(s) {
  const x = String(s || "").trim();
  if (!x) return false;
  return /<\/?(p|br|div|span|h1|h2|h3|h4|ul|ol|li|table|thead|tbody|tr|td|th|blockquote)\b/i.test(
    x
  );
}

function isGlobalAdminUser() {
  const c = getAuthClaims();

  const rolesRaw =
    c?.roles ??
    c?.payload?.roles ??
    c?.payload?.role ??
    c?.payload?.Role ??
    c?.payload?.Roles ??
    [];

  const roles = Array.isArray(rolesRaw)
    ? rolesRaw
    : typeof rolesRaw === "string"
      ? rolesRaw
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [];

  const norm = roles.map((r) => String(r).toLowerCase());
  return (
    norm.includes("admin") ||
    norm.includes("globaladmin") ||
    norm.includes("global_admin") ||
    norm.includes("superadmin") ||
    norm.includes("super_admin")
  );
}

// ----------------------
// Helpers
// ----------------------
function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 10);
}

function getApiErrorMessage(err, fallback = "Request failed.") {
  const data = err?.response?.data;

  if (data && typeof data === "object") {
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;

    if (data.errors && typeof data.errors === "object") {
      const firstKey = Object.keys(data.errors)[0];
      const first = firstKey ? data.errors[firstKey]?.[0] : null;
      if (first) return first;
    }

    if (typeof data.detail === "string") return data.detail;
  }

  if (typeof err?.message === "string") return err.message;
  return fallback;
}

// Related cases (DB)
async function fetchRelatedLawReports(id, take = 8) {
  const res = await api.get(`/law-reports/${Number(id)}/related`, {
    params: { take },
  });
  return res.data ?? [];
}

// ----------------------
// Case content formatting
// ----------------------
function normalizeText(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoParagraphs(text) {
  const t = normalizeText(text);
  if (!t) return [];

  const hasParaBreaks = /\n\s*\n/.test(t);
  if (hasParaBreaks) {
    return t
      .split(/\n\s*\n+/)
      .map((p) => p.replace(/\n+/g, " ").trim())
      .filter(Boolean);
  }

  const headings = [
    "JUDGMENT",
    "INTRODUCTION",
    "BACKGROUND",
    "FACTS",
    "ISSUE",
    "ISSUES",
    "HELD",
    "HOLDING",
    "ANALYSIS",
    "DETERMINATION",
    "DISCUSSION",
    "RULING",
    "ORDER",
    "ORDERS",
    "DISPOSITION",
    "CONCLUSION",
  ];

  let x = t;

  for (const h of headings) {
    const re = new RegExp(`\\s(${h})\\s`, "g");
    x = x.replace(re, `\n\n$1 `);
  }

  x = x
    .replace(/\s(\d{1,2}\.)\s/g, "\n\n$1 ")
    .replace(/\s(\([a-z]\))\s/g, "\n\n$1 ");

  x = x.replace(/([.?!])\s+(The issues in dispute are:)/g, "$1\n\n$2");

  return x
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isLikelyHeadingParagraph(p) {
  const s = String(p || "").trim();
  if (s.length <= 40 && /^[A-Z\s]+$/.test(s) && /[A-Z]/.test(s)) return true;

  if (
    s.length <= 40 &&
    /^(Judgment|Introduction|Background|Facts|Issues?|Held|Analysis|Determination|Orders?|Conclusion)\b/.test(
      s
    )
  )
    return true;

  return false;
}

function CaseContentFormatted({ text }) {
  const paras = useMemo(() => splitIntoParagraphs(text), [text]);

  if (!paras.length) return null;

  return (
    <div className="lrr2CaseFmt">
      {paras.map((p, idx) =>
        isLikelyHeadingParagraph(p) ? (
          <h3 className="lrr2CaseH" key={idx}>
            {p}
          </h3>
        ) : (
          <p className="lrr2CaseP" key={idx}>
            {p}
          </p>
        )
      )}
    </div>
  );
}

function AiSummaryRichText({ text }) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const isHeadingLine = (s) =>
    /^(title|digest|court|facts|issue|issues|summary|held|holding\/decision|holding|decision|reasoning|analysis|key points?|key takeaways?|takeaways)\s*:/i.test(
      String(s || "").trim()
    );

  const isBulletLine = (s) => /^\s*[-•*–]\s+/.test(String(s || ""));

  function normalizeSectionKey(labelTrim) {
    const raw = String(labelTrim || "").trim().toLowerCase();
    return raw.replace(/\s*\/\s*/g, "-").replace(/\s+/g, "-");
  }

  let currentSection = null;
  const blocks = [];
  let i = 0;
  let pendingKeyPoints = null;

  while (i < lines.length) {
    const raw = lines[i];
    const s = String(raw || "").trim();

    if (!s) {
      i += 1;
      continue;
    }

    if (isHeadingLine(s)) {
      const [label, ...rest] = s.split(":");
      const labelTrim = label.trim();
      const value = rest.join(":").trim();

      const sectionKey = normalizeSectionKey(labelTrim);
      currentSection = sectionKey;

      const isTitle = /^title$/i.test(labelTrim);
      const isKeyPoints = /^(key points?|key takeaways?|takeaways)$/i.test(labelTrim);

      if (isTitle) {
        blocks.push(
          <div className="lrrAiTitleBlock" key={`t-${i}`}>
            <div className="lrrAiTitleKicker">Title</div>
            <div className="lrrAiTitleMain">{value || "—"}</div>
          </div>
        );
        i += 1;
        continue;
      }

      if (isKeyPoints) {
        pendingKeyPoints = { label: labelTrim, value, sectionKey: "key-points" };
        i += 1;
        continue;
      }

      blocks.push(
        <div className="lrrAiBlock" key={`h-${i}`} data-section={sectionKey}>
          <div className="lrrAiH">
            {labelTrim}:{value ? <span className="lrrAiHVal"> {value}</span> : null}
          </div>
        </div>
      );

      i += 1;
      continue;
    }

    if (isBulletLine(raw)) {
      const items = [];
      while (i < lines.length && isBulletLine(lines[i])) {
        const itemText = String(lines[i]).replace(/^\s*[-•*–]\s+/, "").trim();
        if (itemText) items.push(itemText);
        i += 1;
      }

      if (pendingKeyPoints) {
        const kp = pendingKeyPoints;
        pendingKeyPoints = null;

        blocks.push(
          <details className="lrrKp" open key={`kp-${i}`}>
            <summary className="lrrKpSummary">
              <span className="lrrKpTitle">{kp.label}:</span>
              {kp.value ? <span className="lrrKpVal"> {kp.value}</span> : null}
              <span className="lrrKpHint"> (click to collapse)</span>
            </summary>

            <ul className="lrrAiUl isKeyPointsCards" data-section={kp.sectionKey}>
              {items.map((t, idx) => (
                <li key={idx} className="lrrAiLi">
                  {t}
                </li>
              ))}
            </ul>
          </details>
        );

        continue;
      }

      blocks.push(
        <ul className="lrrAiUl" data-section={currentSection || undefined} key={`ul-${i}`}>
          {items.map((t, idx) => (
            <li key={idx} className="lrrAiLi">
              {t}
            </li>
          ))}
        </ul>
      );

      continue;
    }

    const para = [];
    while (
      i < lines.length &&
      String(lines[i] || "").trim() &&
      !isHeadingLine(lines[i]) &&
      !isBulletLine(lines[i])
    ) {
      para.push(String(lines[i] || "").trim());
      i += 1;
    }

    blocks.push(
      <p className="lrrAiP" data-section={currentSection || undefined} key={`p-${i}`}>
        {para.join(" ")}
      </p>
    );
  }

  return <div className="lrrAiRich">{blocks}</div>;
}

// ----------------------
// AI Summary Panel
// ----------------------
function LawReportAiSummaryPanel({ lawReportId, digestTitle, courtLabel, onOpenRelated }) {
  const [type, setType] = useState("basic"); // basic | extended
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const didAutoGenRef = useRef(false);

  // Phase 4 — Cross-Case Intelligence (Related cases)
  const [relatedCases, setRelatedCases] = useState([]);
  const [relatedCasesLoading, setRelatedCasesLoading] = useState(false);
  const [relatedCasesError, setRelatedCasesError] = useState("");

  // UX helpers
  const [sourceLabel, setSourceLabel] = useState("");
  const [toast, setToast] = useState("");

  // Phase 5 — Chat with LegalAI (per-case)
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState([
    {
      role: "assistant",
      content:
        "Ask me anything about this case: issues, holding, reasoning, relevant statutes, and how it compares to similar cases.",
    },
  ]);

  function addMsg(role, content) {
    setChatMsgs((prev) => [...prev, { role, content }]);
  }

  const canRun = useMemo(
    () => Number.isFinite(Number(lawReportId)) && Number(lawReportId) > 0,
    [lawReportId]
  );

  function isCacheMiss(err) {
    return err?.response?.status === 404;
  }

  async function generateSummary({ force = false } = {}) {
    const res = await api.post(`/ai/law-reports/${Number(lawReportId)}/summary`, {
      type,
      forceRegenerate: force,
    });
    return res.data?.data ?? res.data;
  }

  function flash(msg) {
    setToast(msg);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setToast(""), 1400);
  }

  function normalizeAiCase(x) {
    return {
      jurisdiction: x?.jurisdiction || x?.country || x?.region || "",
      lawReportId: x?.lawReportId ?? x?.id ?? null,
      url: x?.url || x?.link || x?.sourceUrl || "",
      title: x?.title || x?.caseName || x?.name || "",
      court: x?.court || x?.courtName || "",
      year: x?.year || x?.decisionYear || "",
      citation: x?.citation || x?.cite || "",
      note: x?.note || x?.reason || x?.whyRelevant || "",
    };
  }

  async function fetchAiRelatedCases() {
    if (!canRun) return;

    setRelatedCasesLoading(true);
    setRelatedCasesError("");

    try {
      const res = await api.post(
        `/ai/law-reports/${Number(lawReportId)}/related-cases`,
        {},
        { params: { takeKenya: 2, takeForeign: 2 } }
      );

      const payload = res.data?.items ?? res.data?.data?.items ?? res.data?.data ?? res.data;
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

      const normalized = items.map(normalizeAiCase);
      setRelatedCases(normalized);

      if (!items.length) setRelatedCasesError("No suggestions returned.");
      else flash("Related cases loaded.");
    } catch (e) {
      setRelatedCases([]);
      setRelatedCasesError(getApiErrorMessage(e, "Failed to fetch AI related cases."));
    } finally {
      setRelatedCasesLoading(false);
    }
  }

  async function onCopySummary() {
    const text = String(result?.summary || "").trim();
    if (!text) return flash("Nothing to copy.");
    try {
      await navigator.clipboard?.writeText(text);
      flash("Summary copied.");
    } catch {
      flash("Copy failed.");
    }
  }

  async function onRegenerate() {
    if (!canRun) return;
    setLoading(true);
    setError("");
    try {
      const generated = await generateSummary({ force: true });
      setResult(generated);
      setSourceLabel("Generated");
      flash("Regenerated.");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to regenerate AI summary."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canRun) return;

    didAutoGenRef.current = false;
    setSourceLabel("");
    setToast("");
    setRelatedCases([]);
    setRelatedCasesError("");
    setRelatedCasesLoading(false);

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get(`/ai/law-reports/${Number(lawReportId)}/summary`, {
          params: { type },
        });

        if (cancelled) return;
        setResult(res.data?.data ?? res.data);
        setSourceLabel("Cached");
        setError("");
      } catch (err) {
        if (cancelled) return;

        if (isCacheMiss(err) && !didAutoGenRef.current) {
          didAutoGenRef.current = true;
          try {
            const generated = await generateSummary({ force: false });
            if (cancelled) return;
            setResult(generated);
            setSourceLabel("Generated");
            setError("");
          } catch (genErr) {
            if (cancelled) return;
            setResult(null);
            setSourceLabel("");
            setError(getApiErrorMessage(genErr, "Failed to generate AI summary."));
          }
        } else {
          setResult(null);
          setSourceLabel("");
          setError(getApiErrorMessage(err, "No cached summary found yet."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRun, type, lawReportId]);

  const isExtended = String(result?.type ?? type).toLowerCase() === "extended";

  return (
    <section className="lrrAi">
      <div className="lrrAiTop">
        <div className="lrrAiTitleRow">
          <div className="lrrAiTitle">LegalAI Summary</div>

          {sourceLabel ? (
            <span className="lrrAiBadge" title="Where this result came from">
              {sourceLabel}
            </span>
          ) : (
            <span className="lrrAiBadge">AI generated</span>
          )}

          <div className="lrrAiIconRow">
            <button
              type="button"
              className="lrrAiUpgradeBtn ghost"
              disabled={loading || !result}
              onClick={onCopySummary}
              title="Copy summary"
              aria-label="Copy summary"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect
                  x="9"
                  y="9"
                  width="10"
                  height="10"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <rect
                  x="5"
                  y="5"
                  width="10"
                  height="10"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
              </svg>
            </button>

            <button
              type="button"
              className="lrrAiUpgradeBtn"
              disabled={loading || !canRun}
              onClick={onRegenerate}
              title="Summarize / regenerate"
              aria-label="Summarize / regenerate"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 2l1.2 4.2L17.4 8l-4.2 1.2L12 13.4l-1.2-4.2L6.6 8l4.2-1.8L12 2z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M5 20c2.5-2.2 5.2-3.3 8-3.3s5.5 1.1 8 3.3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <button
              type="button"
              className={`lrrAiUpgradeBtn ${chatOpen ? "ghost" : ""}`}
              onClick={() => setChatOpen((v) => !v)}
              title="Chat with LegalAI"
              aria-label="Chat with LegalAI"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 5.5C4 4.1 5.1 3 6.5 3h11C19.9 3 21 4.1 21 5.5v7C21 13.9 19.9 15 18.5 15H11l-4.5 4V15H6.5C5.1 15 4 13.9 4 12.5v-7z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M7.5 7.5h10M7.5 10.5h7"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="lrrAiHeadnote">
          <div className="lrrAiHeadnoteTitle">{digestTitle || "—"}</div>
          <div className="lrrAiHeadnoteMeta">{courtLabel || "—"}</div>
          <div className="lrrAiHeadnoteRule" />
        </div>

        {toast ? <div className="lrrAiToast">{toast}</div> : null}
      </div>

      {error ? <div className="lrrAiError">{error}</div> : null}

      {result ? (
        <div className="lrrAiResult">
          {!isExtended ? (
            <div className="lrrAiUpgrade">
              <div className="lrrAiUpgradeText">
                Need more depth? Generate an <b>Extended</b> analysis (more detailed; will be token-gated
                later).
              </div>

              <button
                type="button"
                className="lrrAiUpgradeBtn"
                disabled={loading}
                onClick={() => setType("extended")}
                title="Generate extended summary"
              >
                Generate Extended
              </button>
            </div>
          ) : (
            <div className="lrrAiUpgrade isExtended">
              <div className="lrrAiUpgradeText">
                You’re viewing the <b>Extended</b> analysis.
              </div>

              <button
                type="button"
                className="lrrAiUpgradeBtn ghost"
                disabled={loading}
                onClick={() => setType("basic")}
                title="Back to basic summary"
              >
                Back to Basic
              </button>
            </div>
          )}

          <div className="lrrAiBody">
            <AiSummaryRichText text={result.summary || ""} />
          </div>

          {chatOpen ? (
            <div className="lrr2Panel lrr2Panel--tight lrr2ChatPanel">
              <div className="lrr2PanelHead">
                <div className="lrr2PanelHeadLeft">
                  <div className="lrr2PanelTitle">Chat with LegalAI</div>
                  <div className="lrr2PanelSub">
                    Ask about issues, holdings, reasoning, and related/persuasive cases.
                  </div>
                </div>

                <button
                  type="button"
                  className="lrr2Btn"
                  onClick={() => {
                    setChatMsgs((prev) =>
                      prev.length > 1
                        ? [
                            prev[0],
                            {
                              role: "assistant",
                              content: "Cleared. Ask a new question about this case.",
                            },
                          ]
                        : prev
                    );
                    setChatError("");
                    setChatInput("");
                  }}
                  title="Clear chat"
                >
                  Clear
                </button>
              </div>

              <div className="lrr2ChatBox" role="log" aria-label="Chat messages">
                {chatMsgs.map((m, idx) => (
                  <div
                    key={idx}
                    className={`lrr2ChatRow ${m.role === "user" ? "isUser" : "isAi"}`}
                  >
                    <div className={`lrr2ChatBubble ${m.role === "user" ? "isUser" : "isAi"}`}>
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>

              {chatError ? <div className="lrr2PanelError">{chatError}</div> : null}

              <div className="lrr2ChatComposer">
                <input
                  className="lrr2SearchInput lrr2ChatInput"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask LegalAI… e.g. What were the key issues and the holding?"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      document.getElementById("lrrChatSendBtn")?.click();
                    }
                  }}
                />

                <button
                  id="lrrChatSendBtn"
                  type="button"
                  className="lrr2Btn primary"
                  disabled={chatLoading || !String(chatInput || "").trim()}
                  onClick={async () => {
                    if (!canRun) return;
                    const msg = String(chatInput || "").trim();
                    if (!msg) return;

                    setChatInput("");
                    setChatError("");
                    addMsg("user", msg);

                    try {
                      setChatLoading(true);
                      const history = chatMsgs
                        .slice(-8)
                        .map((m) => ({ role: m.role, content: m.content }));

                      const res = await api.post(`/ai/law-reports/${Number(lawReportId)}/chat`, {
                        message: msg,
                        history,
                      });

                      const reply =
                        res.data?.reply ||
                        res.data?.data?.reply ||
                        res.data?.message ||
                        res.data?.data?.message ||
                        res.data?.content ||
                        res.data?.data?.content ||
                        "";

                      addMsg("assistant", String(reply || "No response returned."));
                    } catch (e) {
                      setChatError(getApiErrorMessage(e, "Chat failed."));
                      addMsg("assistant", "Sorry — I couldn’t complete that request. Please try again.");
                    } finally {
                      setChatLoading(false);
                    }
                  }}
                  title="Send"
                >
                  {chatLoading ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          ) : null}

          {/* Phase 4 — AI Related Cases */}
          <div className="lrr2Panel lrr2Panel--tight lrr2AiRelatedPanel">
            <div className="lrr2PanelHead">
              <div className="lrr2PanelHeadLeft">
                <div className="lrr2PanelTitle">AI Related Cases</div>
                <div className="lrr2PanelSub">
                  Enhancement only · returns <b>2 Kenya</b> and <b>2 Outside Kenya</b>. Always verify
                  citations.
                </div>
              </div>

              <button
                type="button"
                className="lrr2Btn"
                disabled={relatedCasesLoading}
                onClick={fetchAiRelatedCases}
                title="Find AI related cases"
              >
                {relatedCasesLoading ? "Finding…" : "Find related"}
              </button>
            </div>

            {relatedCasesError ? <div className="lrr2PanelError">{relatedCasesError}</div> : null}

            {!relatedCasesLoading && !relatedCasesError && relatedCases.length === 0 ? (
              <div className="lrr2PanelEmpty">
                No AI related cases loaded yet. Click <b>Find related</b>.
              </div>
            ) : null}

            {relatedCases.length > 0 ? (
              <div className="lrr2RelatedGrid">
                {(() => {
                  const kenya = relatedCases.filter(
                    (x) => String(x?.jurisdiction || "").toLowerCase() === "kenya"
                  );
                  const foreign = relatedCases.filter(
                    (x) => String(x?.jurisdiction || "").toLowerCase() !== "kenya"
                  );

                  const renderItem = (c, idx) => {
                    const title = c?.title || `Related case ${idx + 1}`;
                    const cite = c?.citation || "";
                    const court = c?.court || "";
                    const year = c?.year ? String(c.year) : "";
                    const meta = [court, year].filter(Boolean).join(" • ");
                    const rid = Number(c?.lawReportId || 0);
                    const url = c?.url || "";
                    const note = c?.note || "";
                    const canOpenInternal = Number.isFinite(rid) && rid > 0;

                    return (
                      <div key={`${title}-${idx}`} className="lrr2RelatedCard">
                        <div className="lrr2RelatedTop">
                          <div className="lrr2RelatedTitleWrap">
                            <div className="lrr2RelatedTitle">{title}</div>
                            {meta ? <div className="lrr2RelatedMeta">{meta}</div> : null}
                          </div>

                          <div className="lrr2RelatedTags">
                            {cite ? <span className="lrr2Tag">{cite}</span> : null}
                            {String(c?.jurisdiction || "").toLowerCase() !== "kenya" ? (
                              <span className="lrr2Tag soft">Persuasive</span>
                            ) : null}
                          </div>
                        </div>

                        {note ? <div className="lrr2RelatedNote">{note}</div> : null}

                        <div className="lrr2RelatedActions">
                          {canOpenInternal ? (
                            <button
                              type="button"
                              className="lrr2Btn"
                              onClick={() => onOpenRelated?.(rid)}
                              title="Open in LawAfrica"
                            >
                              Open in LawAfrica
                            </button>
                          ) : null}

                          {!canOpenInternal && url ? (
                            <a className="lrr2Btn" href={url} target="_blank" rel="noreferrer">
                              Open reference
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  };

                  return (
                    <>
                      <div className="lrr2RelatedSection">
                        <div className="lrr2RelatedSectionTitle">Kenya</div>
                        {kenya.length ? (
                          <div className="lrr2RelatedStack">{kenya.map(renderItem)}</div>
                        ) : (
                          <div className="lrr2RelatedNone">No Kenya suggestions returned.</div>
                        )}
                      </div>

                      <div className="lrr2RelatedSection">
                        <div className="lrr2RelatedSectionTitle">Outside Kenya</div>
                        {foreign.length ? (
                          <div className="lrr2RelatedStack">{foreign.map(renderItem)}</div>
                        ) : (
                          <div className="lrr2RelatedNone">No foreign suggestions returned.</div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>
      ) : loading ? null : (
        <div className="lrrAiTip">No summary available yet.</div>
      )}

      <div className="lrrAiFooterNote">
        *** This summary is automatically generated by LegalAI and may be cached for performance. Always
        verify critical details against the full case text — <b>{isExtended ? "Extended" : "Basic"}</b>.
      </div>
    </section>
  );
}

// ----------------------
// Reader
// ----------------------
export default function LawReportReader() {
  const { id } = useParams();
  const reportId = Number(id);
  const navigate = useNavigate();

  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();
  const isAdmin = isGlobalAdminUser();

  const [contentOpen, setContentOpen] = useState(true);

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [hasContent, setHasContent] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  const [view, setView] = useState("content");

  const [relatedDb, setRelatedDb] = useState([]);
  const [relatedDbLoading, setRelatedDbLoading] = useState(false);
  const [relatedDbError, setRelatedDbError] = useState("");

  const [fontScale, setFontScale] = useState(1); // 0.9 - 1.2
  const [readingTheme, setReadingTheme] = useState("paper"); // paper | sepia | dark
  const [serif, setSerif] = useState(true);

  // Search
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [openResults, setOpenResults] = useState(false);
  const searchAbortRef = useRef({ cancelled: false });

  const searchBoxRef = useRef(null);
  const searchInputRef = useRef(null);

  // Reading progress
  const [progress, setProgress] = useState(0);
  const progressBarRef = useRef(null);

  // Map fontScale to a class (no inline styles)
  const fsClass = useMemo(() => {
    const n = Math.round(fontScale * 100); // 90..120
    const clamped = Math.max(90, Math.min(120, n));
    return `lrr2Fs-${clamped}`;
  }, [fontScale]);

  const fontClass = serif ? "lrr2FontSerif" : "lrr2FontSans";

  useEffect(() => {
    function onScroll() {
      const el = document.documentElement;
      const scrollTop = el.scrollTop || document.body.scrollTop;
      const scrollHeight = el.scrollHeight || document.body.scrollHeight;
      const clientHeight = el.clientHeight || window.innerHeight;
      const max = Math.max(1, scrollHeight - clientHeight);
      const p = Math.min(1, Math.max(0, scrollTop / max));
      setProgress(p);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!progressBarRef.current) return;
    progressBarRef.current.style.transform = `scaleX(${progress})`;
  }, [progress]);

  // Related DB cases only in Transcript tab
  useEffect(() => {
    let cancelled = false;

    async function loadRelatedDb() {
      if (view !== "content") return;
      if (!Number.isFinite(reportId) || reportId <= 0) return;

      try {
        setRelatedDbLoading(true);
        setRelatedDbError("");
        const list = await fetchRelatedLawReports(reportId, 8);
        if (!cancelled) setRelatedDb(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) {
          setRelatedDb([]);
          setRelatedDbError(getApiErrorMessage(e, "Failed to load related cases."));
        }
      } finally {
        if (!cancelled) setRelatedDbLoading(false);
      }
    }

    loadRelatedDb();
    return () => {
      cancelled = true;
    };
  }, [reportId, view]);

  useEffect(() => {
    if (!openResults) return;

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpenResults(false);
        searchInputRef.current?.blur?.();
      }
    }

    function onPointerDown(e) {
      const el = searchBoxRef.current;
      if (!el) return;
      if (!el.contains(e.target)) {
        setOpenResults(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openResults]);

  // Load report
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await api.get(`/law-reports/${reportId}`);
        if (cancelled) return;
        setReport(res.data ?? null);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("We couldn’t load this report right now. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (Number.isFinite(reportId) && reportId > 0) load();
    else {
      setError("Invalid report id.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  // Availability + access checks — DO NOT CHANGE LOGIC
  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!report?.legalDocumentId) return;

      if (isAdmin) {
        if (!cancelled) {
          setHasContent(true);
          setAvailabilityLoading(false);
          setAccess({ hasFullAccess: true });
          setAccessLoading(false);
        }
        return;
      }

      const textHasContent = !!String(report?.contentText || "").trim();
      if (textHasContent) {
        if (!cancelled) {
          setHasContent(true);
          setAvailabilityLoading(false);
        }
      } else {
        try {
          setAvailabilityLoading(true);
          const r = await api.get(`/legal-documents/${report.legalDocumentId}/availability`);
          const ok = !!r?.data?.hasContent;
          if (!cancelled) setHasContent(ok);
        } catch {
          if (!cancelled) setHasContent(true);
        } finally {
          if (!cancelled) setAvailabilityLoading(false);
        }
      }

      if (report?.isPremium && (isInst || isPublic)) {
        try {
          setAccessLoading(true);
          const r = await api.get(`/legal-documents/${report.legalDocumentId}/access`);
          if (!cancelled) setAccess(r?.data ?? null);
        } catch {
          if (!cancelled) setAccess(null);
        } finally {
          if (!cancelled) setAccessLoading(false);
        }
      } else {
        if (!cancelled) setAccess(null);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [report, isInst, isPublic, isAdmin]);

  const rawContent = useMemo(() => String(report?.contentText || ""), [report?.contentText]);
  const textHasContent = !!rawContent.trim();
  const hasFullAccess = !!access?.hasFullAccess;

  const canRead =
    !!report &&
    (isAdmin ||
      ((hasContent || textHasContent) &&
        (!report.isPremium || hasFullAccess || (!isInst && !isPublic))));

  // Search (debounced)
  useEffect(() => {
    const abortState = searchAbortRef.current;
    abortState.cancelled = false;

    const term = String(q || "").trim();
    if (term.length < 2) {
      setSearchErr("");
      setSearchResults([]);
      setOpenResults(false);
      return () => {
        abortState.cancelled = true;
      };
    }

    const t = setTimeout(async () => {
      try {
        setSearching(true);
        setSearchErr("");

        const res = await api.get(`/law-reports/search`, {
          params: { q: term, page: 1, pageSize: 8 },
        });

        if (abortState.cancelled) return;

        const payload = res.data?.data ?? res.data;
        const items = Array.isArray(payload?.items) ? payload.items : [];

        setSearchResults(items);
        setOpenResults(true);
      } catch (e) {
        if (!abortState.cancelled) {
          setSearchErr(getApiErrorMessage(e, "Search failed."));
          setSearchResults([]);
          setOpenResults(true);
        }
      } finally {
        if (!abortState.cancelled) setSearching(false);
      }
    }, 280);

    return () => {
      abortState.cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  function pickReport(r) {
    const rid = Number(r?.id || r?.lawReportId);
    if (!rid) return;
    setOpenResults(false);
    setQ("");
    setSearchResults([]);
    navigate(`/dashboard/law-reports/${rid}`);
  }

  if (loading) {
    return (
      <div className="lrr2Wrap">
        <div className="lrr2Loading">Loading report…</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="lrr2Wrap">
        <div className="lrr2Error">
          <div className="lrr2ErrorTitle">Report unavailable</div>
          <div className="lrr2ErrorMsg">{error || "Not found."}</div>
          <div className="lrr2TopActions">
            <button className="lrr2Btn" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back to Law Reports
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="lrr2Wrap">
        <div className="lrr2Error">
          <div className="lrr2ErrorTitle">Access required</div>
          <div className="lrr2ErrorMsg">
            {availabilityLoading
              ? "Checking availability…"
              : !hasContent && !textHasContent
                ? "This report isn’t available yet."
                : "This is a premium report. Please subscribe or sign in with an eligible account to read it."}
          </div>

          <div className="lrr2TopActions">
            <button className="lrr2Btn" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const title = report.parties || report.title || "Law Report";
  const llrNo = report.reportNumber || report.llrNo || report.llrNumber || String(reportId);

  return (
    <div className="lrr2Wrap" data-theme={readingTheme}>
      <header className="lrr2Header">
        <div className="lrr2HeaderTop">
          <div className="lrr2Brand">Law Africa Law Reports-Case File (Transcript)</div>

          <div className="lrr2HeaderRight">
            <button className="lrr2LinkBtn" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back
            </button>
          </div>
        </div>

        <div className="lrr2SearchRow">
          <div className="lrr2SearchLabel">Case Search</div>

          <div className="lrr2SearchBox" ref={searchBoxRef}>
            <input
              ref={searchInputRef}
              className="lrr2SearchInput"
              placeholder="Search parties, citation, court, year, or words inside the case…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => {
                if (searchResults.length || searchErr) setOpenResults(true);
              }}
            />
            <button
              type="button"
              className="lrr2SearchBtn"
              onClick={() => setOpenResults((v) => !v)}
              title="Show results"
            >
              {searching ? "Searching…" : "Search"}
            </button>

            {openResults && (searchErr || searchResults.length > 0) ? (
              <div className="lrr2SearchDropdown">
                {searchErr ? <div className="lrr2SearchErr">{searchErr}</div> : null}

                {searchResults.map((r, idx) => {
                  const rid = Number(r?.id);
                  const rtitle = r?.parties || r?.title || `Report #${rid || idx + 1}`;

                  const leftMeta = r?.citation || r?.reportNumber || "";
                  const year = r?.year ? String(r.year) : "";
                  const court = r?.courtTypeLabel || r?.court || "";
                  const decision = r?.decisionTypeLabel || "";

                  return (
                    <button
                      type="button"
                      key={rid || idx}
                      className="lrr2SearchItem"
                      onClick={() => pickReport(r)}
                    >
                      <div className="lrr2SearchItemLeft">
                        <div className="lrr2SearchItemTitle">{rtitle}</div>
                        {leftMeta ? <div className="lrr2SearchItemMeta">{leftMeta}</div> : null}
                      </div>

                      <div className="lrr2SearchItemRight">
                        {year ? <span className="lrr2Tag">{year}</span> : null}
                        {court ? <span className="lrr2Tag">{court}</span> : null}
                        {decision ? <span className="lrr2Tag soft">{decision}</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="lrr2SearchHint">
            Usage: To find cases, type in search terms in the textbox above e.g. distressed tenant
          </div>
        </div>
      </header>

      <div className="lrr2Progress" aria-hidden="true">
        <div className="lrr2ProgressBar" ref={progressBarRef} />
      </div>

      <button
        type="button"
        className="lrr2ToTop"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        title="Back to top"
      >
        ↑
      </button>

      <div className="lrr2TopGrid">
        <section className="lrr2MetaCard">
          <div className="lrr2MetaChips">
            {llrNo ? (
              <button className="lrr2MetaChip" data-tip="LLR Number">
                <span className="lrr2MetaIcon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect
                      x="4"
                      y="4"
                      width="16"
                      height="16"
                      rx="3"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path d="M8 9h8M8 13h6" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </span>
                {llrNo}
              </button>
            ) : null}

            {report.caseNumber ? (
              <button className="lrr2MetaChip" data-tip="Case Number">
                <span className="lrr2MetaIcon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M7 7h10v10H7z" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M9 11h6M9 14h4" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </span>
                {report.caseNumber}
              </button>
            ) : null}

            {report.court ? (
              <button className="lrr2MetaChip" data-tip="Court">
                <span className="lrr2MetaIcon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M4 10h16" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M6 10V6h12v4" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M6 18h12" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </span>
                {report.court}
              </button>
            ) : null}

            {report.country ? (
              <button className="lrr2MetaChip" data-tip="Country">
                <span className="lrr2MetaIcon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                    <path
                      d="M3 12h18M12 3a15 15 0 0 1 0 18"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                  </svg>
                </span>
                {report.country}
              </button>
            ) : null}

            {report.decisionTypeLabel ? (
              <button className="lrr2MetaChip" data-tip="Decision Type">
                <span className="lrr2MetaIcon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 3v18M5 12h14" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </span>
                {report.decisionTypeLabel}
              </button>
            ) : null}

            {report.judges ? (
              <button className="lrr2MetaChip" data-tip="Judge(s)">
                <span className="lrr2MetaIcon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
                    <path
                      d="M5 20c1.5-4 12.5-4 14 0"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                  </svg>
                </span>
                {report.judges}
              </button>
            ) : null}

            {report.decisionDate ? (
              <button className="lrr2MetaChip" data-tip="Decision Date">
                <span className="lrr2MetaIcon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect
                      x="4"
                      y="5"
                      width="16"
                      height="15"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </span>
                {formatDate(report.decisionDate)}
              </button>
            ) : null}

            <button
              type="button"
              className="lrr2MetaChip"
              title="Copy title"
              onClick={() => navigator.clipboard?.writeText(`${title}`)}
            >
              Copy title
            </button>

            {report?.citation ? (
              <button
                type="button"
                className="lrr2MetaChip"
                title="Copy citation"
                onClick={() => navigator.clipboard?.writeText(String(report.citation))}
              >
                Copy citation
              </button>
            ) : null}
          </div>

          {!isAdmin && accessLoading ? (
            <span className="lrr2MetaHint" data-tip="Checking subscription access">
              checking access…
            </span>
          ) : null}
        </section>

        <section className="lrr2ActionsCard">
          <div className="lrr2ActionBtns">
            <div className="lrr2ActionsHint">
              Use the tabs below to switch between <b>Transcript</b> and <b>LegalAI Summary</b>.
            </div>
          </div>
        </section>
      </div>

      <div className="lrr2Tabs" role="tablist" aria-label="Reader tabs">
        <button
          type="button"
          role="tab"
          aria-selected={view === "content"}
          className={`lrr2Tab ${view === "content" ? "isActive" : ""}`}
          onClick={() => {
            setView("content");
            setContentOpen(true);
          }}
        >
          Transcript
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={view === "ai"}
          className={`lrr2Tab ${view === "ai" ? "isActive" : ""}`}
          onClick={() => {
            setView("ai");
            setContentOpen(false);
          }}
        >
          LegalAI Summary
          <span className="lrr2TabBadge">AI</span>
        </button>
      </div>

      <section className="lrr2Content">
        {view === "ai" ? (
          <LawReportAiSummaryPanel
            lawReportId={reportId}
            digestTitle={title}
            courtLabel={report?.court || ""}
            onOpenRelated={(rid) => navigate(`/dashboard/law-reports/${rid}`)}
          />
        ) : !textHasContent ? (
          <div className="lrr2Empty">This report has no content yet.</div>
        ) : (
          <article className="lrr2Article">
            <div className="lrr2TranscriptTools">
              <div className="lrr2CaseActions">
                <button
                  type="button"
                  className="lrr2Btn primary"
                  onClick={() => {
                    setView("content");
                    setContentOpen(true);
                  }}
                  title="View case content"
                >
                  View Case Content
                </button>

                <button
                  type="button"
                  className="lrr2Btn"
                  onClick={() => setContentOpen((v) => !v)}
                  title={contentOpen ? "Hide case content" : "Show case content"}
                >
                  {contentOpen ? "Hide Case Content" : "Show Case Content"}
                </button>
              </div>

              <div className="lrr2ReaderBar">
                <div className="lrr2ReaderCluster">
                  <button
                    type="button"
                    className="lrr2IconBtn"
                    onClick={() =>
                      setFontScale((v) => Math.max(0.9, Number((v - 0.05).toFixed(2))))
                    }
                    title="Decrease text size"
                    aria-label="Decrease text size"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M5 18h2.2l1.2-3h5.2l1.2 3H17L12.9 6h-1.8L5 18z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                      <path d="M9.2 13.2h4l-2-5-2 5z" stroke="currentColor" strokeWidth="1.6" />
                      <path
                        d="M18 10h4"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="lrr2IconBtnText">A−</span>
                  </button>

                  <button
                    type="button"
                    className="lrr2IconBtn"
                    onClick={() =>
                      setFontScale((v) => Math.min(1.2, Number((v + 0.05).toFixed(2))))
                    }
                    title="Increase text size"
                    aria-label="Increase text size"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M5 18h2.2l1.2-3h5.2l1.2 3H17L12.9 6h-1.8L5 18z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                      <path d="M9.2 13.2h4l-2-5-2 5z" stroke="currentColor" strokeWidth="1.6" />
                      <path
                        d="M20 8v6"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M17 11h6"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="lrr2IconBtnText">A+</span>
                  </button>

                  <button
                    type="button"
                    className={`lrr2IconBtn ${serif ? "isOn" : ""}`}
                    onClick={() => setSerif((v) => !v)}
                    title={serif ? "Serif font (on)" : "Serif font (off)"}
                    aria-label="Toggle serif font"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M7 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <path
                        d="M9 18V6h6v12"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                      <path d="M8 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <span className="lrr2IconBtnText">Serif</span>
                  </button>
                </div>

                <div className="lrr2ReaderCluster">
                  <button
                    type="button"
                    className={`lrr2IconBtn ${readingTheme === "paper" ? "isOn" : ""}`}
                    onClick={() => setReadingTheme("paper")}
                    title="Paper theme"
                    aria-label="Paper theme"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M7 3h7l3 3v15H7V3z" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" />
                      <path
                        d="M9 11h6M9 15h6"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="lrr2IconBtnText">Paper</span>
                  </button>

                  <button
                    type="button"
                    className={`lrr2IconBtn ${readingTheme === "sepia" ? "isOn" : ""}`}
                    onClick={() => setReadingTheme("sepia")}
                    title="Sepia theme"
                    aria-label="Sepia theme"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M7 3h10v18H7V3z" stroke="currentColor" strokeWidth="1.6" />
                      <path
                        d="M9 8h6M9 12h6M9 16h5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                      <path
                        d="M5.5 6.5c1.2-1.2 2.7-2 4.5-2"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        opacity=".7"
                      />
                    </svg>
                    <span className="lrr2IconBtnText">Sepia</span>
                  </button>

                  <button
                    type="button"
                    className={`lrr2IconBtn ${readingTheme === "dark" ? "isOn" : ""}`}
                    onClick={() => setReadingTheme("dark")}
                    title="Dark theme"
                    aria-label="Dark theme"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="lrr2IconBtnText">Dark</span>
                  </button>
                </div>
              </div>
            </div>

            <div
              className={[
                "lrr2Collapse",
                contentOpen ? "open" : "closed",
                `lrr2Theme-${readingTheme}`,
                fsClass,
                fontClass,
              ].join(" ")}
            >
              {isProbablyHtml(rawContent) ? (
                <div className="lrr2Html" dangerouslySetInnerHTML={{ __html: rawContent }} />
              ) : (
                <CaseContentFormatted text={rawContent} />
              )}
            </div>

            {contentOpen && (
              <div className="lrr2Panel lrr2Panel--tight lrr2DbRelatedPanel">
                <div className="lrr2PanelHead">
                  <div className="lrr2PanelHeadLeft">
                    <div className="lrr2PanelTitle">Related cases (in our database)</div>
                    <div className="lrr2PanelSub">Similar court / type / parties (fast match).</div>
                  </div>

                  <button
                    type="button"
                    className="lrr2Btn"
                    disabled={relatedDbLoading}
                    onClick={async () => {
                      try {
                        setRelatedDbLoading(true);
                        setRelatedDbError("");
                        const list = await fetchRelatedLawReports(reportId, 8);
                        setRelatedDb(Array.isArray(list) ? list : []);
                      } catch (e) {
                        setRelatedDb([]);
                        setRelatedDbError(getApiErrorMessage(e, "Failed to load related cases."));
                      } finally {
                        setRelatedDbLoading(false);
                      }
                    }}
                    title="Refresh related cases"
                  >
                    {relatedDbLoading ? "Loading…" : "Refresh"}
                  </button>
                </div>

                {relatedDbError ? (
                  <div className="lrr2PanelError">{relatedDbError}</div>
                ) : relatedDbLoading ? (
                  <div className="lrr2PanelEmpty">Loading related cases…</div>
                ) : relatedDb.length === 0 ? (
                  <div className="lrr2PanelEmpty">No related cases found.</div>
                ) : (
                  <div className="lrr2DbRelatedList">
                    {relatedDb.map((r, idx) => {
                      const rid = Number(r?.id);
                      const titleText = r?.title || r?.parties || `Report #${rid || idx + 1}`;
                      const meta = [r?.courtTypeLabel, r?.caseTypeLabel, r?.decisionTypeLabel, r?.year]
                        .filter(Boolean)
                        .join(" • ");
                      const right = r?.citation || "";

                      return (
                        <button
                          type="button"
                          key={rid || idx}
                          className="lrr2SearchItem lrr2SearchItem--row"
                          onClick={() => rid && navigate(`/dashboard/law-reports/${rid}`)}
                          title={titleText}
                        >
                          <div className="lrr2SearchItemLeft">
                            <div className="lrr2SearchItemTitle">{titleText}</div>
                            {meta ? <div className="lrr2SearchItemMeta">{meta}</div> : null}
                          </div>
                          <div className="lrr2SearchItemRight">
                            {right ? <span className="lrr2Tag">{right}</span> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </article>
        )}
      </section>
    </div>
  );
}
