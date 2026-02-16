// =======================================================
// FILE: src/pages/dashboard/LawReportWorkspace.jsx
// Purpose: Premium "Case Workspace" reader (Westlaw + Notion + Linear vibe)
// Notes:
// - Keeps ALL existing endpoints & permission logic
// - Top bar: Parties only (NO access chip in top area). Buttons feel premium (CSS hooks)
// - LegalAI:
//    - Basic: ONLY 2 cards: Summary + Key points (only if available)
//    - Extended: Parties + Citation shown as the *title* (not a card) above sections
//      and renders section-cards if headings exist (FACTS/ISSUES/HOLDING/REASONING/TAKEAWAYS)
// - Chat: message cards like screen-2; assistant replies are point-form, NOT bold
// =======================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import "../../styles/lawReportWorkspace.css";

/* =========================================================
   Helpers (NO React hooks)
========================================================= */

function unwrapApi(res) {
  const d = res?.data;
  return d?.data ?? d;
}

function pickFirstNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
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

function getHasFullAccess(access) {
  return access?.hasFullAccess === true || access?.data?.hasFullAccess === true;
}

function getAccessPreviewPolicy(access) {
  const maxChars = pickFirstNumber(
    access?.previewMaxChars,
    access?.PreviewMaxChars,
    access?.data?.previewMaxChars,
    access?.data?.PreviewMaxChars
  );

  const maxParas = pickFirstNumber(
    access?.previewMaxParagraphs,
    access?.PreviewMaxParagraphs,
    access?.data?.previewMaxParagraphs,
    access?.data?.PreviewMaxParagraphs
  );

  return { maxChars: maxChars ?? 5000, maxParas: maxParas ?? 22 };
}

const SUBSCRIBE_ROUTE = "/dashboard/law-reports/subscribe";
const TRIAL_ROUTE = "/dashboard/trials";

function getAccessCtas(access) {
  const primaryUrl =
    access?.ctaUrl ||
    access?.CtaUrl ||
    access?.data?.ctaUrl ||
    access?.data?.CtaUrl ||
    SUBSCRIBE_ROUTE;

  const primaryLabel =
    access?.ctaLabel ||
    access?.CtaLabel ||
    access?.data?.ctaLabel ||
    access?.data?.CtaLabel ||
    "Subscribe to continue";

  const secondaryUrl =
    access?.secondaryCtaUrl ||
    access?.SecondaryCtaUrl ||
    access?.data?.secondaryCtaUrl ||
    access?.data?.SecondaryCtaUrl ||
    SUBSCRIBE_ROUTE;

  const secondaryLabel =
    access?.secondaryCtaLabel ||
    access?.SecondaryCtaLabel ||
    access?.data?.secondaryCtaLabel ||
    access?.data?.SecondaryCtaLabel ||
    "View plans";

  const msg =
    access?.message ||
    access?.Message ||
    access?.data?.message ||
    access?.data?.Message ||
    "You’ve reached the preview limit for this premium report.";

  return { primaryUrl, primaryLabel, secondaryUrl, secondaryLabel, msg };
}

function AccessReasonLabel(access) {
  const raw =
    access?.reason ||
    access?.Reason ||
    access?.data?.reason ||
    access?.data?.Reason ||
    "";

  const t = String(raw || "").toLowerCase();

  if (t.includes("institution") && t.includes("seat"))
    return "Your institution has reached its seat limit.";
  if (t.includes("institution") && t.includes("inactive"))
    return "Your institution subscription is inactive.";
  if (t.includes("expired")) return "Your subscription is expired.";
  if (t.includes("trial")) return "Your trial does not include Law Reports access.";
  return "";
}

function getAccessStatus(access, isPremium, isAdmin, hasFullAccess) {
  if (isAdmin) return { tone: "ok", label: "Admin access", hint: "Full access enabled." };
  if (!isPremium) return { tone: "ok", label: "Free report", hint: "Full transcript available." };

  if (hasFullAccess) return { tone: "ok", label: "Active subscription", hint: "Full transcript unlocked." };

  const reason = AccessReasonLabel(access);
  const msg =
    access?.message ||
    access?.Message ||
    access?.data?.message ||
    access?.data?.Message ||
    "";

  const t = `${reason} ${msg}`.toLowerCase();
  if (t.includes("trial"))
    return { tone: "warn", label: "Trial doesn’t include Law Reports", hint: reason || msg || "" };
  if (t.includes("expired")) return { tone: "warn", label: "Subscription expired", hint: reason || msg || "" };
  if (t.includes("inactive")) return { tone: "warn", label: "Subscription inactive", hint: reason || msg || "" };
  if (t.includes("seat")) return { tone: "warn", label: "Seat limit reached", hint: reason || msg || "" };

  return {
    tone: "warn",
    label: "Locked (preview only)",
    hint: reason || msg || "Subscribe to unlock full transcript.",
  };
}

function getIsAiAllowed(isPremium, access, isAdmin) {
  if (isAdmin) return true;
  if (!isPremium) return true;
  return getHasFullAccess(access);
}

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

  return x
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isLikelyHeadingParagraph(p) {
  const s = String(p || "").trim();
  if (s.length <= 44 && /^[A-Z\s]+$/.test(s) && /[A-Z]/.test(s)) return true;
  if (
    s.length <= 44 &&
    /^(Judgment|Introduction|Background|Facts|Issues?|Held|Analysis|Determination|Orders?|Conclusion)\b/.test(s)
  )
    return true;
  return false;
}

function isProbablyHtml(s) {
  const x = String(s || "").trim();
  if (!x) return false;
  return /<\/?(p|br|div|span|h1|h2|h3|h4|ul|ol|li|table|thead|tbody|tr|td|th|blockquote)\b/i.test(x);
}

