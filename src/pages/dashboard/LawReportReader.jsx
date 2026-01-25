// src/pages/dashboard/LawReportReader.jsx
import { useEffect, useMemo, useState } from "react";
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

/**
 * Robust global admin detection.
 * Adjust role names here to match your backend roles exactly.
 */
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
// Formatting helpers
// ----------------------
const HEADING_SET = new Set([
  "INTRODUCTION",
  "BACKGROUND",
  "FACTS",
  "HELD",
  "HOLDING",
  "ISSUES",
  "ISSUE",
  "ANALYSIS",
  "REASONS",
  "JUDGMENT",
  "RULING",
  "DECISION",
  "ORDER",
  "ORDERS",
  "DISPOSITION",
  "CONCLUSION",
  "SUMMARY",
  "DISSENT",
  "CONCURRING",
  "APPEAL",
  "APPLICATION",
  "SUBMISSIONS",
]);

function normalizeText(s) {
  return String(s || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 10);
}

function looksLikeHeading(line) {
  const t = String(line || "").trim();
  if (!t) return false;

  const clean = t.replace(/[:.\-–—]+$/g, "").trim();
  const upper = clean.toUpperCase();

  const words = upper.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  if (words.length > 6) return false;

  const alpha = clean.replace(/[^A-Za-z]/g, "");
  const isAllCaps = alpha.length > 0 && alpha === alpha.toUpperCase();
  if (!isAllCaps) return false;

  return HEADING_SET.has(upper) || upper.length <= 24;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

/**
 * Plain-text reflow to improve readability without changing meaning.
 */
function reflowForReader(raw) {
  let t = normalizeText(raw);

  t = t.replace(/[ \t]+/g, " ");

  for (const h of HEADING_SET) {
    const re = new RegExp(`(^|\\n)\\s*(${h})\\s+`, "g");
    t = t.replace(re, `$1$2\n\n`);
  }

  t = t.replace(/\bOrders\s+Reasons\b/g, "Orders\nReasons");
  t = t.replace(/(^|\n)(Orders|Reasons|Held|HELD|ORDERS|REASONS)\b/g, "$1$2\n");
  t = t.replace(/\n{3,}/g, "\n\n").trim();

  return t;
}

function parseListLine(line) {
  const s = String(line || "");

  let m = s.match(/^\s*(\(?\d+\)?[.)\]])\s+(.*)$/);
  if (m) return { kind: "ol", marker: m[1], text: (m[2] || "").trim(), olType: "1" };

  m = s.match(/^\s*([a-zA-Z][.)\]])\s+(.*)$/);
  if (m) {
    const letter = String(m[1] || "").replace(/[^a-zA-Z]/g, "");
    const isUpper = letter && letter === letter.toUpperCase();
    return {
      kind: "ol",
      marker: m[1],
      text: (m[2] || "").trim(),
      olType: isUpper ? "A" : "a",
    };
  }

  m = s.match(/^\s*([-•])\s+(.*)$/);
  if (m) return { kind: "ul", marker: m[1], text: (m[2] || "").trim() };

  return null;
}

