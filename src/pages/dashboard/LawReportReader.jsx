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

  // roles may exist in different places depending on how you issue JWT
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
// Formatting + TOC helpers
// ----------------------
// ----------------------
// Formatting + TOC helpers
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
  "ORDERS REASONS",
  "ORDERS / REASONS",
]);

function normalizeText(s) {
  return String(s || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function looksLikeHeading(line) {
  const t = String(line || "").trim();
  if (!t) return false;

  const clean = t.replace(/[:.\-–—]+$/g, "").trim();
  const upper = clean.toUpperCase();

  const words = upper.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  if (words.length > 7) return false;

  const headingish = upper.replace(/\s+\/\s+/g, " / ").replace(/\s+/g, " ").trim();
  if (HEADING_SET.has(headingish)) return true;

  // ALL CAPS headings
  const alpha = clean.replace(/[^A-Za-z]/g, "");
  const isAllCaps = alpha.length > 0 && alpha === alpha.toUpperCase();
  if (isAllCaps) return HEADING_SET.has(upper) || upper.length <= 28;

  // Title-case short headings like "Ruling"
  if (words.length <= 3 && clean.length <= 28) return HEADING_SET.has(upper);

  return false;
}

// list item detection (expects marker at start of line)
function parseListItem(line) {
  const s = String(line || "").trim();
  if (!s) return null;

  // (a) text
  let m = s.match(/^\(([a-z])\)\s+(.*)$/i);
  if (m) return { kind: "alpha", marker: m[1].toLowerCase(), text: m[2] };

  // a. text
  m = s.match(/^([a-z])\.\s+(.*)$/i);
  if (m) return { kind: "alpha", marker: m[1].toLowerCase(), text: m[2] };

  // 1. text
  m = s.match(/^(\d+)\.\s+(.*)$/);
  if (m) return { kind: "num", marker: m[1], text: m[2] };

  // (i) text
  m = s.match(/^\(([ivxlcdm]+)\)\s+(.*)$/i);
  if (m) return { kind: "roman", marker: m[1].toLowerCase(), text: m[2] };

  // i) text
  m = s.match(/^([ivxlcdm]+)\)\s+(.*)$/i);
  if (m) return { kind: "roman", marker: m[1].toLowerCase(), text: m[2] };

  return null;
}

/**
 * ✅ NEW: Reflow “block text” into readable structure.
 * Goal: introduce paragraph breaks + heading breaks + list breaks
 * so our parser can actually detect them.
 */
function reflowForReader(content) {
  let t = normalizeText(content);

  // normalize spaces but keep newlines
  t = t.replace(/[ \t]+/g, " ");

  // 1) Make "Orders Reasons" a clear heading block
  t = t.replace(/\bOrders\s*\/?\s*Reasons\b/gi, "\n\nORDERS REASONS\n");

  // 2) Break BEFORE common heading keywords if they appear mid-text
  // (helps for pasted content like "... and; Orders Reasons a. ...")
  t = t.replace(
    /([.?!])\s+(Introduction|Background|Facts|Held|Holding|Issues|Issue|Analysis|Reasons|Judgment|Ruling|Decision|Order|Orders|Conclusion|Summary|Dissent|Concurring|Appeal|Application|Submissions)\b/g,
    "$1\n\n$2"
  );

  // 3) Turn "Orders a." / "Reasons a." into proper list lines
  t = t.replace(/\b(Orders|Reasons)\s+([a-z])\.\s+/gi, "$1\n\n$2. ");
  t = t.replace(/\b(Orders|Reasons)\s+\(([a-z])\)\s+/gi, "$1\n\n$2. ");

  // 4) Break list markers that occur inline: "... issue. a. First ... b. Second ..."
  // Only do this when marker has a space before it (reduces false hits)
  t = t.replace(/(\s)([a-z])\.\s+/gi, "\n$2. ");
  t = t.replace(/(\s)(\d+)\.\s+/g, "\n$2. ");

  // 5) Introduce paragraph breaks at legal-style connectors
  // e.g. "; and" or "and;" often indicates a new thought/paragraph in case texts
  t = t.replace(/;\s+and\s+/gi, ";\n\n");
  t = t.replace(/;\s+/g, ";\n\n");

  // 6) Sentence-based paragraphing for long blocks:
  // break after a sentence when the next starts with common legal openers
  t = t.replace(
    /\.(\s+)(?=(Upon|The|And|In|On|After|Further|However|Therefore|Consequently|Where|Accordingly)\b)/g,
    ".\n\n"
  );

  // 7) Clean up too many newlines
  t = t.replace(/\n{3,}/g, "\n\n").trim();

  return t;
}

function splitIntoBlocksWithListsAndHeadings(content) {
  const text = normalizeText(content);
  if (!text.trim()) return [];

  const paras = text.split(/\n{2,}/g);
  const blocks = [];
  let sectionIndex = 0;

  const pushHeading = (headingText) => {
    sectionIndex += 1;
    const base = slugify(headingText) || `section-${sectionIndex}`;
    let id = base;
    let n = 2;
    while (blocks.some((b) => b.type === "heading" && b.id === id)) id = `${base}-${n++}`;
    blocks.push({ type: "heading", text: headingText.trim(), id });
  };

  const pushPara = (paraText) => {
    const p = String(paraText || "").trim();
    if (!p) return;
    blocks.push({ type: "para", text: p });
  };

  const pushList = (items, listKind) => {
    if (!items || items.length === 0) return;
    blocks.push({ type: "list", kind: listKind, items });
  };

  for (const p of paras) {
    const raw = String(p || "").trim();
    if (!raw) continue;

    const lines = raw.split("\n").map((x) => x.trimEnd());
    const first = lines[0]?.trim() || "";

    if (first && looksLikeHeading(first)) {
      pushHeading(first);
      const rest = lines.slice(1).join("\n").trim();
      if (rest) pushPara(rest);
      continue;
    }

    let buffer = [];
    let listItems = [];
    let listKind = null;

    const flushBufferAsPara = () => {
      if (buffer.length) {
        pushPara(buffer.join("\n").trim());
        buffer = [];
      }
    };
    const flushList = () => {
      if (listItems.length) {
        pushList(listItems, listKind || "alpha");
        listItems = [];
        listKind = null;
      }
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]?.trim() || "";
      if (!line) {
        flushBufferAsPara();
        flushList();
        continue;
      }

      if (looksLikeHeading(line)) {
        flushBufferAsPara();
        flushList();
        pushHeading(line);
        continue;
      }

      const li = parseListItem(line);
      if (li) {
        flushBufferAsPara();
        if (!listKind) listKind = li.kind;
        listItems.push(li);
        continue;
      }

      if (listItems.length > 0) {
        const last = listItems[listItems.length - 1];
        last.text = `${last.text}\n${line}`.trim();
        continue;
      }

      buffer.push(line);
    }

    flushBufferAsPara();
    flushList();
  }

  return blocks;
}