function htmlToText(html) {
  const s = String(html || "");
  if (!s.trim()) return "";
  try {
    const doc = new DOMParser().parseFromString(s, "text/html");
    return (doc?.body?.textContent || "").replace(/\s+/g, " ").trim();
  } catch {
    return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
}

function decodeHtmlEntities(text) {
  const s = String(text || "");
  if (!s) return "";
  try {
    const t = document.createElement("textarea");
    t.innerHTML = s;
    return t.value;
  } catch {
    return s;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function safeTrim(s) {
  return String(s || "").trim();
}

function toChatHistory(messages, max = 10) {
  const tail = messages.slice(-max);
  return tail
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .map((m) => ({ role: m.role, content: String(m.content || "") }));
}

/* ---------------- PDF download helpers ---------------- */

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function pickPdfMeta(report) {
  const url =
    report?.pdfUrl ||
    report?.PdfUrl ||
    report?.downloadUrl ||
    report?.DownloadUrl ||
    report?.fileUrl ||
    report?.FileUrl ||
    report?.pdf_file_url ||
    "";

  const sizeBytes =
    report?.pdfSizeBytes ||
    report?.PdfSizeBytes ||
    report?.fileSizeBytes ||
    report?.FileSizeBytes ||
    report?.pdfSize ||
    report?.PdfSize ||
    report?.fileSize ||
    report?.FileSize ||
    null;

  const filename =
    report?.pdfFileName ||
    report?.PdfFileName ||
    report?.fileName ||
    report?.FileName ||
    "";

  return {
    url: String(url || "").trim(),
    sizeBytes: sizeBytes == null ? null : Number(sizeBytes),
    filename: String(filename || "").trim(),
  };
}

function guessPdfFilename({ report, reportId, title }) {
  const base = pickPdfMeta(report).filename || `LawAfrica_LawReport_${reportId || ""}`.trim();

  const cleanTitle = String(title || "")
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);

  const name = cleanTitle ? `${base}_${cleanTitle}` : base;
  return `${name}.pdf`.replace(/\.pdf\.pdf$/i, ".pdf");
}

function saveBlobToDisk(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "document.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

function getFilenameFromContentDisposition(cd) {
  const raw = String(cd || "");
  if (!raw) return "";

  const m5987 = raw.match(/filename\*\s*=\s*([^']*)''([^;]+)/i);
  if (m5987?.[2]) {
    try {
      return decodeURIComponent(m5987[2].trim().replace(/^"|"$/g, ""));
    } catch {
      return m5987[2].trim().replace(/^"|"$/g, "");
    }
  }

  const m = raw.match(/filename\s*=\s*("?)([^";]+)\1/i);
  if (m?.[2]) return m[2].trim();

  return "";
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 10);
}

function buildDefaultCopyText({ report, title, caseNo }) {
  const citation = report?.citation || report?.Citation || "";
  const court = report?.court || report?.Court || "";
  const dateRaw = report?.decisionDate || report?.DecisionDate || "";
  const date = formatDate(dateRaw);

  const lines = [
    title || "",
    caseNo || "",
    citation || "",
    court || "",
    date || "",
  ].filter(Boolean);

  return lines.join("\n");
}


function forceUnorderedBullets(text) {
  const t = String(text || "").replace(/\r\n/g, "\n");
  return t
    .split("\n")
    .map((line) => {
      const m = line.match(/^\s*(\d+)\.\s+(.*)$/);
      if (m) return `- ${m[2].trim()}`;
      return line;
    })
    .join("\n");
}

/**
 * Ensures chat UI feels like “screen 3”:
 * - if it’s plain prose, convert to bullets
 * - never use headings
 */
function prettifyChatReplyForUi(text) {
  const t = String(text || "").trim();
  if (!t) return "";

  // If already bullet/numbered, keep
  if (/^(\d+\.\s+|[-•]\s+)/m.test(t)) return t;

  // Avoid markdown headings in chat (we’ll render bullets)
  const noHashes = t.replace(/^#{1,4}\s+/gm, "");

  if (noHashes.includes("\n\n")) {
    // If multiple paragraphs, bulletize per paragraph
    const paras = noHashes
      .split(/\n\s*\n+/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (paras.length >= 2 && paras.length <= 12) return paras.map((p) => `- ${p}`).join("\n");
    return noHashes;
  }

  // sentence split -> bullets
  const parts = noHashes
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length >= 2) return parts.slice(0, 12).map((p) => `- ${p}`).join("\n");
  return `- ${noHashes}`;
}

/* ---------------- LegalAI: split summary into premium cards ---------------- */

function extractBullets(text) {
  const t = String(text || "").replace(/\r\n/g, "\n");
  const lines = t.split("\n").map((x) => x.trim());
  const bullets = [];
  for (const ln of lines) {
    if (/^[-•]\s+/.test(ln)) bullets.push(ln.replace(/^[-•]\s+/, "").trim());
    else if (/^\d+\.\s+/.test(ln)) bullets.push(ln.replace(/^\d+\.\s+/, "").trim());
  }
  return bullets.filter(Boolean);
}

function splitSummaryForCards(type, summaryText) {
  const raw = String(summaryText || "").trim();
  if (!raw) return { summary: "", keyPoints: [] };

  const bullets = extractBullets(raw);

  if (type === "basic") {
    if (bullets.length) {
      const nonBullet = raw
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter((ln) => ln && !/^([-•]|\d+\.)\s+/.test(ln))
        .join("\n")
        .trim();
      return { summary: nonBullet || raw, keyPoints: bullets.slice(0, 12) };
    }

    const sentences = raw
      .split(/(?<=[.!?])\s+/)
      .map((x) => x.trim())
      .filter(Boolean);

    const kp = sentences.slice(0, Math.min(6, sentences.length));
    return { summary: raw, keyPoints: kp.length ? kp : [] };
  }

  return { summary: raw, keyPoints: bullets.slice(0, 14) };
}

/* ---------------- Extended: section cards (Facts/Issues/Holding/Reasoning/Takeaways) ---------------- */

function normalizeSectionTitle(t) {
  const x = String(t || "").trim().toLowerCase();

  if (x === "facts") return "Facts";
  if (x === "issues" || x === "issue") return "Issues";
  if (x.includes("holding") || x.includes("decision") || x.includes("disposition")) return "Holding / Decision";
  if (x.includes("reason")) return "Reasoning";
  if (x.includes("takeaway") || x.includes("key")) return "Key takeaways";
  if (x.includes("orders")) return "Orders";
  return String(t || "").trim() || "Summary";
}

function parseExtendedSections(summaryText) {
  const raw = String(summaryText || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  // Accept headings with colon or standalone headings (all-caps etc.)
  const headings = [
    { key: "facts", re: /(^|\n)\s*(FACTS?)\s*:\s*/i },
    { key: "issues", re: /(^|\n)\s*(ISSUES?|QUESTION\(S\)?)\s*:\s*/i },
    { key: "holding", re: /(^|\n)\s*(HOLDING|DECISION|HOLDING\/DECISION|DISPOSITION)\s*:\s*/i },
    { key: "reasoning", re: /(^|\n)\s*(REASONING|ANALYSIS|RATIONALE)\s*:\s*/i },
    { key: "takeaways", re: /(^|\n)\s*(KEY\s+TAKEAWAYS?|TAKEAWAYS?)\s*:\s*/i },
    { key: "orders", re: /(^|\n)\s*(ORDERS?)\s*:\s*/i },
  ];

  // Find all heading indices
  const hits = [];
  for (const h of headings) {
    const re = new RegExp(h.re.source, h.re.flags.includes("g") ? h.re.flags : `${h.re.flags}g`);
    let m;
    while ((m = re.exec(raw)) !== null) {
      hits.push({
        key: h.key,
        label: normalizeSectionTitle(m[2] || h.key),
        index: m.index + (m[1] ? m[1].length : 0),
        matchLen: (m[0] || "").length,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  // No headings => single section
  if (!hits.length) return [{ label: "Extended summary", body: raw }];

  // Sort, de-dupe by index
  hits.sort((a, b) => a.index - b.index);
  const deduped = [];
  for (const h of hits) {
    if (!deduped.length || deduped[deduped.length - 1].index !== h.index) deduped.push(h);
  }

  const sections = [];
  for (let i = 0; i < deduped.length; i++) {
    const cur = deduped[i];
    const next = deduped[i + 1];

    const bodyStart = cur.index + cur.matchLen;
    const bodyEnd = next ? next.index : raw.length;

    const body = raw.slice(bodyStart, bodyEnd).trim();
    if (body) sections.push({ label: cur.label, body });
  }

  // If something before first heading exists, prepend as “Summary”
  const first = deduped[0];
  const pre = raw.slice(0, first.index).trim();
  if (pre) sections.unshift({ label: "Summary", body: pre });

  // If nothing extracted (edge case), fallback
  if (!sections.length) return [{ label: "Extended summary", body: raw }];

  return sections;
}

/* ---------------- RichText renderer ---------------- */

function RichText({ text }) {
  const t = String(text || "");
  const lines = t.replace(/\r\n/g, "\n").split("\n");

  const blocks = [];
  let list = null;

  function flushList() {
    if (list && list.items.length) {
      blocks.push({ type: "list", ordered: list.ordered, items: list.items });
    }
    list = null;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushList();
      blocks.push({ type: "spacer" });
      continue;
    }

    // Keep headings support for summaries (not chat), but our chat-prettifier strips headings anyway.
    const h2 = line.startsWith("## ");
    const h3 = line.startsWith("### ");
    const h4 = line.startsWith("#### ");
    if (h2 || h3 || h4) {
      flushList();
      blocks.push({
        type: "h",
        level: h2 ? 2 : h3 ? 3 : 4,
        text: line.replace(/^####\s+|^###\s+|^##\s+/, "").trim(),
      });
      continue;
    }

    const bullet = /^[-•]\s+/.test(line);
    const ordered = /^\d+\.\s+/.test(line);

    if (bullet || ordered) {
      const itemText = line.replace(/^[-•]\s+/, "").replace(/^\d+\.\s+/, "").trim();
      if (!list) list = { ordered, items: [] };
      if (list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(itemText);
      continue;
    }

    flushList();
    blocks.push({ type: "p", text: line });
  }

  flushList();

  return (
    <div className="lrwAiFmt">
      {blocks.map((b, idx) => {
        if (b.type === "spacer") return <div key={idx} className="lrwAiSpacer" />;
        if (b.type === "h") {
          const Tag = b.level === 2 ? "h3" : b.level === 3 ? "h4" : "h5";
          return (
            <Tag key={idx} className={`lrwAiH lrwAiH-${b.level}`}>
              {b.text}
            </Tag>
          );
        }
        if (b.type === "list") {
          const ListTag = "ul";
          return (
            <ListTag key={idx} className="lrwAiList">
              {b.items.map((it, i2) => (
                <li key={i2}>{it}</li>
              ))}
            </ListTag>
          );
        }
        return (
          <p key={idx} className="lrwAiP">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

function AccessChip({ access, isPremium, isAdmin, hasFullAccess }) {
  const s = getAccessStatus(access, isPremium, isAdmin, hasFullAccess);
  return (
    <span className={`lrwChip ${s.tone}`} title={s.hint || s.label}>
      <span className="dot" aria-hidden="true" />
      <span className="txt">{s.label}</span>
    </span>
  );
}

function SubscribeInline({ access, onGo, onRefresh, isPublic, isInst }) {
  const ctas = getAccessCtas(access);
  const reason = AccessReasonLabel(access);

  const accessCodeUrl =
    access?.accessCodeUrl ||
    access?.AccessCodeUrl ||
    access?.data?.accessCodeUrl ||
    access?.data?.AccessCodeUrl ||
    "";

  const contactUrl =
    access?.contactUrl ||
    access?.ContactUrl ||
    access?.data?.contactUrl ||
    access?.data?.ContactUrl ||
    "";

  return (
    <div className="lrwGate" role="note" aria-label="Subscription required">
      <div className="lrwGateTop">
        <div className="lrwGateIcon" aria-hidden="true">
          🔒
        </div>
        <div className="lrwGateTitle">Continue reading requires subscription</div>
      </div>

      <div className="lrwGateMsg">
        You’re viewing a limited preview of this premium law report.
        {reason ? <div className="lrwGateReason">{reason}</div> : null}
      </div>

      <div className="lrwGateActions">
        {isPublic ? (
          <button type="button" className="lrwBtn ghost" onClick={() => onGo(TRIAL_ROUTE)}>
            Start trial
          </button>
        ) : null}

        {isInst && accessCodeUrl ? (
          <button type="button" className="lrwBtn ghost" onClick={() => onGo(accessCodeUrl)}>
            Enter access code
          </button>
        ) : null}

        <button type="button" className="lrwBtn" onClick={() => onGo(ctas.secondaryUrl || SUBSCRIBE_ROUTE)}>
          {ctas.secondaryLabel}
        </button>

        <button type="button" className="lrwBtn primary" onClick={() => onGo(ctas.primaryUrl || SUBSCRIBE_ROUTE)}>
          {ctas.primaryLabel}
        </button>

        <button type="button" className="lrwBtn ghost" onClick={onRefresh}>
          Refresh access
        </button>

        {isInst && contactUrl ? (
          <button type="button" className="lrwBtn ghost" onClick={() => onGo(contactUrl)}>
            Contact support/admin
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CaseContent({ text, showGate, gateAtIndex, renderGate }) {
  const paras = useMemo(() => splitIntoParagraphs(text), [text]);
  if (!paras.length) return null;

  return (
    <div className="lrwDoc">
      {paras.map((p, idx) => {
        const isHeading = isLikelyHeadingParagraph(p);
        return (
          <div key={idx} className={isHeading ? "lrwBlock lrwBlockH" : "lrwBlock lrwBlockP"}>
            {isHeading ? <h3 className="lrwH">{p}</h3> : <p className="lrwP">{p}</p>}
            {showGate && gateAtIndex === idx + 1 ? <div className="lrwGateSlot">{renderGate()}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================
   Page
========================================================= */

const SUGGESTED_QUESTIONS = [
  "What are the key issues in this case?",
  "Summarize the holding/decision in 3 bullet points.",
  "What is the court’s reasoning and ratio decidendi?",
  "List the orders made by the court.",
  "What authorities/cases are cited, and why?",
  "What arguments did each side make?",
  "What are the practical implications of this decision?",
];

export default function LawReportWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();

  const reportId = useMemo(() => {
    const n = Number(id);
    return Number.isFinite(n) ? n : NaN;
  }, [id]);

  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();
  const isAdmin = isGlobalAdminUser();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [hasContent, setHasContent] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  // Reader settings (minimal)
  const [fontScale, setFontScale] = useState(1);
  const [readingTheme, setReadingTheme] = useState("paper");
  const [serif, setSerif] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  // PDF
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState("");

  // LegalAI drawer
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTab, setAiTab] = useState("summary");
  const [summaryType, setSummaryType] = useState("basic");
  const [summaryText, setSummaryText] = useState("");
  const [summaryMeta, setSummaryMeta] = useState(null);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [aiLastAction, setAiLastAction] = useState(null);

  const [messages, setMessages] = useState(() => [
    {
      id: "sys_welcome",
      role: "assistant",
      // ✅ No headings (so it won’t look bold); point-form
      content:
        "- Ask anything about this case: issues, holding, ratio, authorities, orders, practical next steps.\n- Tip: ask for “5 bullets” or “extract issues” for clean output.\n- Disclaimer: AI may be inaccurate. Verify against the transcript.",
      createdAt: nowIso(),
      kind: "info",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef(null);
  const chatBoxRef = useRef(null);
  const aiAutoLoadedRef = useRef(false);

  const summaryCards = useMemo(
    () => splitSummaryForCards(summaryType, summaryText),
    [summaryType, summaryText]
  );

  const extendedSections = useMemo(() => {
    if (summaryType !== "extended") return [];
    return parseExtendedSections(summaryText);
  }, [summaryType, summaryText]);

  const isPremium = useMemo(() => {
    if (!report) return false;

    const v = report?.isPremium ?? report?.IsPremium;
    if (v === true) return true;

    const lvl = String(report?.accessLevel || report?.AccessLevel || "").toLowerCase();
    if (lvl === "previewonly") return true;

    const req = String(report?.requiredAction || report?.RequiredAction || "").toLowerCase();
    if (req === "subscribe" || req === "buy") return true;

    const blocked = report?.isBlocked ?? report?.IsBlocked;
    if (blocked === true) return true;

    return false;
  }, [report]);

  const rawContent = useMemo(() => String(report?.contentText || ""), [report?.contentText]);
  const textHasContent = useMemo(() => !!rawContent.trim(), [rawContent]);

  const hasFullAccess = useMemo(() => (isAdmin ? true : getHasFullAccess(access)), [access, isAdmin]);

  const aiAllowed = useMemo(() => getIsAiAllowed(isPremium, access, isAdmin), [isPremium, access, isAdmin]);

  const canDownloadPdf = useMemo(() => {
    if (isAdmin) return true;
    if (!isPremium) return true;
    return !!hasFullAccess;
  }, [isAdmin, isPremium, hasFullAccess]);

  const pdfMeta = useMemo(() => pickPdfMeta(report), [report]);

  const pdfBtnLabel = useMemo(() => {
    const sizeTxt = formatBytes(pdfMeta?.sizeBytes);
    return sizeTxt ? `Download PDF (${sizeTxt})` : "Download PDF";
  }, [pdfMeta]);

  const fsClass = useMemo(() => {
    const n = Math.round(fontScale * 100);
    const clamped = Math.max(90, Math.min(120, n));
    return `lrwFs-${clamped}`;
  }, [fontScale]);

  const fontClass = useMemo(() => (serif ? "lrwFontSerif" : "lrwFontSans"), [serif]);

  const shouldGateTranscript = useMemo(() => {
    if (!isPremium) return false;
    return !hasFullAccess;
  }, [isPremium, hasFullAccess]);

  const previewPolicy = useMemo(() => getAccessPreviewPolicy(access), [access]);

  const gateSourceText = useMemo(() => {
    if (!rawContent) return "";
    const base = isProbablyHtml(rawContent) ? htmlToText(rawContent) : rawContent;
    return decodeHtmlEntities(base);
  }, [rawContent]);

  const preview = useMemo(() => {
    if (!isPremium || !textHasContent || !shouldGateTranscript) {
      const renderHtml = isProbablyHtml(rawContent);
      const safeText = renderHtml ? rawContent : decodeHtmlEntities(rawContent);

      return {
        gated: false,
        reachedLimit: false,
        renderAsHtml: renderHtml,
        html: renderHtml ? rawContent : "",
        text: renderHtml ? "" : safeText,
      };
    }

    const paras = splitIntoParagraphs(gateSourceText);
    const maxParas = previewPolicy.maxParas;
    const maxChars = previewPolicy.maxChars;

    let reached = false;
    let previewText = "";

    if (paras.length > 0) {
      const slice = paras.slice(0, Math.max(1, maxParas));
      previewText = slice.join("\n\n");
      if (paras.length > maxParas) reached = true;
    } else {
      previewText = normalizeText(gateSourceText);
    }

    if (previewText.length > maxChars) {
      previewText = previewText.slice(0, maxChars).trimEnd();
      reached = true;
    }

    return {
      gated: true,
      reachedLimit: reached,
      renderAsHtml: false,
      html: "",
      text: previewText,
    };
  }, [isPremium, shouldGateTranscript, textHasContent, rawContent, gateSourceText, previewPolicy]);

  const gateAtIndex = useMemo(() => {
    if (!preview.gated || !preview.reachedLimit) return -1;
    const paras = splitIntoParagraphs(preview.text);
    return Math.min(paras.length, Math.max(3, Math.floor(paras.length * 0.65)));
  }, [preview.gated, preview.reachedLimit, preview.text]);

  const canRenderReader = useMemo(() => {
    if (!report) return false;
    if (availabilityLoading) return true;
    if (!hasContent && !textHasContent) return false;
    return true;
  }, [report, availabilityLoading, hasContent, textHasContent]);

  // Derived display bits
  const parties = useMemo(
    () => report?.parties || report?.Parties || report?.title || report?.Title || "Law Report",
    [report]
  );
  const citation = useMemo(() => report?.citation || report?.Citation || "", [report]);

  const titleForCopy = useMemo(() => report?.parties || report?.title || "Law Report", [report]);
  const caseNo = useMemo(
    () => report?.caseNumber || report?.caseNo || report?.case_no || report?.CaseNumber || "",
    [report]
  );
  const courtName = useMemo(
    () =>
      report?.court ||
      report?.Court ||
      report?.courtTypeLabel ||
      report?.CourtTypeLabel ||
      report?.courtName ||
      report?.CourtName ||
      "",
    [report]
  );

  function goUrl(url) {
    if (!url) return;
    const u = String(url);
    if (u.startsWith("http")) window.open(u, "_blank", "noreferrer");
    else navigate(u);
  }

  function copyText(text) {
    const t = String(text || "");
    if (!t) return;
    navigator.clipboard?.writeText?.(t);
  }

  // Close settings on outside click
  useEffect(() => {
    if (!settingsOpen) return;

    function onKeyDown(e) {
      if (e.key === "Escape") setSettingsOpen(false);
    }

    function onPointerDown(e) {
      const el = settingsRef.current;
      if (!el) return;
      if (!el.contains(e.target)) setSettingsOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [settingsOpen]);

  // Close AI drawer with ESC
  useEffect(() => {
    if (!aiOpen) return;
    function onKey(e) {
      if (e.key === "Escape") setAiOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aiOpen]);

  // Load report
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await api.get(`/law-reports/${reportId}`);
        const payload = unwrapApi(res);

        if (cancelled) return;
        setReport(payload ?? null);
      } catch (e) {
        if (!cancelled) setError(getApiErrorMessage(e, "We couldn’t load this report right now. Please try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setReport(null);
    setHasContent(true);
    setAccess(null);
    setAvailabilityLoading(false);
    setAccessLoading(false);

    setPdfErr("");
    setPdfBusy(false);

    setAiErr("");
    setAiLastAction(null);
    setAiTab("summary");
    setSummaryType("basic");
    setSummaryText("");
    setSummaryMeta(null);
    setMessages([
      {
        id: "sys_welcome",
        role: "assistant",
        content:
          "- Ask anything about this case: issues, holding, ratio, authorities, orders, practical next steps.\n- Tip: ask for “5 bullets” or “extract issues” for clean output.\n- Disclaimer: AI may be inaccurate. Verify against the transcript.",
        createdAt: nowIso(),
        kind: "info",
      },
    ]);
    setChatInput("");
    aiAutoLoadedRef.current = false;

    if (Number.isFinite(reportId) && reportId > 0) load();
    else {
      setError("Invalid report id.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  // Availability + access check
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

      const localHasText = !!String(report?.contentText || "").trim();
      if (localHasText) {
        if (!cancelled) {
          setHasContent(true);
          setAvailabilityLoading(false);
        }
      } else {
        try {
          setAvailabilityLoading(true);
          const r = await api.get(`/legal-documents/${report.legalDocumentId}/availability`);
          const payload = unwrapApi(r);
          const ok = !!(payload?.hasContent ?? payload?.data?.hasContent ?? payload?.available ?? payload?.has_file);
          if (!cancelled) setHasContent(!!ok);
        } catch {
          if (!cancelled) setHasContent(true);
        } finally {
          if (!cancelled) setAvailabilityLoading(false);
        }
      }

      if (isPremium && (isInst || isPublic)) {
        try {
          setAccessLoading(true);
          const r = await api.get(`/legal-documents/${report.legalDocumentId}/access`);
          const payload = unwrapApi(r);
          if (!cancelled) setAccess(payload ?? null);
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
  }, [report, isInst, isPublic, isAdmin, isPremium]);

  async function refreshAccessNow() {
    if (!report?.legalDocumentId) return;

    if (isAdmin) {
      setAccess({ hasFullAccess: true });
      return;
    }

    if (!isPremium) return;

    try {
      setAccessLoading(true);
      const r = await api.get(`/legal-documents/${report.legalDocumentId}/access`, { __skipThrottle: true });
      const payload = unwrapApi(r);
      setAccess(payload ?? null);
    } catch (e) {
      console.warn("[LawReportWorkspace] refresh access failed", e);
    } finally {
      setAccessLoading(false);
    }
  }

  async function downloadPdfNow() {
    if (!reportId) return;
    if (!canDownloadPdf) return;

    setPdfErr("");

    const fallbackName = guessPdfFilename({
      report,
      reportId,
      title: report?.parties || report?.title || "",
    });

    try {
      setPdfBusy(true);

      // ✅ EXACT endpoint used by your existing AdminLLRServices flow
      const url = `/law-reports/${reportId}/attachment/download`;
      const res = await api.get(url, { responseType: "blob" });

      const blob = res?.data;
      if (!blob) throw new Error("No file returned.");

      const cd = res?.headers?.["content-disposition"] || res?.headers?.["Content-Disposition"] || "";
      const serverName = getFilenameFromContentDisposition(cd);
      const filename = serverName || fallbackName;

      saveBlobToDisk(blob, filename);
    } catch (e) {
      setPdfErr(getApiErrorMessage(e, "Failed to download PDF."));
    } finally {
      setPdfBusy(false);
    }
  }

  /* =========================
     LegalAI (drawer)
  ========================= */

  const aiGetCachedSummary = useCallback(
    async (type) => {
      if (!reportId) return;
      setAiErr("");
      setAiLastAction({ kind: "getSummary", payload: { type } });
      setAiBusy(true);

      try {
        const res = await api.get(`/ai/law-reports/${reportId}/summary`, { params: { type } });
        const payload = unwrapApi(res);

        const summary = payload?.summary ?? payload?.data?.summary ?? "";
        setSummaryText(String(summary || ""));
        setSummaryMeta({
          type: payload?.type || type,
          createdAt: payload?.createdAt || null,
          updatedAt: payload?.updatedAt || null,
          cached: true,
        });
      } catch (e) {
        setSummaryText("");
        setSummaryMeta({ type, cached: true });
        setAiErr(getApiErrorMessage(e, "No cached summary found yet."));
      } finally {
        setAiBusy(false);
      }
    },
    [reportId]
  );

  async function aiGenerateSummary({ type, forceRegenerate }) {
    setAiErr("");
    setAiLastAction({ kind: "genSummary", payload: { type, forceRegenerate } });
    setAiBusy(true);

    try {
      const res = await api.post(`/ai/law-reports/${reportId}/summary`, {
        type,
        forceRegenerate: !!forceRegenerate,
      });
      const payload = unwrapApi(res);

      const summary = payload?.summary ?? payload?.data?.summary ?? "";
      setSummaryText(String(summary || ""));
      setSummaryMeta({
        type: payload?.type || type,
        cached: !!payload?.cached,
        createdAt: payload?.createdAt || null,
        updatedAt: payload?.updatedAt || null,
      });
    } catch (e) {
      setAiErr(getApiErrorMessage(e, "Failed to generate summary."));
    } finally {
      setAiBusy(false);
    }
  }

  async function aiSendChat(message) {
    const msg = safeTrim(message);
    if (!msg) return;

    setAiErr("");
    setAiLastAction({ kind: "chat", payload: { message: msg } });

    const userMsg = {
      id: `u_${Date.now()}`,
      role: "user",
      content: msg,
      createdAt: nowIso(),
      kind: "chat",
    };

    const typingMsg = {
      id: `typing_${Date.now() + 1}`,
      role: "assistant",
      content: "",
      createdAt: nowIso(),
      kind: "typing",
    };

    setMessages((prev) => [...prev, userMsg, typingMsg]);
    setChatInput("");
    setAiBusy(true);

    try {
      const history = toChatHistory(
        [...messages.filter((m) => m?.kind !== "typing" && m?.kind !== "summary"), userMsg],
        10
      );

      const res = await api.post(`/ai/law-reports/${reportId}/chat`, {
        message: msg,
        history,
      });

      const payload = unwrapApi(res);
      const replyRaw = payload?.reply ?? payload?.data?.reply ?? payload?.message ?? payload?.answer ?? "";

      let reply = prettifyChatReplyForUi(String(replyRaw || ""));
      reply = forceUnorderedBullets(reply);

      setMessages((prev) => {
        const cleaned = prev.filter((m) => m?.id !== typingMsg.id);
        return [
          ...cleaned,
          {
            id: `a_${Date.now()}`,
            role: "assistant",
            content: reply || "- I couldn’t generate a response. Please try again.",
            createdAt: nowIso(),
            kind: "chat",
          },
        ];
      });
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m?.id !== typingMsg.id));
      setAiErr(getApiErrorMessage(e, "Chat failed."));
    } finally {
      setAiBusy(false);
    }
  }

  async function aiGenerateRelatedCases() {
    setAiErr("");
    setAiLastAction({ kind: "related", payload: {} });
    setAiBusy(true);

    try {
      const res = await api.post(`/ai/law-reports/${reportId}/related-cases`, null, {
        params: { takeKenya: 2, takeForeign: 2 },
      });

      const payload = unwrapApi(res);

      const items = Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.data?.items)
          ? payload.data.items
          : [];

      const disclaimer =
        payload?.disclaimer ||
        payload?.data?.disclaimer ||
        "AI suggestions may be inaccurate. Always verify citations and holdings.";

      // Keep it bullet-form and avoid markdown bold/headings (UI should stay clean)
      const lines = [];
      lines.push("- Related cases (AI):");
      if (items.length) {
        items.forEach((x, i2) => {
          const t = (x?.title || x?.Title || `Case ${i2 + 1}`).trim();
          const cit = (x?.citation || x?.Citation || "").trim();
          const juris = (x?.jurisdiction || x?.Jurisdiction || "").trim();
          const why = (x?.reason || x?.Reason || x?.note || "").trim();
          const meta = [cit, juris].filter(Boolean).join(" · ");
          lines.push(`- ${t}${meta ? ` (${meta})` : ""}${why ? ` — ${why}` : ""}`);
        });
      } else {
        lines.push("- No related cases returned.");
      }
      lines.push("");
      lines.push(`- Disclaimer: ${disclaimer}`);

      setMessages((prev) => [
        ...prev,
        {
          id: `rel_${Date.now()}`,
          role: "assistant",
          content: lines.join("\n"),
          createdAt: nowIso(),
          kind: "related",
        },
      ]);
    } catch (e) {
      setAiErr(getApiErrorMessage(e, "Failed to generate related cases."));
    } finally {
      setAiBusy(false);
    }
  }

  function aiRetry() {
    const a = aiLastAction;
    if (!a) return;
    if (a.kind === "getSummary") return aiGetCachedSummary(a.payload.type);
    if (a.kind === "genSummary") return aiGenerateSummary(a.payload);
    if (a.kind === "chat") return aiSendChat(a.payload.message);
    if (a.kind === "related") return aiGenerateRelatedCases();
  }

  // auto-load cached basic summary on first open
  useEffect(() => {
    if (!aiOpen) return;
    if (!aiAllowed) return;
    if (!reportId) return;
    if (aiAutoLoadedRef.current) return;

    aiAutoLoadedRef.current = true;
    setAiTab("summary");
    setSummaryType("basic");
    aiGetCachedSummary("basic");
  }, [aiOpen, aiAllowed, reportId, aiGetCachedSummary]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages.length, aiOpen]);

  /* =========================
     Render guards
  ========================= */

  if (loading) {
    return (
      <div className="lrwWrap" data-theme={readingTheme}>
        <div className="lrwLoading">Loading case workspace…</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="lrwWrap" data-theme={readingTheme}>
        <div className="lrwEmptyState">
          <div className="t">Report unavailable</div>
          <div className="s">{error || "Not found."}</div>
          <div className="a">
            <button className="lrwBtn" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back to Law Reports
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!canRenderReader) {
    return (
      <div className="lrwWrap" data-theme={readingTheme}>
        <div className="lrwEmptyState">
          <div className="t">Not available</div>
          <div className="s">{availabilityLoading ? "Checking availability…" : "This report isn’t available yet."}</div>
          <div className="a">
            <button className="lrwBtn" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* =========================
     UI
  ========================= */

  const showGate = !!(preview.gated && preview.reachedLimit);

  return (
    <div className="lrwWrap" data-theme={readingTheme}>
      {/* Top bar (slim): Parties only (NO access chip here). Premium button hooks added. */}
      <header className="lrwTop">
        <div className="lrwTopInner lrwTopInnerCompact">
          <button
            type="button"
            className="lrwIconBtn premium"
            onClick={() => navigate("/dashboard/law-reports")}
            title="Back"
          >
            <span className="ico" aria-hidden="true">
              ←
            </span>
            <span className="txt">Back</span>
          </button>

          <div className="lrwTitleBlock">
            <div className="lrwTitle" title={parties}>
              {parties}
            </div>

            {/* ✅ Citation can remain as subtle pill (not a card). No access chip. */}
            <div className="lrwMetaRow">
              {citation ? <span className="lrwPill soft">Citation: {citation}</span> : null}
            </div>
          </div>

          <div className="lrwTopActions">
            {/* Settings */}
            <div className="lrwSettings" ref={settingsRef}>
              <button
                type="button"
                className={`lrwIconBtn premium ${settingsOpen ? "isOn" : ""}`}
                onClick={() => setSettingsOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={settingsOpen}
                title="Reader settings"
              >
                <span className="ico" aria-hidden="true">
                  ⚙️
                </span>
                <span className="txt">Settings</span>
              </button>

              {settingsOpen ? (
                <div className="lrwSettingsMenu" role="menu" aria-label="Reader settings">
                  <div className="g">
                    <div className="k">Text</div>
                    <div className="r">
                      <button
                        type="button"
                        className="lrwMiniBtn"
                        onClick={() => setFontScale((v) => Math.max(0.9, Number((v - 0.05).toFixed(2))))}
                      >
                        A−
                      </button>
                      <button
                        type="button"
                        className="lrwMiniBtn"
                        onClick={() => setFontScale((v) => Math.min(1.2, Number((v + 0.05).toFixed(2))))}
                      >
                        A+
                      </button>
                      <button
                        type="button"
                        className={`lrwMiniBtn ${serif ? "isOn" : ""}`}
                        onClick={() => setSerif((v) => !v)}
                      >
                        Serif
                      </button>
                    </div>
                  </div>

                  <div className="g">
                    <div className="k">Theme</div>
                    <div className="r">
                      <button
                        type="button"
                        className={`lrwMiniBtn ${readingTheme === "paper" ? "isOn" : ""}`}
                        onClick={() => setReadingTheme("paper")}
                      >
                        Paper
                      </button>
                      <button
                        type="button"
                        className={`lrwMiniBtn ${readingTheme === "sepia" ? "isOn" : ""}`}
                        onClick={() => setReadingTheme("sepia")}
                      >
                        Sepia
                      </button>
                      <button
                        type="button"
                        className={`lrwMiniBtn ${readingTheme === "dark" ? "isOn" : ""}`}
                        onClick={() => setReadingTheme("dark")}
                      >
                        Dark
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Copy */}
            <button
              type="button"
              className="lrwIconBtn premium"
              onClick={() => {
                const payload = buildDefaultCopyText({ report, title: titleForCopy, caseNo });
                copyText(payload);
              }}
              title="Copy citation details"
            >
              <span className="ico" aria-hidden="true">
                ⧉
              </span>
              <span className="txt">Copy</span>
            </button>

            {/* Report view */}
            <button
              type="button"
              className="lrwIconBtn premium"
              onClick={() => navigate(`/dashboard/law-reports/${reportId}/report`)}
              title="Report view"
            >
              <span className="ico" aria-hidden="true">
                🧾
              </span>
              <span className="txt">Report</span>
            </button>

            {/* PDF */}
            <button
              type="button"
              className={`lrwBtn premium ${pdfBusy ? "isBusy" : ""}`}
              onClick={downloadPdfNow}
              disabled={!canDownloadPdf || pdfBusy}
              title={!canDownloadPdf ? "Subscribe to download PDF" : "Download PDF"}
            >
              {pdfBusy ? "Preparing…" : pdfBtnLabel}
            </button>

            {/* LegalAI */}
            <button
              type="button"
              className={`lrwBtn primary premium ${!aiAllowed ? "isDisabled" : ""}`}
              onClick={() => {
                if (!aiAllowed) return;
                setAiOpen(true);
              }}
              disabled={!aiAllowed}
              title={aiAllowed ? "Open LegalAI" : "LegalAI is available to subscribers only"}
            >
              ✨ LegalAI
            </button>
          </div>
        </div>

        {pdfErr ? <div className="lrwTopErr">{pdfErr}</div> : null}
      </header>

      {/* Body */}
      <div className="lrwBody">
        {/* Left rail */}
        <aside className="lrwRail" aria-label="Case details">
          <div className="lrwCard">
            <div className="h">Case details</div>

            <div className="kv">
              {caseNo ? (
                <div className="row">
                  <div className="k">Case Number</div>
                  <div className="v">{caseNo}</div>
                </div>
              ) : null}

              {parties ? (
                <div className="row">
                  <div className="k">Parties</div>
                  <div className="v">{parties}</div>
                </div>
              ) : null}

              {courtName ? (
                <div className="row">
                  <div className="k">Court</div>
                  <div className="v">{courtName}</div>
                </div>
              ) : null}

              {citation ? (
                <div className="row">
                  <div className="k">Citation</div>
                  <div className="v">{citation}</div>
                </div>
              ) : null}
            </div>

            <div className="railActions">
              {isPremium ? (
                <div className="railAccess">
                  {accessLoading ? (
                    <span className="muted">checking access…</span>
                  ) : (
                    <AccessChip access={access} isPremium={isPremium} isAdmin={isAdmin} hasFullAccess={hasFullAccess} />
                  )}
                </div>
              ) : null}

              <button
                type="button"
                className="lrwBtn ghost"
                onClick={() => {
                  const payload = buildDefaultCopyText({ report, title: titleForCopy, caseNo });
                  copyText(payload);
                }}
              >
                Copy details
              </button>

              <button
                type="button"
                className="lrwBtn ghost"
                disabled={!canDownloadPdf || pdfBusy}
                onClick={downloadPdfNow}
              >
                {pdfBusy ? "Preparing…" : "Download PDF"}
              </button>

              {isPremium && !hasFullAccess ? (
                <button type="button" className="lrwBtn primary" onClick={() => goUrl(SUBSCRIBE_ROUTE)}>
                  Subscribe
                </button>
              ) : null}
            </div>
          </div>
        </aside>

        {/* Main document */}
        <main className="lrwMain" aria-label="Transcript">
          <article
            className={[
              "lrwPaper",
              `lrwTheme-${readingTheme}`,
              "lrwProse",
              fsClass,
              fontClass,
              showGate ? "isGated" : "",
            ].join(" ")}
          >
            {!textHasContent ? (
              <div className="lrwDocEmpty">This report has no content yet.</div>
            ) : preview.renderAsHtml ? (
              <div className="lrwHtml" dangerouslySetInnerHTML={{ __html: preview.html }} />
            ) : (
              <CaseContent
                text={preview.text}
                showGate={showGate}
                gateAtIndex={gateAtIndex}
                renderGate={() =>
                  isPremium && !hasFullAccess ? (
                    <SubscribeInline
                      access={access}
                      onGo={goUrl}
                      onRefresh={refreshAccessNow}
                      isPublic={isPublic}
                      isInst={isInst}
                    />
                  ) : null
                }
              />
            )}
          </article>
        </main>
      </div>

      {/* LegalAI Drawer */}
      <div className={`lrwDrawer ${aiOpen ? "open" : ""}`} role="dialog" aria-label="LegalAI panel" aria-modal="true">
        <div className="lrwDrawerOverlay" onClick={() => setAiOpen(false)} aria-hidden="true" />

        <div className="lrwDrawerPanel">
          <div className="lrwDrawerHead">
            <div className="t">
              <div className="ttl">LegalAI</div>
              <div className="sub">Issues • Holding • Ratio • Authorities • Orders • Next steps</div>
            </div>

            <button type="button" className="lrwIconBtn premium" onClick={() => setAiOpen(false)} title="Close">
              ✕
            </button>
          </div>

          {!aiAllowed ? (
            <div className="lrwAiLocked">
              <div className="x">🔒</div>
              <div className="b">
                <div className="h">Upgrade to use LegalAI</div>
                <div className="s">Summaries and AI tools are restricted to active subscribers.</div>
              </div>
              <button type="button" className="lrwBtn primary" onClick={() => goUrl(SUBSCRIBE_ROUTE)}>
                Subscribe
              </button>
            </div>
          ) : (
            <>
              {aiErr ? (
                <div className="lrwAiAlert" role="alert">
                  <div className="h">Couldn’t complete that</div>
                  <div className="s">{aiErr}</div>
                  <div className="a">
                    <button type="button" className="lrwBtn" onClick={aiRetry}>
                      Retry
                    </button>
                    <button type="button" className="lrwBtn ghost" onClick={() => setAiErr("")}>
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="lrwAiTabs" role="tablist" aria-label="LegalAI tabs">
                <button
                  type="button"
                  className={`tab ${aiTab === "summary" ? "on" : ""}`}
                  onClick={() => setAiTab("summary")}
                >
                  Summary
                </button>
                <button
                  type="button"
                  className={`tab ${aiTab === "chat" ? "on" : ""}`}
                  onClick={() => setAiTab("chat")}
                >
                  Chat
                </button>
                <button
                  type="button"
                  className={`tab ${aiTab === "related" ? "on" : ""}`}
                  onClick={() => setAiTab("related")}
                >
                  Related
                </button>
              </div>

              {/* Summary */}
              {aiTab === "summary" ? (
                <div className="lrwAiStack">
                  {/* Controls card */}
                  <div className="lrwAiCard">
                    <div className="lrwAiRow">
                      <div className="seg" role="group" aria-label="Summary type">
                        <button
                          type="button"
                          className={`segBtn ${summaryType === "basic" ? "on" : ""}`}
                          onClick={() => {
                            setSummaryType("basic");
                            aiGetCachedSummary("basic");
                          }}
                        >
                          Basic
                        </button>
                        <button
                          type="button"
                          className={`segBtn ${summaryType === "extended" ? "on" : ""}`}
                          onClick={() => {
                            setSummaryType("extended");
                            aiGetCachedSummary("extended");
                          }}
                        >
                          Extended
                        </button>
                      </div>

                      <div className="rowActions">
                        <button
                          type="button"
                          className="lrwBtn primary premium"
                          disabled={aiBusy}
                          onClick={() => aiGenerateSummary({ type: summaryType, forceRegenerate: false })}
                        >
                          Generate
                        </button>
                        <button
                          type="button"
                          className="lrwBtn ghost premium"
                          disabled={aiBusy}
                          onClick={() => aiGenerateSummary({ type: summaryType, forceRegenerate: true })}
                        >
                          Force
                        </button>
                      </div>
                    </div>

                    {aiBusy ? <div className="lrwAiLoading">Working…</div> : null}

                    {safeTrim(summaryText) ? (
                      <div className="lrwAiAnswer">
                        <div className="meta">
                          <span className="pill">Type: {summaryMeta?.type || summaryType}</span>
                          {summaryMeta?.cached ? <span className="pill soft">cached</span> : null}
                          <button type="button" className="mini" onClick={() => copyText(summaryText)} title="Copy summary">
                            Copy
                          </button>
                        </div>
                      </div>
                    ) : !aiBusy ? (
                      <div className="lrwAiEmpty">
                        <div className="t">No cached summary yet</div>
                        <div className="s">
                          Click <b>Generate</b> to create it once. Next time it loads instantly.
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* BASIC: ONLY 2 cards (Summary + Key points if available) */}
                  {summaryType === "basic" && safeTrim(summaryText) ? (
                    <>
                      <div className="lrwAiCard lrwAiCardAccent">
                        <div className="lrwAiCardHead">
                          <div className="ttl">Summary</div>
                          <div className="sub">AI-generated. Verify against the transcript.</div>
                        </div>
                        <div className="lrwAiCardBody">
                          <RichText text={summaryCards.summary} />
                        </div>
                      </div>

                      {summaryCards.keyPoints?.length ? (
                        <div className="lrwAiCard lrwAiCardSoft">
                          <div className="lrwAiCardHead">
                            <div className="ttl">Key points</div>
                            <div className="sub">Fast scan (AI-extracted)</div>
                          </div>
                          <div className="lrwAiCardBody">
                            <ul className="lrwAiList">
                              {summaryCards.keyPoints.map((kp, i) => (
                                <li key={i}>{kp}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {/* EXTENDED: Parties + Citation as title (NOT a card) + section cards */}
                  {summaryType === "extended" && safeTrim(summaryText) ? (
                    <>
                      <div className="lrwAiSummaryTitle" aria-label="Extended summary title">
                        <div className="p">{parties}</div>
                        {citation ? <div className="c">{citation}</div> : null}
                      </div>

                      {extendedSections.map((sec, idx) => (
                        <div
                          key={`${sec.label}_${idx}`}
                          className={`lrwAiCard ${sec.label.toLowerCase().includes("key") ? "lrwAiCardSoft" : "lrwAiCardAccent"}`}
                        >
                          <div className="lrwAiCardHead">
                            <div className="ttl">{sec.label}</div>
                          </div>
                          <div className="lrwAiCardBody">
                            <RichText text={sec.body} />
                          </div>
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}

              {/* Related */}
              {aiTab === "related" ? (
                <div className="lrwAiCard">
                  <div className="lrwAiRow">
                    <div className="note">AI-suggested related cases (Kenya + Foreign). Always verify citations.</div>
                    <div className="rowActions">
                      <button type="button" className="lrwBtn primary premium" disabled={aiBusy} onClick={aiGenerateRelatedCases}>
                        Generate
                      </button>
                    </div>
                  </div>

                  {aiBusy ? <div className="lrwAiLoading">Working…</div> : null}

                  <div className="lrwAiChat lrwAiChatTight">
                    {messages
                      .filter((m) => m?.kind === "related")
                      .slice(-3)
                      .map((m) => (
                        <div key={m.id} className="lrwMsgCard assistant">
                          <div className="lrwMsgCardTop">
                            <div className="who">LegalAI</div>
                            <button type="button" className="mini" onClick={() => copyText(m.content)}>
                              Copy
                            </button>
                          </div>
                          <div className="lrwMsgCardBody">
                            <RichText text={m.content} />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              {/* Chat */}
              {aiTab === "chat" ? (
                <div className="lrwAiCard">
                  <div className="lrwAiRow">
                    <div className="note">Suggested starters:</div>
                    <div className="lrwSuggestRow" aria-label="Suggested questions">
                      {SUGGESTED_QUESTIONS.slice(0, 4).map((q) => (
                        <button
                          key={q}
                          type="button"
                          className="lrwSuggest"
                          onClick={() => {
                            setChatInput(q);
                            setTimeout(() => chatBoxRef.current?.focus?.(), 0);
                          }}
                          title="Insert into chat"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="lrwAiChat" aria-label="Chat messages">
                    {messages
                      .filter((m) => m?.kind !== "related" && m?.kind !== "summary")
                      .map((m) => {
                        const isUser = m.role === "user";
                        const isTyping = m.kind === "typing";

                        if (isTyping) {
                          return (
                            <div key={m.id} className="lrwMsgCard assistant isTyping">
                              <div className="lrwMsgCardTop">
                                <div className="who">LegalAI</div>
                              </div>
                              <div className="lrwMsgCardBody">
                                <div className="typing" aria-label="Assistant is typing">
                                  <span />
                                  <span />
                                  <span />
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={m.id} className={`lrwMsgCard ${isUser ? "user" : "assistant"}`}>
                            <div className="lrwMsgCardTop">
                              <div className="who">{isUser ? "You" : "LegalAI"}</div>
                              {!isUser ? (
                                <button type="button" className="mini" onClick={() => copyText(m.content)} title="Copy">
                                  Copy
                                </button>
                              ) : null}
                            </div>
                            <div className="lrwMsgCardBody">
                              <RichText text={m.content} />
                            </div>
                          </div>
                        );
                      })}

                    <div ref={chatEndRef} />
                  </div>

                  <div className="lrwAiComposer">
                    <div className="lrwSuggestRow lrwSuggestRowFull">
                      {SUGGESTED_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          type="button"
                          className="lrwSuggest"
                          onClick={() => {
                            setChatInput(q);
                            setTimeout(() => chatBoxRef.current?.focus?.(), 0);
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>

                    <textarea
                      ref={chatBoxRef}
                      className="inp"
                      value={chatInput}
                      placeholder="Ask: key issues, holding, ratio, citations, arguments, implications…"
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                          e.preventDefault();
                          aiSendChat(chatInput);
                        }
                      }}
                    />
                    <div className="composerActions">
                      <div className="hint">Ctrl/⌘ + Enter to send</div>
                      <button
                        type="button"
                        className="lrwBtn primary premium"
                        disabled={aiBusy || !safeTrim(chatInput)}
                        onClick={() => aiSendChat(chatInput)}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="lrwAiFoot">Disclaimer: AI output may be inaccurate. Verify against the transcript and citations.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