function splitIntoBlocksWithListsAndHeadings(content) {
  const text = normalizeText(content);
  if (!text.trim()) return [];

  const paras = text.split(/\n{2,}/g);
  const blocks = [];

  let pendingList = null;

  function flushList() {
    if (pendingList && pendingList.items.length > 0) blocks.push(pendingList);
    pendingList = null;
  }

  for (const p of paras) {
    const raw = p.replace(/\n{3,}/g, "\n\n").trim();
    if (!raw) continue;

    const lines = raw.split("\n").map((x) => x.trimEnd());
    const firstLine = (lines.find((x) => x.trim()) || "").trim();

    if (firstLine && looksLikeHeading(firstLine)) {
      flushList();
      blocks.push({ type: "heading", text: firstLine.trim() });

      const restLines = lines.slice(lines.indexOf(firstLine) + 1).join("\n").trim();
      if (restLines) blocks.push({ type: "para", text: restLines });
      continue;
    }

    const listCandidates = lines
      .map((ln) => ({ ln, parsed: parseListLine(ln) }))
      .filter((x) => !!x.parsed);

    const isMostlyList =
      listCandidates.length > 0 && listCandidates.length >= Math.max(2, Math.ceil(lines.length * 0.5));

    if (isMostlyList) {
      for (const { ln, parsed } of lines.map((ln) => ({ ln, parsed: parseListLine(ln) }))) {
        if (!parsed) {
          if (pendingList && pendingList.items.length > 0 && ln.trim()) {
            const last = pendingList.items[pendingList.items.length - 1];
            last.text = `${last.text}\n${ln.trim()}`;
          }
          continue;
        }

        const isOrdered = parsed.kind === "ol";
        const olType = parsed.olType || "1";

        if (
          !pendingList ||
          pendingList.type !== "list" ||
          pendingList.ordered !== isOrdered ||
          (isOrdered && pendingList.olType !== olType)
        ) {
          flushList();
          pendingList = { type: "list", ordered: isOrdered, olType, items: [] };
        }

        pendingList.items.push({ text: parsed.text });
      }
      flushList();
      continue;
    }

    flushList();
    blocks.push({ type: "para", text: raw });
  }

  flushList();
  return blocks;
}

function assignHeadingIds(blocks) {
  const seen = new Map();
  return blocks.map((b) => {
    if (b.type !== "heading") return b;
    const base = slugify(b.text) || "section";
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    return { ...b, id };
  });
}

function buildToc(blocksWithIds) {
  return (blocksWithIds || [])
    .filter((b) => b.type === "heading" && b.id)
    .map((b) => ({ id: b.id, text: b.text }));
}

// ----------------------
// HTML-aware rendering (CKEditor output)
// ----------------------
function looksLikeHtml(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  return /<\/?[a-z][\s\S]*>/i.test(t);
}

/**
 * Very small sanitizer:
 * - removes script/style/iframe/object/embed
 * - strips event handlers (on*)
 * - keeps safe tags + safe attributes for links
 */
function sanitizeHtmlBasic(inputHtml) {
  const html = String(inputHtml || "");
  if (!html.trim()) return "";

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html.replace(/<[^>]+>/g, "");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const removeSelectors = ["script", "style", "iframe", "object", "embed"];
  removeSelectors.forEach((sel) => doc.querySelectorAll(sel).forEach((n) => n.remove()));

  const allowedTags = new Set([
    "P",
    "BR",
    "STRONG",
    "B",
    "EM",
    "I",
    "U",
    "S",
    "A",
    "UL",
    "OL",
    "LI",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "BLOCKQUOTE",
    "HR",
    "TABLE",
    "THEAD",
    "TBODY",
    "TR",
    "TH",
    "TD",
    "CODE",
    "PRE",
    "SPAN",
    "DIV",
  ]);

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const toRemove = [];

  while (walker.nextNode()) {
    const el = walker.currentNode;
    if (!allowedTags.has(el.tagName)) {
      toRemove.push(el);
      continue;
    }

    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || "");

      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        return;
      }

      if (el.tagName === "A") {
        if (name === "href") {
          if (/^\s*javascript:/i.test(value)) el.removeAttribute("href");
          return;
        }
        if (name === "target") return;
        if (name === "rel") return;

        el.removeAttribute(attr.name);
        return;
      }

      el.removeAttribute(attr.name);
    });

    if (el.tagName === "A") {
      const href = el.getAttribute("href");
      if (href) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noreferrer noopener");
      }
    }
  }

  for (const el of toRemove) {
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
  }

  return doc.body.innerHTML || "";
}

/**
 * Build TOC from actual HTML headings (h1-h6). Inject ids if missing.
 */
