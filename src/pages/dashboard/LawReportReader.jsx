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
  // ✅ FIX: ensure this exists (your runtime error was: formatDate is not defined)
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
 * First-pass "reflow" to improve readability without changing meaning.
 * - Normalize newlines
 * - Ensure headings are separated by blank lines
 * - Expand some common inline "Orders Reasons" patterns onto new lines
 */
function reflowForReader(raw) {
  let t = normalizeText(raw);

  // Normalize excessive spaces
  t = t.replace(/[ \t]+/g, " ");

  // Make sure common headings get their own paragraph
  // e.g. "... RULING Upon ..." -> "RULING\n\nUpon ..."
  // (only when they appear as a standalone word boundary)
  for (const h of HEADING_SET) {
    const re = new RegExp(`(^|\\n)\\s*(${h})\\s+`, "g");
    t = t.replace(re, `$1$2\n\n`);
  }

  // Split "Orders Reasons" when it appears inline
  t = t.replace(/\bOrders\s+Reasons\b/g, "Orders\nReasons");

  // Create spacing around list headers like "Orders" / "Reasons" / "Held"
  t = t.replace(/(^|\n)(Orders|Reasons|Held|HELD|ORDERS|REASONS)\b/g, "$1$2\n");

  // Collapse too many blank lines
  t = t.replace(/\n{3,}/g, "\n\n").trim();

  return t;
}

function parseListLine(line) {
  const s = String(line || "");

  // 1) numeric list: "1. text" / "(1) text" / "1) text"
  let m = s.match(/^\s*(\(?\d+\)?[.)\]])\s+(.*)$/);
  if (m) return { kind: "ol", marker: m[1], text: (m[2] || "").trim(), olType: "1" };

  // 2) alpha list: "a. text" / "b) text"
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

  // 3) bullets: "- text" / "• text"
  m = s.match(/^\s*([-•])\s+(.*)$/);
  if (m) return { kind: "ul", marker: m[1], text: (m[2] || "").trim() };

  return null;
}

/**
 * Split content into:
 * - heading blocks
 * - paragraphs
 * - list blocks (ul/ol)
 */
function splitIntoBlocksWithListsAndHeadings(content) {
  const text = normalizeText(content);
  if (!text.trim()) return [];

  const paras = text.split(/\n{2,}/g);
  const blocks = [];

  let pendingList = null; // { type:'list', ordered, olType, items:[] }

  function flushList() {
    if (pendingList && pendingList.items.length > 0) {
      blocks.push(pendingList);
    }
    pendingList = null;
  }

  for (const p of paras) {
    const raw = p.replace(/\n{3,}/g, "\n\n").trim();
    if (!raw) continue;

    const lines = raw.split("\n").map((x) => x.trimEnd());

    // Heading detection on first non-empty line
    const firstLine = (lines.find((x) => x.trim()) || "").trim();
    if (firstLine && looksLikeHeading(firstLine)) {
      flushList();
      blocks.push({ type: "heading", text: firstLine.trim() });

      const restLines = lines.slice(lines.indexOf(firstLine) + 1).join("\n").trim();
      if (restLines) blocks.push({ type: "para", text: restLines });
      continue;
    }

    // Detect lists inside this paragraph
    const listCandidates = lines
      .map((ln) => ({ ln, parsed: parseListLine(ln) }))
      .filter((x) => !!x.parsed);

    // If most lines in this paragraph are list-ish, treat as list block
    const isMostlyList = listCandidates.length > 0 && listCandidates.length >= Math.max(2, Math.ceil(lines.length * 0.5));

    if (isMostlyList) {
      for (const { ln, parsed } of lines.map((ln) => ({ ln, parsed: parseListLine(ln) }))) {
        if (!parsed) {
          // non-list line -> treat as continuation of previous list item
          if (pendingList && pendingList.items.length > 0 && ln.trim()) {
            const last = pendingList.items[pendingList.items.length - 1];
            last.text = `${last.text}\n${ln.trim()}`;
          }
          continue;
        }

        const isOrdered = parsed.kind === "ol";
        const olType = parsed.olType || "1";

        // Start or switch list kind
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

    // Normal paragraph
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
        // Otherwise, check availability from LegalDocument
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
        // Not applicable
        if (!cancelled) setAccess(null);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [report, isInst, isPublic, isAdmin]);

  // ✅ Formatting pipeline (this is where you add the new memos)
  const formattedText = useMemo(
    () => reflowForReader(report?.contentText || ""),
    [report]
  );

  const blocks = useMemo(() => {
    const rawBlocks = splitIntoBlocksWithListsAndHeadings(formattedText);
    return assignHeadingIds(rawBlocks);
  }, [formattedText]);

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
            <button className="lrr-btn" onClick={() => navigate("/dashboard/law-reports")}>
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

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
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

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="lrr-pill ghost"
              onClick={() => navigate(`/dashboard/documents/${report.legalDocumentId}`)}
              disabled={!report.legalDocumentId}
            >
              Document page
            </button>

            {/* Download placeholder (wire later) */}
            <button
              className="lrr-pill ghost"
              disabled
              title="Coming soon"
              onClick={() => {}}
            >
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

        {blocks.length === 0 ? (
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

              // paragraph
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
