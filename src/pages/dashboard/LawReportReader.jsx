// src/pages/dashboard/LawReportReader.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import "../../styles/lawReportReader.css";

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
  if (s.length <= 40 && /^[A-Z\s]+$/.test(s) && /[A-Z]/.test(s)) return true;
  if (
    s.length <= 40 &&
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

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 10);
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

function bulletsFromText(text) {
  const t = normalizeText(text);
  if (!t) return "";
  const lines = t.split("\n").map((x) => x.trim()).filter(Boolean);
  const alreadyBullets = lines.some((l) => /^[-•]\s+/.test(l));
  if (alreadyBullets)
    return lines
      .map((l) => (l.startsWith("-") || l.startsWith("•") ? l.replace(/^•\s+/, "- ") : `- ${l}`))
      .join("\n");
  if (lines.length === 1) {
    const one = lines[0];
    const parts = one.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    return parts.map((p) => `- ${p}`).join("\n");
  }
  return lines.map((l) => `- ${l}`).join("\n");
}

/** Mild “premium formatting” for chat replies that come as a single blob.
 *  - If the reply already contains markdown lists/headings, leave it.
 *  - If it’s one paragraph with many sentences, turn into a numbered list.
 */
function prettifyChatReplyForUi(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  if (/^#{1,4}\s+/m.test(t)) return t;
  if (/^(\d+\.\s+|[-•]\s+)/m.test(t)) return t;
  if (t.includes("\n\n")) return t;

  const parts = t
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length >= 3 && parts.length <= 10) {
    return parts.map((p, i) => `${i + 1}. ${p}`).join("\n");
  }

  return t;
}

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
    <div className="lrrAiFmt">
      {blocks.map((b, idx) => {
        if (b.type === "spacer") return <div key={idx} className="lrrAiSpacer" />;
        if (b.type === "h") {
          const Tag = b.level === 2 ? "h3" : b.level === 3 ? "h4" : "h5";
          return (
            <Tag key={idx} className={`lrrAiH lrrAiH-${b.level}`}>
              {b.text}
            </Tag>
          );
        }
        if (b.type === "list") {
          const ListTag = b.ordered ? "ol" : "ul";
          return (
            <ListTag key={idx} className={`lrrAiList ${b.ordered ? "ordered" : "bullets"}`}>
              {b.items.map((it, i2) => (
                <li key={i2}>{it}</li>
              ))}
            </ListTag>
          );
        }
        return (
          <p key={idx} className="lrrAiP">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

function AccessStatusChip({ access, isPremium, isAdmin, hasFullAccess }) {
  const s = getAccessStatus(access, isPremium, isAdmin, hasFullAccess);

  return (
    <span className={`lrr2AccessChip ${s.tone}`}>
      <span className="dot" aria-hidden="true" />
      <span className="txt">{s.label}</span>
      {s.hint ? (
        <span className="hint" title={s.hint}>
          i
        </span>
      ) : null}
    </span>
  );
}

function SubscriptionGateCard({
  isPremium,
  access,
  isAdmin,
  isInst,
  isPublic,
  hasFullAccess,
  onGo,
  onRefreshAccess,
}) {
  if (!isPremium || isAdmin || hasFullAccess) return null;

  const ctas = getAccessCtas(access);
  const status = getAccessStatus(access, isPremium, isAdmin, hasFullAccess);
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

  const showTrial = !!isPublic;
  const showAccessCode = !!isInst && !!String(accessCodeUrl || "").trim();
  const showContact = !!isInst && !!String(contactUrl || "").trim();

  return (
    <div className="lrr2LockHero" role="note" aria-label="Subscription required">
      <div className="lrr2LockHeroIcon" aria-hidden="true">
        🔒
      </div>

      <div className="lrr2LockHeroBody">
        <div className="lrr2LockHeroTitle">Full transcript restricted</div>

        <div className="lrr2LockHeroMsg">
          You’re viewing a limited preview of this premium law report.
          {reason ? <div className="lrr2LockHeroReason">{reason}</div> : null}
          <div className="lrr2SubGuideStatus" style={{ marginTop: 10 }}>
            <span className={`lrr2Pill ${status.tone}`}>{status.label}</span>
          </div>
        </div>

        <ul className="lrr2LockHeroBenefits">
          <li>Unlimited full case transcript access</li>
          <li>LegalAI summary and tools</li>
          <li>Related cases and citation tools</li>
        </ul>

        <div className="lrr2SubGuideBody" style={{ padding: 0, marginTop: 10 }}>
          <div className="lrr2SubGuideMsg" style={{ marginBottom: 10 }}>
            You can preview this case, but the <b>full transcript</b> and <b>LegalAI</b> require an active Law Reports
            subscription.
          </div>

          <ul className="lrr2SubGuideSteps" style={{ marginTop: 0 }}>
            {showTrial ? (
              <li>
                <b>Start a trial:</b> Try Law Reports access instantly (if eligible).
              </li>
            ) : null}

            <li>
              <b>Subscribe:</b> Choose a plan and pay. Access unlocks after successful payment.
            </li>

            {showAccessCode ? (
              <li>
                <b>Institution:</b> Use your access code or ask your admin to add a seat.
              </li>
            ) : null}

            <li>
              <b>Already paid?</b> Click <b>Refresh access</b> to re-check your subscription status.
            </li>
          </ul>
        </div>

        <div className="lrr2LockHeroActions">
          {showTrial ? (
            <button type="button" className="lrr2Btn" onClick={() => onGo(TRIAL_ROUTE)}>
              Start trial
            </button>
          ) : null}

          {showAccessCode ? (
            <button type="button" className="lrr2Btn" onClick={() => onGo(accessCodeUrl)}>
              Enter access code
            </button>
          ) : null}

          <button type="button" className="lrr2Btn" onClick={() => onGo(ctas.secondaryUrl || SUBSCRIBE_ROUTE)}>
            {ctas.secondaryLabel}
          </button>

          <button type="button" className="lrr2Btn primary" onClick={() => onGo(ctas.primaryUrl || SUBSCRIBE_ROUTE)}>
            {ctas.primaryLabel}
          </button>

          <button type="button" className="lrr2Btn ghost" onClick={onRefreshAccess}>
            Refresh access
          </button>

          {showContact ? (
            <button type="button" className="lrr2Btn ghost" onClick={() => onGo(contactUrl)}>
              Contact support/admin
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SubscribeGateOverlay({ access, onGo }) {
  const ctas = getAccessCtas(access);

  return (
    <div className="lrr2GateSticky" role="note" aria-label="Subscription required">
      <div className="lrr2GateFade" aria-hidden="true" />
      <div className="lrr2GateCard">
        <div className="lrr2GateLeft">
          <div className="lrr2GateTitle">Subscribe to unlock full access</div>
          <div className="lrr2GateMsg">{ctas.msg}</div>
        </div>

        <div className="lrr2GateActions">
          <button type="button" className="lrr2Btn" onClick={() => onGo(ctas.secondaryUrl || SUBSCRIBE_ROUTE)}>
            {ctas.secondaryLabel}
          </button>

          <button type="button" className="lrr2Btn primary" onClick={() => onGo(ctas.primaryUrl || SUBSCRIBE_ROUTE)}>
            {ctas.primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function InlineSubscribeBreak({ access, onGo, onRefresh }) {
  const ctas = getAccessCtas(access);
  const reason = AccessReasonLabel(access);

  return (
    <div className="lrr2GateMidBreak" role="note" aria-label="Continue reading requires subscription">
      <div className="lrr2GateMidRule" aria-hidden="true" />

      <div className="lrr2GateMidCard">
        <div className="lrr2GateMidTop">
          <div className="lrr2GateMidLock" aria-hidden="true">
            🔒
          </div>

          <div className="lrr2GateMidText">
            <div className="lrr2GateMidTitle">Subscribe to continue reading</div>
            <div className="lrr2GateMidMsg">
              You’ve reached the preview section for this premium law report. Unlock the full transcript and LegalAI
              tools.
            </div>
            {reason ? <div className="lrr2GateMidReason">{reason}</div> : null}

            <ul className="lrr2GateMidBullets">
              <li>Continue from where you left off</li>
              <li>Copy citations and access related cases</li>
              <li>Use LegalAI summary & key points</li>
            </ul>

            <div className="lrr2GateMidActions">
              <button type="button" className="lrr2Btn ghost" onClick={onRefresh}>
                Refresh access
              </button>

              <button type="button" className="lrr2Btn" onClick={() => onGo(ctas.secondaryUrl || SUBSCRIBE_ROUTE)}>
                {ctas.secondaryLabel}
              </button>

              <button type="button" className="lrr2Btn primary" onClick={() => onGo(ctas.primaryUrl || SUBSCRIBE_ROUTE)}>
                {ctas.primaryLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CaseContentWithGateBreak({ text, showBreak, access, onGo, onRefresh }) {
  const paras = useMemo(() => splitIntoParagraphs(text), [text]);

  const breakIndex = showBreak
    ? Math.min(paras.length, Math.max(3, Math.floor(paras.length * 0.65)))
    : -1;

  if (!paras.length) return null;

  return (
    <div className="lrr2CaseFmt">
      {paras.map((p, idx) => {
        const isHeading = isLikelyHeadingParagraph(p);

        return (
          <div key={idx}>
            {isHeading ? <h3 className="lrr2CaseH">{p}</h3> : <p className="lrr2CaseP">{p}</p>}
            {showBreak && breakIndex === idx + 1 ? (
              <InlineSubscribeBreak access={access} onGo={onGo} onRefresh={onRefresh} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AiLockedPanel({ access, onGo }) {
  const ctas = getAccessCtas(access);

  return (
    <div className="lrr2Panel lrr2Panel--tight">
      <div className="lrr2PanelHead">
        <div className="lrr2PanelHeadLeft">
          <div className="lrr2PanelTitle">LegalAI</div>
          <div className="lrr2PanelSub">Available to subscribers only.</div>
        </div>
      </div>

      <div className="lrr2LockInline">
        <div className="lrr2LockInlineIcon">🤖</div>
        <div className="lrr2LockInlineText">
          <div className="lrr2LockInlineTitle">Upgrade to use LegalAI</div>
          <div className="lrr2LockInlineMsg">Summaries and AI tools are restricted to active subscribers.</div>
        </div>

        <div className="lrr2LockInlineActions">
          <button type="button" className="lrr2Btn primary" onClick={() => onGo(ctas.primaryUrl || SUBSCRIBE_ROUTE)}>
            {ctas.primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Page
========================================================= */

export default function LawReportReader() {
  const { id } = useParams();
  const navigate = useNavigate();

  const reportId = useMemo(() => {
    const n = Number(id);
    return Number.isFinite(n) ? n : NaN;
  }, [id]);

  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();
  const isAdmin = isGlobalAdminUser();

  const [view, setView] = useState("content");
  const [contentOpen, setContentOpen] = useState(true);

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [hasContent, setHasContent] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  const [fontScale, setFontScale] = useState(1);
  const [readingTheme, setReadingTheme] = useState("paper");
  const [serif, setSerif] = useState(true);

  const [progress, setProgress] = useState(0);
  const progressBarRef = useRef(null);
  const [headerCompact, setHeaderCompact] = useState(false);

  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [openResults, setOpenResults] = useState(false);
  const searchBoxRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchCtlRef = useRef(null);
  const searchReqIdRef = useRef(0);

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
      content:
        "## LegalAI\nAsk anything about this case: issues, holding, ratio, authorities, practical next steps.\n\n_Disclaimer: AI may be inaccurate. Verify against the transcript._",
      createdAt: nowIso(),
      kind: "info",
    },
  ]);
  const [chatInput, setChatInput] = useState("");

  const chatEndRef = useRef(null);
  const aiMountedRef = useRef(false);
  const aiAutoLoadedRef = useRef(false);

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

  const fsClass = useMemo(() => {
    const n = Math.round(fontScale * 100);
    const clamped = Math.max(90, Math.min(120, n));
    return `lrr2Fs-${clamped}`;
  }, [fontScale]);

  const fontClass = useMemo(() => (serif ? "lrr2FontSerif" : "lrr2FontSans"), [serif]);

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

  const showInlineBreak = useMemo(() => {
    return !!(contentOpen && preview.gated && preview.reachedLimit);
  }, [contentOpen, preview.gated, preview.reachedLimit]);

  const canRenderReader = useMemo(() => {
    if (!report) return false;
    if (availabilityLoading) return true;
    if (!hasContent && !textHasContent) return false;
    return true;
  }, [report, availabilityLoading, hasContent, textHasContent]);

  const suggestedPrompts = useMemo(() => {
    return [
      "Summarize the case in 8 bullet points.",
      "What were the key issues for determination?",
      "What was the holding and orders?",
      "Extract the ratio decidendi and reasoning.",
      "List cited authorities and how they were applied.",
      "What practical action items follow from this decision?",
    ];
  }, []);

  useEffect(() => {
    function onScroll() {
      const el = document.documentElement;
      const scrollTop = el.scrollTop || document.body.scrollTop;
      const scrollHeight = el.scrollHeight || document.body.scrollHeight;
      const clientHeight = el.clientHeight || window.innerHeight;
      const max = Math.max(1, scrollHeight - clientHeight);
      const p = Math.min(1, Math.max(0, scrollTop / max));
      setProgress(p);
      setHeaderCompact(scrollTop > 120);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!progressBarRef.current) return;
    progressBarRef.current.style.transform = `scaleX(${progress})`;
  }, [progress]);

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
      if (!el.contains(e.target)) setOpenResults(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openResults]);

  useEffect(() => {
    function onKey(e) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const hot = (isMac ? e.metaKey : e.ctrlKey) && String(e.key || "").toLowerCase() === "k";
      if (hot) {
        e.preventDefault();
        setOpenResults(true);
        searchInputRef.current?.focus?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
          "## LegalAI\nAsk anything about this case: issues, holding, ratio, authorities, practical next steps.\n\n_Disclaimer: AI may be inaccurate. Verify against the transcript._",
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

  useEffect(() => {
    const term = String(q || "").trim();

    try {
      searchCtlRef.current?.abort?.();
    } catch {
      //ignore
    }

    searchCtlRef.current = null;

    if (term.length < 2) {
      setSearching(false);
      setSearchErr("");
      setSearchResults([]);
      setOpenResults(false);
      return;
    }

    const reqId = ++searchReqIdRef.current;
    const t = setTimeout(async () => {
      const ctl = new AbortController();
      searchCtlRef.current = ctl;

      try {
        setSearching(true);
        setSearchErr("");

        const res = await api.get(`/law-reports/search`, {
          params: { q: term, page: 1, pageSize: 8 },
          signal: ctl.signal,
        });

        if (reqId !== searchReqIdRef.current) return;

        const payload = unwrapApi(res);
        const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];

        setSearchResults(items);
        setOpenResults(true);
      } catch (e) {
        const aborted =
          e?.name === "CanceledError" ||
          e?.name === "AbortError" ||
          e?.code === "ERR_CANCELED" ||
          e?.message?.toLowerCase?.().includes("canceled");

        if (aborted) return;
        if (reqId !== searchReqIdRef.current) return;

        setSearchErr(getApiErrorMessage(e, "Search failed."));
        setSearchResults([]);
        setOpenResults(true);
      } finally {
        if (reqId === searchReqIdRef.current) setSearching(false);
      }
    }, 280);

    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!aiMountedRef.current) {
      aiMountedRef.current = true;
      return;
    }
    chatEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages.length]);

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
      console.warn("[LawReportReader] refresh access failed", e);
    } finally {
      setAccessLoading(false);
    }
  }

  function goUrl(url) {
    if (!url) return;

    const u = String(url);

    if (u === "/pricing" || u.startsWith("/pricing?") || u.startsWith("/pricing/")) {
      navigate(u.replace("/pricing", SUBSCRIBE_ROUTE));
      return;
    }

    if (u.startsWith("http")) window.open(u, "_blank", "noreferrer");
    else navigate(u);
  }

  function pickReport(r) {
    const rid = Number(r?.id || r?.lawReportId);
    if (!rid) return;
    setOpenResults(false);
    setQ("");
    setSearchResults([]);
    setSearchErr("");
    navigate(`/dashboard/law-reports/${rid}`);
  }

  // ---------------- AI: Cached summary (now: clicking Basic/Extended auto-loads cached) ----------------

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

        // IMPORTANT: Do NOT push summary into chat history (prevents duplicates & removes summary from chat window).
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

  useEffect(() => {
    if (view !== "ai" && view !== "split") return;
    if (!aiAllowed) return;
    if (!reportId) return;
    if (aiAutoLoadedRef.current) return;

    aiAutoLoadedRef.current = true;
    setSummaryType("basic");
    aiGetCachedSummary("basic");
  }, [view, aiAllowed, reportId, aiGetCachedSummary]);

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

      // IMPORTANT: Do NOT push summary into chat history (prevents duplicates & removes summary from chat window).
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
      const reply = prettifyChatReplyForUi(String(replyRaw || ""));

      setMessages((prev) => {
        const cleaned = prev.filter((m) => m?.id !== typingMsg.id);
        return [
          ...cleaned,
          {
            id: `a_${Date.now()}`,
            role: "assistant",
            content: reply || "I couldn’t generate a response. Please try again.",
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

      const text =
        "## Related cases (AI)\n" +
        `1. Kenya: ${payload?.kenyaCount ?? ""}\n` +
        `2. Foreign: ${payload?.foreignCount ?? ""}\n\n` +
        (items.length
          ? items
              .map((x, i2) => {
                const title = (x?.title || x?.Title || `Case ${i2 + 1}`).trim();
                const citation = (x?.citation || x?.Citation || "").trim();
                const juris = (x?.jurisdiction || x?.Jurisdiction || "").trim();
                const why = (x?.reason || x?.Reason || x?.note || "").trim();
                const bits = [];
                if (citation) bits.push(citation);
                if (juris) bits.push(juris);
                const meta = bits.length ? ` (${bits.join(" · ")})` : "";
                return `${i2 + 1}. **${title}**${meta}${why ? ` — ${why}` : ""}`;
              })
              .join("\n")
          : "1. No related cases returned.\n") +
        `\n\n### Disclaimer\n${disclaimer}`;

      setMessages((prev) => [
        ...prev,
        { id: `rel_${Date.now()}`, role: "assistant", content: text, createdAt: nowIso(), kind: "related" },
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

  function aiClearChat() {
    setAiErr("");
    setAiLastAction(null);
    setMessages([
      {
        id: `sys_${Date.now()}`,
        role: "assistant",
        content: "## New chat\nAsk anything about the case. I can extract issues, holdings, reasoning, authorities, and practical guidance.",
        createdAt: nowIso(),
        kind: "info",
      },
    ]);
  }

  function aiNewSummary() {
    setAiErr("");
    setAiLastAction(null);
    setSummaryText("");
    setSummaryMeta(null);
    // No chat messages here (keeps chat clean)
  }

  function copyText(text) {
    const t = String(text || "");
    if (!t) return;
    navigator.clipboard?.writeText?.(t);
  }

  // ---------------- Render guards ----------------

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
            <button
              type="button"
              className="lrr2IconPill"
              data-tip="Back to Law Reports"
              onClick={() => navigate("/dashboard/law-reports")}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="txt">Back</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!canRenderReader) {
    return (
      <div className="lrr2Wrap">
        <div className="lrr2Error">
          <div className="lrr2ErrorTitle">Not available</div>
          <div className="lrr2ErrorMsg">
            {availabilityLoading ? "Checking availability…" : "This report isn’t available yet."}
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

  // ---------------- LegalAI Panel (Premium layout) ----------------

  function LegalAiPanel({ compact }) {
    if (!aiAllowed) {
      return <AiLockedPanel access={access} onGo={goUrl} />;
    }

    const hasSomeSummary = !!safeTrim(summaryText);
    const showSummaryEmpty = aiTab === "summary" && !hasSomeSummary && !aiBusy;

    function parseSectionedSummary(text) {
      const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");

      let caseTitle = "";
      const sections = [];
      let cur = null;

      const isHeader = (s) => /^[A-Z][A-Z0-9\s/()-]{2,}:\s*$/.test(s.trim());

      function pushCur() {
        if (!cur) return;
        cur.items = cur.items.map((x) => x.trim()).filter(Boolean);
        if (cur.items.length) sections.push(cur);
        cur = null;
      }

      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;

        const mTitle = line.match(/^TITLE\s*:\s*(.+)$/i);
        if (mTitle?.[1]) {
          caseTitle = mTitle[1].trim();
          continue;
        }

        if (isHeader(line)) {
          pushCur();
          cur = { title: line.replace(/:\s*$/, "").trim(), items: [] };
          continue;
        }

        const cleaned = line.replace(/^[-•]\s+/, "").trim();
        if (!cleaned) continue;

        if (!cur) cur = { title: "SUMMARY", items: [] };
        cur.items.push(cleaned);
      }

      pushCur();

      // Fallback: no sections detected -> paragraphs
      if (!sections.length && String(text || "").trim()) {
        return { caseTitle, sections: [{ title: "SUMMARY", items: splitIntoParagraphs(text).slice(0, 20) }] };
      }

      // Merge duplicate section titles + de-dup items
      const merged = new Map();
      for (const s of sections) {
        const key = String(s.title || "").trim().toUpperCase();
        if (!merged.has(key)) merged.set(key, { title: s.title, items: [] });
        merged.get(key).items.push(...(s.items || []));
      }

      const out = Array.from(merged.values()).map((s) => {
        const seen = new Set();
        const items = [];
        for (const it of s.items || []) {
          const k = String(it || "").trim().toLowerCase();
          if (!k) continue;
          if (seen.has(k)) continue;
          seen.add(k);
          items.push(it);
        }
        return { title: s.title, items };
      });

      return { caseTitle, sections: out };
    }

    function extractKeyTakeaways(sections) {
      const isKpTitle = (title) => {
        const t = String(title || "").toUpperCase();
        return (
          t.includes("KEY TAKEAWAYS") ||
          t.includes("KEY POINTS") ||
          t.includes("KEY POINT") ||
          t.includes("KEY HIGHLIGHTS") ||
          t.includes("HIGHLIGHTS") ||
          t.includes("TAKEAWAYS")
        );
      };

      const kp = sections.find((s) => isKpTitle(s.title));
      if (!kp) return [];
      return kp.items.map((t, idx) => ({ id: `kp_${idx}`, text: t }));
    }

    const aiShellClass = `lrrAi lrrAi--premium ${compact ? "isCompact" : ""}`;

    return (
      <div className={aiShellClass}>
        <div className="lrrAiHead">
          <div className="lrrAiHeadLeft">
            <div className="lrrAiTitle">LegalAI</div>
            <div className="lrrAiSub">Premium-grade summaries & chat. Verify against the transcript.</div>
          </div>

          <div className="lrrAiHeadRight">
            {aiTab === "summary" ? (
              <div className="lrrAiHeadActions">
                <button
                  type="button"
                  className="lrrAiBtn ghost"
                  disabled={aiBusy || !hasSomeSummary}
                  onClick={() => copyText(summaryText)}
                  title="Copy summary"
                >
                  Copy
                </button>

                <button
                  type="button"
                  className="lrrAiBtn ghost"
                  disabled={aiBusy || !hasSomeSummary}
                  onClick={() => copyText(bulletsFromText(summaryText))}
                  title="Copy as bullets"
                >
                  Copy bullets
                </button>

                <span className="lrrAiHeadSep" aria-hidden="true" />

                <button
                  type="button"
                  className="lrrAiBtn ghost"
                  onClick={aiNewSummary}
                  title="Clear current summary"
                >
                  New summary
                </button>
              </div>
            ) : (
              <div className="lrrAiHeadActions">
                <button type="button" className="lrrAiBtn ghost" onClick={aiClearChat} title="Clear messages">
                  Clear chat
                </button>
              </div>
            )}
          </div>
        </div>

        {aiErr ? (
          <div className="lrrAiAlert" role="alert">
            <div className="lrrAiAlertTitle">Couldn’t complete that</div>
            <div className="lrrAiAlertMsg">{aiErr}</div>
            <div className="lrrAiAlertActions">
              <button type="button" className="lrrAiBtn" onClick={aiRetry}>
                Retry
              </button>
              <button type="button" className="lrrAiBtn ghost" onClick={() => setAiErr("")}>
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <div className="lrrAiTabs" role="tablist" aria-label="LegalAI tabs">
          <button
            type="button"
            className={`lrrAiTab ${aiTab === "summary" ? "isActive" : ""}`}
            onClick={() => setAiTab("summary")}
          >
            Summary
          </button>
          <button
            type="button"
            className={`lrrAiTab ${aiTab === "chat" ? "isActive" : ""}`}
            onClick={() => setAiTab("chat")}
          >
            Chat
          </button>
          <button
            type="button"
            className={`lrrAiTab ${aiTab === "related" ? "isActive" : ""}`}
            onClick={() => setAiTab("related")}
          >
            Related cases
          </button>
        </div>

        {/* Suggested prompts: show only when in Chat (keeps UI clean & avoids duplicate “tips”) */}
        {aiTab === "chat" ? (
          <div className="lrrAiChips" aria-label="Suggested prompts">
            {suggestedPrompts.slice(0, 6).map((p, idx) => (
              <button
                key={idx}
                type="button"
                className="lrrAiChip"
                onClick={() => {
                  setChatInput(p);
                }}
                title="Use this prompt"
              >
                {p}
              </button>
            ))}
          </div>
        ) : null}

        <div className="lrrAiBody">
          {/* ---------------- Summary ---------------- */}
          {aiTab === "summary" ? (
            <div className="lrrAiCard lrrAiCard--summary">
              <div className="lrrAiRow lrrAiRow--premium">
                <div className="lrrAiSegment" role="group" aria-label="Summary type">
                  <button
                    type="button"
                    className={`lrrAiSegBtn ${summaryType === "basic" ? "isOn" : ""}`}
                    onClick={() => {
                      setSummaryType("basic");
                      aiGetCachedSummary("basic"); // click loads cached summary (requested)
                    }}
                    title="Basic (cached)"
                  >
                    Basic
                  </button>
                  <button
                    type="button"
                    className={`lrrAiSegBtn ${summaryType === "extended" ? "isOn" : ""}`}
                    onClick={() => {
                      setSummaryType("extended");
                      aiGetCachedSummary("extended"); // click loads cached summary (requested)
                    }}
                    title="Extended (cached)"
                  >
                    Extended
                  </button>
                </div>

                <div className="lrrAiRowActions">
                  <button
                    type="button"
                    className="lrrAiBtn primary"
                    disabled={aiBusy}
                    onClick={() => aiGenerateSummary({ type: summaryType, forceRegenerate: false })}
                    title="Generate summary"
                  >
                    Generate
                  </button>

                  <button
                    type="button"
                    className="lrrAiBtn ghost"
                    disabled={aiBusy}
                    onClick={() => aiGenerateSummary({ type: summaryType, forceRegenerate: true })}
                    title="Force regenerate"
                  >
                    Force regenerate
                  </button>
                </div>
              </div>

              {aiBusy ? (
                <div className="lrrAiLoading">
                  <div className="lrrAiDots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="lrrAiLoadingTxt">Working…</div>
                </div>
              ) : null}

              {showSummaryEmpty ? (
                <div className="lrrAiEmpty">
                  <div className="lrrAiEmptyTitle">No cached summary yet</div>
                  <div className="lrrAiEmptyMsg">
                    Click <b>Generate</b> to create it once, then Basic/Extended will load instantly next time.
                  </div>
                </div>
              ) : null}

              {hasSomeSummary ? (
                <div className="lrrAiAnswer lrrAiAnswer--premium">
                  <div className="lrrAiAnswerTop">
                    <div className="lrrAiAnswerMeta">
                      <span className="pill">Type: {summaryMeta?.type || summaryType}</span>
                      {summaryMeta?.cached ? <span className="pill soft">cached</span> : null}
                    </div>
                  </div>

                  {(() => {
                    const parsed = parseSectionedSummary(summaryText);
                    const sections = parsed.sections;

                    const takeaways = extractKeyTakeaways(sections);

                    const mainSections = sections.filter((s) => {
                      const t = String(s.title || "").toUpperCase();
                      return !(
                        t.includes("KEY TAKEAWAYS") ||
                        t.includes("KEY POINTS") ||
                        t.includes("KEY POINT") ||
                        t.includes("KEY HIGHLIGHTS") ||
                        t.includes("HIGHLIGHTS") ||
                        t.includes("TAKEAWAYS")
                      );
                    });

                    return (
                      <>
                        {/* Title is displayed once (NOT as a card) */}
                        {parsed.caseTitle ? <div className="lrrAiCaseTitle">{parsed.caseTitle}</div> : null}

                        {/* 1 card per row (full width) */}
                        <div className="lrrAiSections lrrAiSections--single">
                          {mainSections.map((s, idx) => (
                            <section key={`${s.title}_${idx}`} className="lrrAiSectionCard lrrAiSectionCard--full">
                              <div className="lrrAiSectionHead">
                                <span className="dot" aria-hidden="true" />
                                <div className="ttl">{s.title}</div>
                              </div>

                              <ol className="lrrAiSectionList lrrAiSectionList--numbered">
                                {s.items.map((it, i2) => (
                                  <li key={i2}>{it}</li>
                                ))}
                              </ol>
                            </section>
                          ))}
                        </div>

                        {takeaways.length ? (
                          <details className="lrrAiTakeaways" open>
                            <summary className="lrrAiTakeawaysSum">
                              <span className="kpttl">KEY TAKEAWAYS</span>
                              <span className="kphint">(click to collapse)</span>
                              <span className="chev" aria-hidden="true">
                                ▾
                              </span>
                            </summary>

                            <div className="lrrAiKpGrid">
                              {takeaways.map((x, idx) => (
                                <div key={x.id} className="lrrAiKpCard">
                                  <div className="lrrAiKpText">{x.text}</div>
                                  <div className="lrrAiKpBadge">{`KP${idx + 1}`}</div>
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : null}
                      </>
                    );
                  })()}

                  <details className="lrrAiRawToggle">
                    <summary className="lrrAiRawToggleSum">Show raw output</summary>
                    <div className="lrrAiRawFallback">
                      <RichText text={summaryText} />
                    </div>
                  </details>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ---------------- Related cases ---------------- */}
          {aiTab === "related" ? (
            <div className="lrrAiCard lrrAiCard--related">
              <div className="lrrAiRow lrrAiRow--premium">
                <div className="lrrAiNote">
                  Generate AI-suggested related cases (Kenya + Foreign). Always verify relevance and citations.
                </div>

                <div className="lrrAiRowActions">
                  <button type="button" className="lrrAiBtn primary" disabled={aiBusy} onClick={aiGenerateRelatedCases}>
                    Generate
                  </button>
                </div>
              </div>

              {aiBusy ? (
                <div className="lrrAiLoading">
                  <div className="lrrAiDots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="lrrAiLoadingTxt">Working…</div>
                </div>
              ) : null}

              <div className="lrrAiChat lrrAiChat--premium">
                {messages
                  .filter((m) => m?.kind === "related")
                  .slice(-3)
                  .map((m) => (
                    <div key={m.id} className="lrrAiMsg assistant">
                      <div className="bubble">
                        <div className="lrrAiMsgActions">
                          <button type="button" className="lrrAiMini" onClick={() => copyText(m.content)} title="Copy">
                            Copy
                          </button>
                        </div>
                        <RichText text={m.content} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          {/* ---------------- Chat ---------------- */}
          {aiTab === "chat" ? (
            <div className="lrrAiCard lrrAiCard--chatPremium">
              <div className="lrrAiChat lrrAiChat--premium">
                {messages
                  // keep chat clean: exclude any summary messages if they exist from old sessions
                  .filter((m) => m?.kind !== "summary")
                  .map((m) => {
                    const isUser = m.role === "user";
                    const isTyping = m.kind === "typing";

                    return (
                      <div key={m.id} className={`lrrAiMsg ${isUser ? "user" : "assistant"}`}>
                        <div className="bubble">
                          {!isUser && !isTyping ? (
                            <div className="lrrAiMsgActions">
                              <button
                                type="button"
                                className="lrrAiMini"
                                onClick={() => copyText(m.content)}
                                title="Copy"
                              >
                                Copy
                              </button>
                            </div>
                          ) : null}

                          {isTyping ? (
                            <div className="lrrAiTyping" aria-label="Assistant is typing">
                              <span />
                              <span />
                              <span />
                            </div>
                          ) : (
                            <RichText text={m.content} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                <div ref={chatEndRef} />
              </div>

              <div className="lrrAiComposer lrrAiComposer--premium">
                <textarea
                  className="lrrAiInput"
                  value={chatInput}
                  placeholder="Ask LegalAI about issues, holding, ratio, citations, arguments…"
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      aiSendChat(chatInput);
                    }
                  }}
                />
                <div className="lrrAiComposerActions">
                  <div className="lrrAiHint">Ctrl/⌘ + Enter to send</div>
                  <button
                    type="button"
                    className="lrrAiBtn primary"
                    disabled={aiBusy || !safeTrim(chatInput)}
                    onClick={() => aiSendChat(chatInput)}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Single, non-duplicated disclaimer line (premium footer) */}
        <div className="lrrAiFooter lrrAiFooter--premium">
          <div className="lrrAiFooterDisc">Disclaimer: AI output may be inaccurate. Verify against the transcript and citations.</div>
        </div>
      </div>
    );
  }

  // ---------------- Page layout ----------------

  return (
    <div className="lrr2Wrap" data-theme={readingTheme}>
      <header className={`lrr2Header ${headerCompact ? "isCompact" : ""}`}>
        <div className="lrr2HeaderTop">
          <div className="lrr2Brand">Law Africa Law Reports-Case File (Transcript)</div>
          <div className="lrr2HeaderRight">
            <button className="lrr2LinkBtn" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back
            </button>
          </div>
        </div>

        <div className="lrr2SearchRow">
          <div className="lrr2SearchBox" ref={searchBoxRef}>
            <div className="lrr2SearchLead" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span>Case search</span>
            </div>

            <input
              ref={searchInputRef}
              className="lrr2SearchInput"
              placeholder="Search parties, citation, court, year, or words inside the case…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => {
                if (searchResults.length || searchErr) setOpenResults(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && openResults && searchResults?.length) {
                  e.preventDefault();
                  pickReport(searchResults[0]);
                }
              }}
            />

            <button type="button" className="lrr2SearchBtn" onClick={() => setOpenResults((v) => !v)}>
              <>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                {searching ? "Searching…" : "Search"}
              </>
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
                    <button type="button" key={rid || idx} className="lrr2SearchItem" onClick={() => pickReport(r)}>
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
            Tip: Type 2+ characters — e.g. <b>distressed tenant</b>
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

      <div className="lrr2TopGrid lrr2TopGrid--single">
        <section className="lrr2MetaCard">
          <div className="lrr2MetaGrid">
            <div className="lrr2MetaRow">
              {llrNo ? (
                <div className="lrr2MetaTag" data-tip="LLR Number">
                  <span className="lrr2MetaIcon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M8 9h8M8 13h6" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  </span>
                  {llrNo}
                </div>
              ) : null}

              {report.caseNumber ? (
                <div className="lrr2MetaTag" data-tip="Case Number">
                  <span className="lrr2MetaIcon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M7 7h10v10H7z" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M9 11h6M9 14h4" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  </span>
                  {report.caseNumber}
                </div>
              ) : null}

              {report.court ? (
                <div className="lrr2MetaTag" data-tip="Court">
                  <span className="lrr2MetaIcon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M4 10h16" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M6 10V6h12v4" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M6 18h12" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  </span>
                  {report.court}
                </div>
              ) : null}

              {report.decisionTypeLabel ? (
                <div className="lrr2MetaTag" data-tip="Decision Type">
                  <span className="lrr2MetaIcon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M12 3v18M5 12h14" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  </span>
                  {report.decisionTypeLabel}
                </div>
              ) : null}

              {report.decisionDate ? (
                <div className="lrr2MetaTag" data-tip="Decision Date">
                  <span className="lrr2MetaIcon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  </span>
                  {formatDate(report.decisionDate)}
                </div>
              ) : null}
            </div>

            <div className="lrr2MetaRow">
              {report.judges ? (
                <div className="lrr2MetaTag" data-tip="Judge(s)">
                  <span className="lrr2MetaIcon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M5 20c1.5-4 12.5-4 14 0" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  </span>
                  {report.judges}
                </div>
              ) : null}

              {report.country ? (
                <div className="lrr2MetaTag" data-tip="Country">
                  <span className="lrr2MetaIcon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M3 12h18M12 3a15 15 0 0 1 0 18" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </span>
                  {report.country}
                </div>
              ) : null}

              <button
                type="button"
                className="lrr2MetaAction"
                data-action="true"
                title="Copy title"
                onClick={() => navigator.clipboard?.writeText(`${title}`)}
              >
                Copy title
              </button>

              {report?.citation ? (
                <button
                  type="button"
                  className="lrr2MetaAction"
                  data-action="true"
                  title="Copy citation"
                  onClick={() => navigator.clipboard?.writeText(String(report.citation))}
                >
                  Copy citation
                </button>
              ) : null}

              {isPremium ? (
                <div className="lrr2MetaHint">
                  {accessLoading ? (
                    <span className="lrr2MetaHint" data-tip="Checking subscription access">
                      checking access…
                    </span>
                  ) : (
                    <AccessStatusChip access={access} isPremium={isPremium} isAdmin={isAdmin} hasFullAccess={hasFullAccess} />
                  )}
                </div>
              ) : null}
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
          title="Transcript"
        >
          Transcript
          {isPremium && !hasFullAccess ? <span className="lrr2TabBadge lock">Locked</span> : null}
        </button>

        {aiAllowed ? (
          <button
            type="button"
            role="tab"
            aria-selected={view === "ai"}
            className={`lrr2Tab ${view === "ai" ? "isActive" : ""}`}
            onClick={() => {
              setView("ai");
              setContentOpen(false);
            }}
            title="LegalAI"
          >
            LegalAI <span className="lrr2TabBadge">AI</span>
          </button>
        ) : (
          <button type="button" role="tab" aria-selected={false} className="lrr2Tab isDisabled" disabled>
            LegalAI <span className="lrr2TabBadge lock">Locked</span>
          </button>
        )}

        <button
          type="button"
          role="tab"
          aria-selected={view === "split"}
          className={`lrr2Tab ${view === "split" ? "isActive" : ""}`}
          onClick={() => {
            setView("split");
            setContentOpen(true);
          }}
          title="Split view (Transcript + LegalAI)"
        >
          Split
        </button>
      </div>

      <section className="lrr2Content">
        {!textHasContent ? (
          <div className="lrr2Empty">This report has no content yet.</div>
        ) : view === "ai" ? (
          aiAllowed ? (
            <div className="lrr2Panel lrr2Panel--tight">
              <LegalAiPanel compact={false} />
            </div>
          ) : (
            <AiLockedPanel access={access} onGo={goUrl} />
          )
        ) : view === "split" ? (
          <div className="lrr2Split">
            <article className="lrr2Article">
              <div className="lrr2TranscriptTools">
                <div className="lrr2ReaderBar">
                  <div className="lrr2ReaderCluster">
                    <button
                      type="button"
                      className="lrr2IconBtn"
                      onClick={() => setFontScale((v) => Math.max(0.9, Number((v - 0.05).toFixed(2))))}
                      title="Decrease text size"
                      aria-label="Decrease text size"
                    >
                      <span className="lrr2IconBtnText">A−</span>
                    </button>

                    <button
                      type="button"
                      className="lrr2IconBtn"
                      onClick={() => setFontScale((v) => Math.min(1.2, Number((v + 0.05).toFixed(2))))}
                      title="Increase text size"
                      aria-label="Increase text size"
                    >
                      <span className="lrr2IconBtnText">A+</span>
                    </button>

                    <button
                      type="button"
                      className={`lrr2IconBtn ${serif ? "isOn" : ""}`}
                      onClick={() => setSerif((v) => !v)}
                      title={serif ? "Serif font (on)" : "Serif font (off)"}
                      aria-label="Toggle serif font"
                    >
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
                      <span className="lrr2IconBtnText">Paper</span>
                    </button>

                    <button
                      type="button"
                      className={`lrr2IconBtn ${readingTheme === "sepia" ? "isOn" : ""}`}
                      onClick={() => setReadingTheme("sepia")}
                      title="Sepia theme"
                      aria-label="Sepia theme"
                    >
                      <span className="lrr2IconBtnText">Sepia</span>
                    </button>

                    <button
                      type="button"
                      className={`lrr2IconBtn ${readingTheme === "dark" ? "isOn" : ""}`}
                      onClick={() => setReadingTheme("dark")}
                      title="Dark theme"
                      aria-label="Dark theme"
                    >
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
                  preview.gated && preview.reachedLimit ? "isPreviewGated" : "",
                ].join(" ")}
              >
                {preview.renderAsHtml ? (
                  <div className="lrr2Html" dangerouslySetInnerHTML={{ __html: preview.html }} />
                ) : (
                  <CaseContentWithGateBreak
                    text={preview.text}
                    showBreak={showInlineBreak}
                    access={access}
                    onGo={goUrl}
                    onRefresh={refreshAccessNow}
                  />
                )}
              </div>

              {contentOpen && preview.gated && preview.reachedLimit ? (
                <SubscribeGateOverlay access={access} onGo={goUrl} />
              ) : null}

              <SubscriptionGateCard
                isPremium={isPremium}
                access={access}
                isAdmin={isAdmin}
                isInst={isInst}
                isPublic={isPublic}
                hasFullAccess={hasFullAccess}
                onGo={goUrl}
                onRefreshAccess={refreshAccessNow}
              />
            </article>

            <aside className="lrr2Aside">
              {aiAllowed ? <LegalAiPanel compact={true} /> : <AiLockedPanel access={access} onGo={goUrl} />}
            </aside>
          </div>
        ) : (
          <article className="lrr2Article">
            <div className="lrr2TranscriptTools">
              <div className="lrr2ReaderBar">
                <div className="lrr2ReaderCluster">
                  <button
                    type="button"
                    className="lrr2IconBtn"
                    onClick={() => setFontScale((v) => Math.max(0.9, Number((v - 0.05).toFixed(2))))}
                    title="Decrease text size"
                    aria-label="Decrease text size"
                  >
                    <span className="lrr2IconBtnText">A−</span>
                  </button>

                  <button
                    type="button"
                    className="lrr2IconBtn"
                    onClick={() => setFontScale((v) => Math.min(1.2, Number((v + 0.05).toFixed(2))))}
                    title="Increase text size"
                    aria-label="Increase text size"
                  >
                    <span className="lrr2IconBtnText">A+</span>
                  </button>

                  <button
                    type="button"
                    className={`lrr2IconBtn ${serif ? "isOn" : ""}`}
                    onClick={() => setSerif((v) => !v)}
                    title={serif ? "Serif font (on)" : "Serif font (off)"}
                    aria-label="Toggle serif font"
                  >
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
                    <span className="lrr2IconBtnText">Paper</span>
                  </button>

                  <button
                    type="button"
                    className={`lrr2IconBtn ${readingTheme === "sepia" ? "isOn" : ""}`}
                    onClick={() => setReadingTheme("sepia")}
                    title="Sepia theme"
                    aria-label="Sepia theme"
                  >
                    <span className="lrr2IconBtnText">Sepia</span>
                  </button>

                  <button
                    type="button"
                    className={`lrr2IconBtn ${readingTheme === "dark" ? "isOn" : ""}`}
                    onClick={() => setReadingTheme("dark")}
                    title="Dark theme"
                    aria-label="Dark theme"
                  >
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
                preview.gated && preview.reachedLimit ? "isPreviewGated" : "",
              ].join(" ")}
            >
              {preview.renderAsHtml ? (
                <div className="lrr2Html" dangerouslySetInnerHTML={{ __html: preview.html }} />
              ) : (
                <CaseContentWithGateBreak
                  text={preview.text}
                  showBreak={showInlineBreak}
                  access={access}
                  onGo={goUrl}
                  onRefresh={refreshAccessNow}
                />
              )}
            </div>

            {contentOpen && preview.gated && preview.reachedLimit ? <SubscribeGateOverlay access={access} onGo={goUrl} /> : null}

            <SubscriptionGateCard
              isPremium={isPremium}
              access={access}
              isAdmin={isAdmin}
              isInst={isInst}
              isPublic={isPublic}
              hasFullAccess={hasFullAccess}
              onGo={goUrl}
              onRefreshAccess={refreshAccessNow}
            />
          </article>
        )}
      </section>
    </div>
  );
}
