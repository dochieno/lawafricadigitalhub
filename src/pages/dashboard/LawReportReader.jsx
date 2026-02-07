// src/pages/dashboard/LawReportReader.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import "../../styles/lawReportReader.css";

/* =========================================================
   1) Pure helpers (NO React hooks)
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

/* -------------------------
   Access + gating helpers
------------------------- */

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

// ✅ Your actual route (from App.jsx)
const SUBSCRIBE_ROUTE = "/dashboard/law-reports/subscribe";
const TRIAL_ROUTE = "/dashboard/trials";

function getAccessCtas(access) {
  // ✅ Fix defaults: /pricing does NOT exist in your router -> it redirects to /login via "*"
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

  // ✅ Always provide a “View plans” destination (same subscribe page) unless backend supplies one
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

// ✅ updated: accepts isPremium explicitly (so Option B can drive UI even if report.isPremium missing)
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

// ✅ updated: accepts isPremium explicitly
function getIsAiAllowed(isPremium, access, isAdmin) {
  if (isAdmin) return true;
  if (!isPremium) return true;
  return getHasFullAccess(access);
}

/* -------------------------
   Content formatting
------------------------- */

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

/* =========================================================
   2) Small presentational components
========================================================= */

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

/**
 * ✅ One combined card (replaces PremiumLockHero + SubscriptionGuidePanel)
 * Uses existing CSS classes to avoid needing a CSS file update.
 */
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

  // Optional institution-specific links only if backend provides them
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

          {/* ✅ Always safe: points to real route */}
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
          <div className="lrr2PanelTitle">LegalAI Summary</div>
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
   3) Main reader component
========================================================= */

export default function LawReportReader() {
  const { id } = useParams();
  const navigate = useNavigate();

  /* -------------------------
     Hooks first (stable order)
  ------------------------- */

  const reportId = useMemo(() => {
    const n = Number(id);
    return Number.isFinite(n) ? n : NaN;
  }, [id]);

  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();
  const isAdmin = isGlobalAdminUser();

  const [view, setView] = useState("content"); // content | ai
  const [contentOpen, setContentOpen] = useState(true);

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [hasContent, setHasContent] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  // Reader prefs
  const [fontScale, setFontScale] = useState(1);
  const [readingTheme, setReadingTheme] = useState("paper"); // paper | sepia | dark
  const [serif, setSerif] = useState(true);

  // Progress bar
  const [progress, setProgress] = useState(0);
  const progressBarRef = useRef(null);
  const [headerCompact, setHeaderCompact] = useState(false);

  // Search
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [openResults, setOpenResults] = useState(false);
  const searchBoxRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchCtlRef = useRef(null);
  const searchReqIdRef = useRef(0);

  /* -------------------------
     ✅ Option B: robust premium detection
  ------------------------- */
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

  /* -------------------------
     Derived values (useMemo)
  ------------------------- */

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

  /* -------------------------
     Effects
  ------------------------- */

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

      // ✅ access (only for premium) - uses Option B computed isPremium
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
      // ignore
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

  /* ======================================================
     Actions
  ====================================================== */

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

    // ✅ Hard-fix legacy /pricing links (they hit "*" -> /login)
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

  /* -------------------------
     Early returns
  ------------------------- */

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

  if (!canRenderReader) {
    return (
      <div className="lrr2Wrap">
        <div className="lrr2Error">
          <div className="lrr2ErrorTitle">Not available</div>
          <div className="lrr2ErrorMsg">{availabilityLoading ? "Checking availability…" : "This report isn’t available yet."}</div>
          <div className="lrr2TopActions">
            <button className="lrr2Btn" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------
     Render
  ------------------------- */

  const title = report.parties || report.title || "Law Report";
  const llrNo = report.reportNumber || report.llrNo || report.llrNumber || String(reportId);

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

        {/* Search row */}
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

      {/* Meta */}
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
                    <AccessStatusChip
                      access={access}
                      isPremium={isPremium}
                      isAdmin={isAdmin}
                      hasFullAccess={hasFullAccess}
                    />
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {/* Tabs */}
      <div className="lrr2Tabs" role="tablist" aria-label="Reader tabs">
        <button
          type="button"
          role="tab"
          aria-selected={view === "content"}
          className={`lrr2Tab ${view === "content" ? "isActive" : ""}`}
          onClick={() => {
            if (view === "content") setContentOpen((v) => !v);
            else {
              setView("content");
              setContentOpen(true);
            }
          }}
          title={view === "content" ? (contentOpen ? "Hide transcript" : "Show transcript") : "Transcript"}
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
          >
            LegalAI Summary <span className="lrr2TabBadge">AI</span>
          </button>
        ) : (
          <button type="button" role="tab" aria-selected={false} className="lrr2Tab isDisabled" disabled>
            LegalAI Summary <span className="lrr2TabBadge lock">Locked</span>
          </button>
        )}
      </div>

      <section className="lrr2Content">
        {view === "ai" ? (
          aiAllowed ? (
            <div className="lrr2Panel lrr2Panel--tight">
              <div className="lrr2PanelHead">
                <div className="lrr2PanelHeadLeft">
                  <div className="lrr2PanelTitle">LegalAI Summary</div>
                  <div className="lrr2PanelSub">Enabled (Step 3: re-plug your full AI panel cleanly).</div>
                </div>
              </div>
              <div className="lrr2PanelEmpty">AI panel will be re-attached after Step 2 is stable.</div>
            </div>
          ) : (
            <AiLockedPanel access={access} onGo={goUrl} />
          )
        ) : !textHasContent ? (
          <div className="lrr2Empty">This report has no content yet.</div>
        ) : (
          <article className="lrr2Article">
            {/* Reader tools */}
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

            {/* ✅ One combined subscription card */}
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

            {/* Transcript */}
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

            {/* Sticky CTA if preview limit reached */}
            {contentOpen && preview.gated && preview.reachedLimit ? (
              <SubscribeGateOverlay access={access} onGo={goUrl} />
            ) : null}
          </article>
        )}
      </section>
    </div>
  );
}