function buildHtmlTocAndInjectIds(html) {
  const safe = sanitizeHtmlBasic(html);
  if (!safe.trim()) return { html: "", toc: [] };

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return { html: safe, toc: [] };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(safe, "text/html");

  const headings = [...doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6")];
  const toc = [];
  const seen = new Map();

  for (const h of headings) {
    const text = (h.textContent || "").trim();
    if (!text) continue;

    let id = h.getAttribute("id");
    if (!id) {
      const base = slugify(text) || "section";
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      id = n === 1 ? base : `${base}-${n}`;
      h.setAttribute("id", id);
    }

    toc.push({ id, text });
  }

  return { html: doc.body.innerHTML || safe, toc };
}

// ----------------------
// AI Panel (CSS-based, no inline styles)
// ----------------------
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

function formatDateMaybe(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleString();
  } catch {
    return String(d);
  }
}

function LawReportAiSummaryPanel({ lawReportId }) {
  const [type, setType] = useState("basic"); // basic | extended
  const [forceRegenerate, setForceRegenerate] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const canRun = useMemo(
    () => Number.isFinite(Number(lawReportId)) && Number(lawReportId) > 0,
    [lawReportId]
  );

  async function fetchCached() {
    if (!canRun) return;

    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/ai/law-reports/${Number(lawReportId)}/summary`, {
        params: { type },
      });
      setResult(res.data?.data ?? res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No cached summary found yet."));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    if (!canRun) return;

    setLoading(true);
    setError("");
    try {
      const res = await api.post(`/ai/law-reports/${Number(lawReportId)}/summary`, {
        type,
        forceRegenerate,
      });
      setResult(res.data?.data ?? res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to generate AI summary."));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="lrr-ai">
      <div className="lrr-ai-top">
        <div className="lrr-ai-titleRow">
          <div className="lrr-ai-title">AI Summary</div>
          <span className="lrr-ai-badge">AI generated</span>
        </div>
        <div className="lrr-ai-sub">
          Generates (and caches) a summary for this report. Always verify important details against the full text.
        </div>
      </div>

      <div className="lrr-ai-controls">
        <div className="lrr-ai-leftControls">
          <label className="lrr-ai-field">
            <span className="lrr-ai-label">Summary type</span>
            <select className="lrr-ai-select" value={type} onChange={(e) => setType(e.target.value)} disabled={loading}>
              <option value="basic">basic</option>
              <option value="extended">extended</option>
            </select>
          </label>

          <label className="lrr-ai-check">
            <input
              className="lrr-ai-checkbox"
              type="checkbox"
              checked={forceRegenerate}
              onChange={(e) => setForceRegenerate(e.target.checked)}
              disabled={loading}
            />
            <span>Force regenerate</span>
          </label>
        </div>

        <div className="lrr-ai-actions">
          <button type="button" className="lrr-ai-btn lrr-ai-btnPrimary" onClick={fetchCached} disabled={loading || !canRun}>
            {loading ? "Working…" : "Get cached"}
          </button>

          <button type="button" className="lrr-ai-btn lrr-ai-btnGhost" onClick={generate} disabled={loading || !canRun}>
            {loading ? "Working…" : "Generate"}
          </button>
        </div>
      </div>

      {error ? <div className="lrr-ai-error">{error}</div> : null}

      {result ? (
        <div className="lrr-ai-result">
          <div className="lrr-ai-meta">
            <div className="lrr-ai-metaCol">
              <div>
                <b>Type:</b> {result.type ?? type}
              </div>
              {"cached" in result ? (
                <div>
                  <b>Cached:</b> {String(result.cached)}
                </div>
              ) : null}
            </div>

            <div className="lrr-ai-metaCol right">
              <div>
                <b>Created:</b> {formatDateMaybe(result.createdAt)}
              </div>
              <div>
                <b>Updated:</b> {formatDateMaybe(result.updatedAt)}
              </div>
            </div>
          </div>

          <div className="lrr-ai-body">
            <pre className="lrr-ai-text">{result.summary || ""}</pre>
          </div>
        </div>
      ) : (
        <div className="lrr-ai-tip">
          Tip: Click <b>Get cached</b> first. If none exists, click <b>Generate</b>.
        </div>
      )}
    </section>
  );
}

export default function LawReportReader() {
  const { id } = useParams();
  const reportId = Number(id);
  const navigate = useNavigate();

  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();
  const isAdmin = isGlobalAdminUser();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // gating
  const [hasContent, setHasContent] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  // TOC UX
  const [tocOpen, setTocOpen] = useState(true);

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

  // Availability + access checks (based on LegalDocumentId) — DO NOT CHANGE LOGIC
  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!report?.legalDocumentId) return;

      // ✅ Global admin bypass: do not block admin with availability/access checks
      if (isAdmin) {
        if (!cancelled) {
          setHasContent(true);
          setAvailabilityLoading(false);
          setAccess({ hasFullAccess: true });
          setAccessLoading(false);
        }
        return;
      }

      // ✅ If ContentText exists, treat as available and skip /availability
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
          if (!cancelled) setHasContent(true); // fail-open
        } finally {
          if (!cancelled) setAvailabilityLoading(false);
        }
      }

      // Access: only needed for premium + public/institution flows
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

  // ----------------------
  // Formatting pipeline (ALWAYS RUN HOOKS HERE — avoids React #310)
  // ----------------------
  const rawContent = useMemo(() => String(report?.contentText || ""), [report?.contentText]);
  const contentIsHtml = useMemo(() => looksLikeHtml(rawContent), [rawContent]);

  // HTML mode: sanitize + build TOC from real headings (if any)
  const htmlPack = useMemo(() => {
    if (!contentIsHtml) return { html: "", toc: [] };
    return buildHtmlTocAndInjectIds(rawContent);
  }, [contentIsHtml, rawContent]);

  // Plain-text mode: reflow + blocks + TOC
  const formattedText = useMemo(() => {
    if (contentIsHtml) return "";
    return reflowForReader(rawContent);
  }, [contentIsHtml, rawContent]);

  const blocks = useMemo(() => {
    if (contentIsHtml) return [];
    const rawBlocks = splitIntoBlocksWithListsAndHeadings(formattedText);
    return assignHeadingIds(rawBlocks);
  }, [contentIsHtml, formattedText]);

  const toc = useMemo(() => {
    if (contentIsHtml) return htmlPack.toc || [];
    return buildToc(blocks);
  }, [contentIsHtml, htmlPack.toc, blocks]);

  const hasFullAccess = !!access?.hasFullAccess;
  const textHasContent = !!rawContent.trim();

  const canRead =
    !!report &&
    (isAdmin ||
      ((hasContent || textHasContent) && (!report.isPremium || hasFullAccess || (!isInst && !isPublic))));

  // ----------------------
  // Returns (AFTER hooks)
  // ----------------------
  if (loading) {
    return (
      <div className="lrr-wrap">
        <div className="lrr-loading">Loading report…</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="lrr-wrap">
        <div className="lrr-error">
          <div className="lrr-error-title">Report unavailable</div>
          <div className="lrr-error-msg">{error || "Not found."}</div>
          <div className="lrr-actions">
            <button className="lrr-btn" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back to Law Reports
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="lrr-wrap">
        <div className="lrr-error">
          <div className="lrr-error-title">Access required</div>
          <div className="lrr-error-msg">
            {availabilityLoading
              ? "Checking availability…"
              : !hasContent && !textHasContent
                ? "This report isn’t available yet."
                : "This is a premium report. Please subscribe or sign in with an eligible account to read it."}
          </div>

          <div className="lrr-actions lrr-actionsRow">
            <button className="lrr-btn" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back
            </button>
            <button
              className="lrr-btn secondary"
              onClick={() => navigate(`/dashboard/documents/${report.legalDocumentId}`)}
              disabled={!report.legalDocumentId}
            >
              Go to Document Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  const title = report.parties || report.title || "Law Report";

  return (
    <div className="lrr-wrap">
      {/* Sticky meta header */}
      <header className="lrr-header">
        <div className="lrr-header-top">
          <button className="lrr-pill" onClick={() => navigate("/dashboard/law-reports")}>
            ← Back
          </button>

          <div className="lrr-header-actions">
            <button
              className="lrr-pill ghost"
              onClick={() => navigate(`/dashboard/documents/${report.legalDocumentId}`)}
              disabled={!report.legalDocumentId}
            >
              Document page
            </button>

            <button className="lrr-pill ghost" disabled title="Coming soon" onClick={() => {}}>
              Download (soon)
            </button>
          </div>
        </div>

        <div className="lrr-title">{title}</div>

        <div className="lrr-meta">
          {report.reportNumber ? <span className="lrr-chip">{report.reportNumber}</span> : null}
          {report.citation ? <span className="lrr-chip">{report.citation}</span> : null}
          {report.year ? <span className="lrr-chip">{report.year}</span> : null}
          {report.decisionTypeLabel ? <span className="lrr-chip">{report.decisionTypeLabel}</span> : null}
          {report.caseTypeLabel ? <span className="lrr-chip">{report.caseTypeLabel}</span> : null}
          {report.courtTypeLabel ? <span className="lrr-chip">{report.courtTypeLabel}</span> : null}
          {report.town ? <span className="lrr-chip">{report.town}</span> : null}
          {!report.town && report.townPostCode ? <span className="lrr-chip">{report.townPostCode}</span> : null}
        </div>

        <div className="lrr-submeta">
          {report.decisionDate ? (
            <div>
              <strong>Date:</strong> {formatDate(report.decisionDate)}
            </div>
          ) : null}
          {report.judges ? (
            <div>
              <strong>Judges:</strong> {report.judges}
            </div>
          ) : null}
          {report.court ? (
            <div>
              <strong>Court:</strong> {report.court}
            </div>
          ) : null}
          {report.caseNumber ? (
            <div>
              <strong>Case No:</strong> {report.caseNumber}
            </div>
          ) : null}

          {isAdmin ? <div className="lrr-soft">admin access</div> : null}
          {!isAdmin && accessLoading ? <div className="lrr-soft">checking access…</div> : null}
          {!isAdmin && availabilityLoading ? <div className="lrr-soft">checking availability…</div> : null}
        </div>
      </header>

      {/* Content */}
      <main className="lrr-main">
        {/* AI Summary (inside reader, above TOC + content) */}
        <LawReportAiSummaryPanel lawReportId={reportId} />

        {/* TOC */}
        {toc.length > 0 && (
          <section className="lrr-toc">
            <button className="lrr-toc-toggle" onClick={() => setTocOpen((v) => !v)}>
              <span>On this page</span>
              <span className="lrr-toc-toggle-icon">{tocOpen ? "–" : "+"}</span>
            </button>

            {tocOpen && (
              <div className="lrr-toc-body">
                {toc.map((t) => (
                  <a key={t.id} className="lrr-toc-link" href={`#${t.id}`}>
                    {t.text}
                  </a>
                ))}
              </div>
            )}
          </section>
        )}

        {!textHasContent ? (
          <div className="lrr-empty">This report has no content yet.</div>
        ) : contentIsHtml ? (
          <article className="lrr-article lrr-html">
            <div className="lrr-html-body" dangerouslySetInnerHTML={{ __html: htmlPack.html }} />
          </article>
        ) : blocks.length === 0 ? (
          <div className="lrr-empty">This report has no content yet.</div>
        ) : (
          <article className="lrr-article">
            {blocks.map((b, idx) => {
              if (b.type === "heading") {
                return (
                  <h2 key={idx} id={b.id} className="lrr-h2">
                    {b.text}
                  </h2>
                );
              }

              if (b.type === "list") {
                if (b.ordered) {
                  return (
                    <ol key={idx} className="lrr-ol" type={b.olType || "1"}>
                      {(b.items || []).map((it, i) => (
                        <li key={i} className="lrr-li">
                          <span className="lrr-li-text">{it.text}</span>
                        </li>
                      ))}
                    </ol>
                  );
                }

                return (
                  <ul key={idx} className="lrr-ul">
                    {(b.items || []).map((it, i) => (
                      <li key={i} className="lrr-li">
                        <span className="lrr-li-text">{it.text}</span>
                      </li>
                    ))}
                  </ul>
                );
              }

              return (
                <p key={idx} className="lrr-p">
                  {b.text}
                </p>
              );
            })}
          </article>
        )}
      </main>
    </div>
  );
}