function buildToc(blocks) {
  return blocks.filter((b) => b.type === "heading").map((h) => ({ id: h.id, text: h.text }));
}

function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // TOC UI
  const [tocOpen, setTocOpen] = useState(false);

  // Load report (unchanged)
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
        if (!cancelled)
          setError("We couldn’t load this report right now. Please try again.");
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

  // Availability + access checks (unchanged)
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
        // Otherwise, check availability from LegalDocument
        try {
          setAvailabilityLoading(true);
          const r = await api.get(
            `/legal-documents/${report.legalDocumentId}/availability`
          );
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
          const r = await api.get(
            `/legal-documents/${report.legalDocumentId}/access`
          );
          if (!cancelled) setAccess(r?.data ?? null);
        } catch {
          if (!cancelled) setAccess(null);
        } finally {
          if (!cancelled) setAccessLoading(false);
        }
      } else {
        // Not applicable
        if (!cancelled) setAccess(null);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [report, isInst, isPublic, isAdmin]);

  // ✅ Enhanced blocks with lists + headings
    const formattedText = useMemo(
        () => reflowForReader(report?.contentText || ""),
        [report]
    );

    const blocks = useMemo(
        () => splitIntoBlocksWithListsAndHeadings(formattedText),
        [formattedText]
    );

  // ✅ TOC built from headings
  const toc = useMemo(() => buildToc(blocks), [blocks]);

  const hasFullAccess = !!access?.hasFullAccess;
  const textHasContent = !!String(report?.contentText || "").trim();

  // ✅ Admin can always open reader (won’t be blocked by availability/access)
  // ✅ For non-admin: must have content (either ContentText or availability true)
  const canRead =
    !!report &&
    (isAdmin ||
      ((hasContent || textHasContent) &&
        (!report.isPremium || hasFullAccess || (!isInst && !isPublic))));

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
          <div style={{ marginTop: 12 }}>
            <button
              className="lrr-btn"
              onClick={() => navigate("/dashboard/law-reports")}
            >
              ← Back to Law Reports
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If premium and no access, send them to LegalDocument page (pricing/access)
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

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 14,
            }}
          >
            <button
              className="lrr-btn"
              onClick={() => navigate("/dashboard/law-reports")}
            >
              ← Back
            </button>
            <button
              className="lrr-btn secondary"
              onClick={() =>
                navigate(`/dashboard/documents/${report.legalDocumentId}`)
              }
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
          <button
            className="lrr-pill"
            onClick={() => navigate("/dashboard/law-reports")}
          >
            ← Back
          </button>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* TOC toggle */}
            {toc.length > 0 && (
              <button
                className="lrr-pill ghost"
                onClick={() => setTocOpen((v) => !v)}
                aria-expanded={tocOpen}
              >
                Contents ▾
              </button>
            )}

            <button
              className="lrr-pill ghost"
              onClick={() =>
                navigate(`/dashboard/documents/${report.legalDocumentId}`)
              }
              disabled={!report.legalDocumentId}
            >
              Document page
            </button>
          </div>
        </div>

        {/* TOC dropdown */}
        {tocOpen && toc.length > 0 && (
          <div className="lrr-toc">
            {toc.map((t) => (
              <button
                key={t.id}
                className="lrr-toc-item"
                onClick={() => {
                  setTocOpen(false);
                  scrollToId(t.id);
                }}
              >
                {t.text}
              </button>
            ))}
          </div>
        )}

        <div className="lrr-title">{title}</div>

        <div className="lrr-meta">
          {report.reportNumber ? (
            <span className="lrr-chip">{report.reportNumber}</span>
          ) : null}
          {report.citation ? <span className="lrr-chip">{report.citation}</span> : null}
          {report.year ? <span className="lrr-chip">{report.year}</span> : null}
          {report.decisionTypeLabel ? (
            <span className="lrr-chip">{report.decisionTypeLabel}</span>
          ) : null}
          {report.caseTypeLabel ? (
            <span className="lrr-chip">{report.caseTypeLabel}</span>
          ) : null}
          {report.courtTypeLabel ? (
            <span className="lrr-chip">{report.courtTypeLabel}</span>
          ) : null}
          {report.town ? <span className="lrr-chip">{report.town}</span> : null}
          {!report.town && report.townPostCode ? (
            <span className="lrr-chip">{report.townPostCode}</span>
          ) : null}
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
          {!isAdmin && accessLoading ? (
            <div className="lrr-soft">checking access…</div>
          ) : null}
          {!isAdmin && availabilityLoading ? (
            <div className="lrr-soft">checking availability…</div>
          ) : null}
        </div>
      </header>

      {/* Content */}
      <main className="lrr-main">
        {blocks.length === 0 ? (
          <div className="lrr-empty">This report has no content yet.</div>
        ) : (
          <article className="lrr-article">
            {blocks.map((b, idx) => {
              if (b.type === "heading") {
                return (
                  <h2 key={`${b.id}-${idx}`} id={b.id} className="lrr-h2">
                    {b.text}
                  </h2>
                );
              }

              if (b.type === "list") {
                // Render lists with proper semantics and styling
                const ListTag = b.kind === "num" ? "ol" : "ol"; // keep ol for alpha/roman too (CSS will style markers)
                return (
                  <ListTag
                    key={`list-${idx}`}
                    className={`lrr-list lrr-list-${b.kind || "alpha"}`}
                  >
                    {b.items.map((it, j) => (
                      <li key={`${idx}-${j}`} className="lrr-li">
                        <span className="lrr-li-marker">{it.marker}.</span>
                        <span className="lrr-li-text">{it.text}</span>
                      </li>
                    ))}
                  </ListTag>
                );
              }

              // paragraph
              return (
                <p key={`p-${idx}`} className="lrr-p">
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
