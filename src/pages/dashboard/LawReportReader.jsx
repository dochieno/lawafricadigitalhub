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

    // If it already contains markdown headings or lists, keep it.
    if (/^#{1,4}\s+/m.test(t)) return t;
    if (/^(\d+\.\s+|[-•]\s+)/m.test(t)) return t;
    if (t.includes("\n\n")) return t;

    // Split into sentences
    const parts = t
      .split(/(?<=[.!?])\s+/)
      .map((x) => x.trim())
      .filter(Boolean);

    // Use bullets instead of numbered list
    if (parts.length >= 2 && parts.length <= 12) {
      return parts.map((p) => `- ${p}`).join("\n");
    }

    return t;
  }
  //Force unordered list:
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

// ---------------- Context chips (jurisdiction + issue) ----------------

function titleCase(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (m) => m.toUpperCase())
    .trim();
}

function inferIssuesFromText(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return [];

  const rules = [
    { k: "sentenc", label: "Sentencing" },
    { k: "bail", label: "Bail" },
    { k: "appeal", label: "Appeal" },
    { k: "judicial review", label: "Judicial Review" },
    { k: "constitutional", label: "Constitutional" },
    { k: "election", label: "Election" },
    { k: "contract", label: "Contract" },
    { k: "employment", label: "Employment" },
    { k: "land", label: "Land" },
    { k: "succession", label: "Succession" },
    { k: "family", label: "Family" },
    { k: "defamation", label: "Defamation" },
    { k: "tax", label: "Tax" },
    { k: "company", label: "Company" },
    { k: "crime", label: "Criminal" },
    { k: "wildlife", label: "Wildlife" },
    { k: "environment", label: "Environment" },
    { k: "procurement", label: "Procurement" },
    { k: "injunction", label: "Injunction" },
  ];

  const out = [];
  for (const r of rules) {
    if (t.includes(r.k)) out.push(r.label);
    if (out.length >= 3) break;
  }
  return out;
}

function buildContextChips(report, previewText) {
  const chips = [];

  const country =
    report?.country ||
    report?.Country ||
    "";

  const court =
    report?.court ||
    report?.Court ||
    report?.courtTypeLabel ||
    report?.CourtTypeLabel ||
    "";

  const decisionType =
    report?.decisionTypeLabel ||
    report?.DecisionTypeLabel ||
    report?.decisionType ||
    report?.DecisionType ||
    "";

  const jurisdiction = [court, country].filter(Boolean).join(" · ");
  if (jurisdiction) chips.push({ tone: "neutral", label: jurisdiction });

  if (decisionType) chips.push({ tone: "neutral", label: titleCase(decisionType) });

  // issue inference: use title + a bit of transcript preview for accuracy
  const title = report?.parties || report?.title || "";
  const sample = `${title}\n${String(previewText || "").slice(0, 2200)}`;
  const issues = inferIssuesFromText(sample);

  for (const x of issues) chips.push({ tone: "soft", label: x });

  return chips.slice(0, 4);
}

// ---------------- AI status indicator ----------------

function getAiStatus({ aiBusy, aiTab, aiLastAction, summaryMeta, summaryText }) {
  if (aiBusy) {
    if (aiLastAction?.kind === "genSummary") return { tone: "busy", label: "Regenerating…" };
    if (aiLastAction?.kind === "getSummary") return { tone: "busy", label: "Loading cached…" };
    if (aiLastAction?.kind === "chat") return { tone: "busy", label: "Thinking…" };
    if (aiLastAction?.kind === "related") return { tone: "busy", label: "Finding related cases…" };
    return { tone: "busy", label: "Working…" };
  }

  if (aiTab === "summary") {
    if (summaryMeta?.cached && String(summaryText || "").trim())
      return { tone: "cached", label: "Cached summary" };
    if (String(summaryText || "").trim())
      return { tone: "fresh", label: "Fresh summary" };
    return { tone: "idle", label: "No summary yet" };
  }

  if (aiTab === "chat") return { tone: "idle", label: "Ready" };
  if (aiTab === "related") return { tone: "idle", label: "Ready" };

  return { tone: "idle", label: "Ready" };
}

// ---------------- Chat auto-section formatting ----------------

function autoSectionChatReply(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  // If already has markdown headings or lists, keep (we only normalize bullets later)
  if (/^#{1,4}\s+/m.test(raw)) return raw;

  const lines = raw.split("\n").map((x) => x.trim()).filter(Boolean);

  // Heuristic: if lines include "Heading:" patterns, sectionize them.
  const sectionStarts = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^[A-Za-z][A-Za-z\s/&()-]{2,40}:\s*$/.test(lines[i])) {
      sectionStarts.push(i);
    }
  }

  // If no clear "Heading:" lines, attempt keyword sections for legal answers
  const keywordSections = [
    { key: "Ratio Decidendi", re: /\bratio\b|\bratio decidendi\b/i },
    { key: "Issues", re: /\bissues?\b|\bissue for determination\b/i },
    { key: "Holding", re: /\bholding\b|\bhe?ld\b|\bdecision\b/i },
    { key: "Reasoning", re: /\breason(ing)?\b|\banalysis\b|\brationale\b/i },
    { key: "Orders", re: /\borders?\b|\bdisposition\b/i },
    { key: "Authorities", re: /\bauthorities\b|\bcases cited\b|\bcited\b|\bstatute\b/i },
    { key: "Practical Steps", re: /\bpractical\b|\baction items\b|\bwhat to do\b/i },
  ];

  // If the assistant wrote paragraphs, we will bucket them.
  if (sectionStarts.length === 0 && lines.length >= 3) {
    const paras = raw.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
    if (paras.length >= 2) {
      const buckets = new Map();
      const rest = [];

      for (const p of paras) {
        const hit = keywordSections.find((k) => k.re.test(p));
        if (hit) {
          if (!buckets.has(hit.key)) buckets.set(hit.key, []);
          buckets.get(hit.key).push(p);
        } else {
          rest.push(p);
        }
      }

      const out = [];
      for (const k of keywordSections) {
        const arr = buckets.get(k.key);
        if (!arr?.length) continue;

        out.push(`### ${k.key}`);
        const bullets = arr
          .flatMap((block) =>
            block
              .split(/(?<=[.!?])\s+/)
              .map((x) => x.trim())
              .filter(Boolean)
          )
          .slice(0, 10);

        for (const b of bullets) out.push(`- ${b}`);
        out.push("");
      }

      if (rest.length) {
        out.push("### Summary");
        const bullets = rest
          .join(" ")
          .split(/(?<=[.!?])\s+/)
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 10);
        for (const b of bullets) out.push(`- ${b}`);
      }

      const final = out.join("\n").trim();
      return final || raw;
    }
  }

  // If we have explicit "Heading:" lines, build markdown headings + bullets.
  if (sectionStarts.length) {
    const out = [];
    let curTitle = "";
    let curItems = [];

    const flush = () => {
      if (!curTitle && !curItems.length) return;
      const title = curTitle || "Summary";
      out.push(`### ${title}`);
      const items = curItems.length ? curItems : [];
      if (!items.length) out.push("- (No details provided)");
      else {
        for (const it of items) {
          const s = it.replace(/^(\d+\.|[-•])\s+/, "").trim();
          if (s) out.push(`- ${s}`);
        }
      }
      out.push("");
      curTitle = "";
      curItems = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/^[A-Za-z][A-Za-z\s/&()-]{2,40}:\s*$/.test(line)) {
        flush();
        curTitle = line.replace(/:\s*$/, "").trim();
        continue;
      }

      // normalize numbered/bulleted lines into items; otherwise sentence-split
      if (/^(\d+\.|[-•])\s+/.test(line)) {
        curItems.push(line);
      } else {
        const parts = line
          .split(/(?<=[.!?])\s+/)
          .map((x) => x.trim())
          .filter(Boolean);
        if (parts.length) curItems.push(...parts);
        else curItems.push(line);
      }
    }

    flush();
    const final = out.join("\n").trim();
    return final || raw;
  }

  // Fall back: keep your existing “prettify”, but better bullets
  return raw;
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
          const ListTag = "ul"; // chat always uses unordered lists
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);  

  const [progress, setProgress] = useState(0);
  const progressBarRef = useRef(null);
  const [headerCompact, setHeaderCompact] = useState(false);
  const [metaMoreOpen, setMetaMoreOpen] = useState(false);
  const metaMoreRef = useRef(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const copyMenuRef = useRef(null);

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

  const contextChips = useMemo(() => {
  return buildContextChips(report, preview?.text || gateSourceText || "");
}, [report, preview?.text, gateSourceText]);

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

  useEffect(() => {
  function onKeyDown(e) {
    if (e.key === "Escape") {
      setMetaMoreOpen(false);
      setCopyMenuOpen(false);
    }
  }

  function onPointerDown(e) {
    const m = metaMoreRef.current;
    const c = copyMenuRef.current;

    if (m && !m.contains(e.target)) setMetaMoreOpen(false);
    if (c && !c.contains(e.target)) setCopyMenuOpen(false);
  }

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("pointerdown", onPointerDown);
  return () => {
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("pointerdown", onPointerDown);
  };
}, []);


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
      let reply = autoSectionChatReply(String(replyRaw || ""));
      reply = prettifyChatReplyForUi(reply);     // keep your mild polish
      reply = forceUnorderedBullets(reply);      // ALWAYS enforce unordered bullets

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
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  const lines = raw.split("\n");

  // Known section headings we want to render like your screenshot
  const ALIASES = [
    { key: "TITLE", labels: ["TITLE"] },

    { key: "FACTS", labels: ["FACTS"] },
    { key: "ISSUES", labels: ["ISSUES", "ISSUE"] },
    { key: "HOLDING", labels: ["HOLDING/DECISION", "HOLDING", "DECISION", "HELD", "HOLDING & DECISION"] },
    { key: "REASONING", labels: ["REASONING", "ANALYSIS", "DISCUSSION", "RATIONALE"] },
    { key: "ORDERS", labels: ["ORDERS", "ORDER", "DISPOSITION"] },
    { key: "RULE", labels: ["RULE", "RULE OF LAW", "LEGAL PRINCIPLE"] },
    { key: "AUTHORITIES", labels: ["AUTHORITIES", "CASES CITED", "CITED CASES", "STATUTES", "STATUTES CITED"] },
  ];

  const normLabel = (s) =>
    String(s || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/:$/, "")
      .toUpperCase();

  const labelToKey = new Map();
  for (const a of ALIASES) for (const l of a.labels) labelToKey.set(normLabel(l), a.key);

  const looksLikeHeader = (line) => {
    const t = normLabel(line);
    // matches "FACTS:" or "FACTS"
    if (labelToKey.has(t)) return true;
    // matches "FACTS:" where t already stripped, also allow A-Z headings ending with :
    if (/^[A-Z][A-Z0-9\s/()-]{2,}:$/.test(String(line || "").trim())) return true;
    return false;
  };

  const cleanItem = (s) => String(s || "").replace(/^[-•]\s+/, "").replace(/^\d+\.\s+/, "").trim();

  const sections = [];
  let caseTitle = "";
  let cur = null;

  const pushCur = () => {
    if (!cur) return;

    // turn long lines into bullets if needed
    const items = (cur.items || [])
      .map((x) => cleanItem(x))
      .filter(Boolean);

    // If we got only 1 mega sentence, split by punctuation into bullets (keeps your neat list style)
    let finalItems = items;
    if (items.length === 1 && items[0].length > 140) {
      const parts = items[0]
        .split(/(?<=[.!?])\s+/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (parts.length >= 2) finalItems = parts;
    }

    if (finalItems.length) sections.push({ key: cur.key, title: cur.title, items: finalItems });
    cur = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // capture "TITLE: something"
    const mTitle = line.match(/^TITLE\s*:\s*(.+)$/i);
    if (mTitle?.[1]) {
      caseTitle = mTitle[1].trim();
      continue;
    }

    // capture headers like "FACTS:" or "FACTS"
    if (looksLikeHeader(line)) {
      pushCur();

      const label = normLabel(line);
      const key = labelToKey.get(label) || labelToKey.get(label.replace(/:$/, "")) || label;

      cur = { key, title: label.replace(/:$/, ""), items: [] };
      continue;
    }

    // If we haven't started a section yet, treat as TITLE if it looks like a case name
    if (!cur && !caseTitle && line.length < 180 && / v /i.test(line)) {
      caseTitle = line;
      continue;
    }

    if (!cur) {
      // fallback: everything becomes SUMMARY if no explicit headings exist
      cur = { key: "SUMMARY", title: "SUMMARY", items: [] };
    }

    cur.items.push(line);
  }

  pushCur();

  // Merge duplicates by key + de-dupe items
  const merged = new Map();
  for (const s of sections) {
    const k = String(s.key || s.title || "SUMMARY").toUpperCase();
    if (!merged.has(k)) merged.set(k, { key: k, title: s.title, items: [] });
    merged.get(k).items.push(...(s.items || []));
  }

  const deduped = Array.from(merged.values()).map((s) => {
    const seen = new Set();
    const out = [];
    for (const it of s.items || []) {
      const kk = cleanItem(it).toLowerCase();
      if (!kk || seen.has(kk)) continue;
      seen.add(kk);
      out.push(it);
    }
    return { ...s, items: out };
  });

  // Preferred order (matches your screenshot vibe)
  const ORDER = ["FACTS", "ISSUES", "HOLDING", "REASONING", "ORDERS", "RULE", "AUTHORITIES", "SUMMARY"];
  deduped.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

  return { caseTitle, sections: deduped };
}

    const aiShellClass = `lrrAi lrrAi--premium ${compact ? "isCompact" : ""}`;
    const aiStatus = getAiStatus({
        aiBusy,
        aiTab,
        aiLastAction,
        summaryMeta,
        summaryText,
      });


    return (
      <div className={aiShellClass}>
      <div className="lrrAiHead">
        <div className="lrrAiHeadLeft">
          <div className="lrrAiTitleRow">
            <div className="lrrAiTitle">LegalAI</div>

            <span className={`lrrAiStatus ${aiStatus.tone}`} title={aiStatus.label}>
              <span className="dot" aria-hidden="true" />
              <span className="txt">{aiStatus.label}</span>
            </span>
          </div>

          {/* Context chips */}
          {contextChips?.length ? (
            <div className="lrrAiCtxRow" aria-label="Case context">
              {contextChips.map((c, i) => (
                <span key={i} className={`lrrAiCtxChip ${c.tone}`} title={c.label}>
                  {c.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="lrrAiHeadRight">
          {aiTab === "summary" ? (
            <div className="lrrAiHeadActions">
              <button
                type="button"
                className="lrrAiIconBtn"
                disabled={aiBusy || !hasSomeSummary}
                onClick={() => copyText(summaryText)}
                title="Copy summary"
                aria-label="Copy summary"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 9h10v10H9z" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>
                <span className="txt">Copy</span>
              </button>

              <button
                type="button"
                className="lrrAiIconBtn"
                disabled={aiBusy || !hasSomeSummary}
                onClick={() => copyText(bulletsFromText(summaryText))}
                title="Copy as bullets"
                aria-label="Copy as bullets"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M8 7h13M8 12h13M8 17h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <span className="txt">Bullets</span>
              </button>

              <span className="lrrAiHeadSep" aria-hidden="true" />

              <button type="button" className="lrrAiIconBtn" onClick={aiNewSummary} title="New summary" aria-label="New summary">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span className="txt">New</span>
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
                  // --- helpers (no hooks) ---
                  function cleanItemsFromBlock(block) {
                    const t = String(block || "").replace(/\r\n/g, "\n").trim();
                    if (!t) return [];

                    const lines = t
                      .split("\n")
                      .map((x) => x.trim())
                      .filter(Boolean);

                    const hasBullets = lines.some((l) => /^([-•]|\d+\.)\s+/.test(l));
                    if (hasBullets) {
                      return lines
                        .map((l) => l.replace(/^([-•]|\d+\.)\s+/, "").trim())
                        .filter(Boolean);
                    }

                    const parts = t
                      .split(/(?<=[.!?])\s+/)
                      .map((x) => x.trim())
                      .filter(Boolean);

                    if (parts.length > 12) return parts.slice(0, 12);
                    return parts.length ? parts : [t];
                  }

                  function splitBasicSummary(text) {
                    const raw = String(text || "").replace(/\r\n/g, "\n").trim();
                    if (!raw) return { summaryBlock: "", keyPointsBlock: "" };

                    const re = /\n\s*(key\s*points|key\s*takeaways|highlights)\s*:\s*\n?/i;
                    const m = raw.match(re);

                    if (!m) {
                      const reInline = /(key\s*points|key\s*takeaways|highlights)\s*:\s*/i;
                      const idxInline = raw.search(reInline);
                      if (idxInline >= 0) {
                        const before = raw.slice(0, idxInline).trim();
                        const after = raw.slice(idxInline).replace(reInline, "").trim();
                        return { summaryBlock: before, keyPointsBlock: after };
                      }
                      return { summaryBlock: raw, keyPointsBlock: "" };
                    }

                    const idx = m.index ?? -1;
                    if (idx < 0) return { summaryBlock: raw, keyPointsBlock: "" };

                    const summaryBlock = raw.slice(0, idx).trim();
                    const keyPointsBlock = raw.slice(idx).replace(re, "").trim();
                    return { summaryBlock, keyPointsBlock };
                  }

                  const parsed = parseSectionedSummary(summaryText);
                  const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];

                  const toneFor = (s) => {
                    const t = String(s?.title || s?.key || "").toUpperCase();
                    if (t.includes("FACT")) return "facts";
                    if (t.includes("ISSUE")) return "issues";
                    if (t.includes("HOLD") || t.includes("DECISION") || t.includes("HELD")) return "holding";
                    if (t.includes("REASON") || t.includes("ANALYS") || t.includes("DISCUSS") || t.includes("RATION")) return "reasoning";
                    if (t.includes("ORDER") || t.includes("DISPOSITION")) return "orders";
                    if (t.includes("RULE") || t.includes("PRINCIPLE")) return "rule";
                    if (t.includes("AUTHOR") || t.includes("CITED") || t.includes("STATUTE")) return "authorities";
                    return "summary";
                  };

                  // ✅ EXTENDED: keep your normal parsed section cards
                  if (summaryType === "extended") {
                    return (
                      <div className="lrrAiCaseLayout">
                        {parsed?.caseTitle ? <div className="lrrAiCaseTitle">{parsed.caseTitle}</div> : null}

                        <div className="lrrAiStack">
                          {sections.map((s, idx) => (
                            <section key={`${s?.title || s?.key || "SEC"}_${idx}`} className={`lrrAiSCard lrrAiTone-${toneFor(s)}`}>
                              <div className="lrrAiSHead">
                                <span className="lrrAiSPill">{s?.title || s?.key || "SUMMARY"}</span>
                              </div>

                              <ul className="lrrAiSBullets">
                                {(s?.items || []).map((it, i2) => (
                                  <li key={i2}>{it}</li>
                                ))}
                              </ul>
                            </section>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  // ✅ BASIC: force exactly 2 sections (SUMMARY + KEY POINTS) styled like extended cards
                  const { summaryBlock, keyPointsBlock } = splitBasicSummary(summaryText);
                  const summaryItems = cleanItemsFromBlock(summaryBlock);
                  const keyPointItems = cleanItemsFromBlock(keyPointsBlock);

                  return (
                    <div className="lrrAiCaseLayout">
                      {parsed?.caseTitle ? <div className="lrrAiCaseTitle">{parsed.caseTitle}</div> : null}

                      <div className="lrrAiStack">
                        <section className="lrrAiSCard lrrAiTone-summary">
                          <div className="lrrAiSHead">
                            <span className="lrrAiSPill">SUMMARY</span>
                          </div>
                          <ul className="lrrAiSBullets">
                            {(summaryItems.length ? summaryItems : ["No summary returned."]).map((it, i2) => (
                              <li key={i2}>{it}</li>
                            ))}
                          </ul>
                        </section>

                        <section className="lrrAiSCard lrrAiTone-issues">
                          <div className="lrrAiSHead">
                            <span className="lrrAiSPill">KEY POINTS</span>
                          </div>
                          <ul className="lrrAiSBullets">
                            {(keyPointItems.length ? keyPointItems : ["No key points returned."]).map((it, i2) => (
                              <li key={i2}>{it}</li>
                            ))}
                          </ul>
                        </section>
                      </div>
                    </div>
                  );
                })()}

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
            {(() => {
              const chatMsgs = messages.filter((m) => m?.kind !== "summary" && m?.kind !== "info");
              const hasAny = chatMsgs.length > 0;

              if (!hasAny) {
                return (
                  <div className="lrrAiChatEmpty">
                    <div className="t">Ask LegalAI about this case</div>
                    <div className="s">Try: issues for determination, holding & orders, ratio decidendi, or cited authorities.</div>
                  </div>
                );
              }

              return chatMsgs.map((m) => {
                // keep your existing map body here unchanged
                const isUser = m.role === "user";
                const isTyping = m.kind === "typing";

                return (
                  <div key={m.id} className={`lrrAiMsg ${isUser ? "user" : "assistant"}`}>
                    <div className="bubble">
                      {!isUser && !isTyping ? (
                        <div className="lrrAiMsgActions">
                          <button type="button" className="lrrAiMini" onClick={() => copyText(m.content)} title="Copy">
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
              });
            })()}

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
          <div className="lrr2HeaderLeft">
            <div className="lrr2BrandMark" aria-hidden="true">LA</div>
            <div className="lrr2BrandBlock">
              <div className="lrr2BrandTitle">LawAfrica</div>
              <div className="lrr2BrandSub">Law Reports • Case File (Transcript)</div>
            </div>
          </div>

          <div className="lrr2HeaderRight">
            {/* ⚙️ Reader settings (moved from transcript toolbar) */}
            <div className="lrr2Settings" ref={settingsRef}>
              <button
                type="button"
                className={`lrr2SettingsBtn ${settingsOpen ? "isOpen" : ""}`}
                onClick={() => setSettingsOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={settingsOpen}
                title="Reader settings"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M19.4 13.5a8.2 8.2 0 0 0 .1-1.5 8.2 8.2 0 0 0-.1-1.5l2-1.6-2-3.4-2.4 1a7.9 7.9 0 0 0-2.6-1.5l-.4-2.6H10l-.4 2.6a7.9 7.9 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.6A8.2 8.2 0 0 0 4.5 12c0 .5 0 1 .1 1.5l-2 1.6 2 3.4 2.4-1c.8.6 1.7 1.1 2.6 1.5l.4 2.6h4l.4-2.6c.9-.4 1.8-.9 2.6-1.5l2.4 1 2-3.4-2-1.6Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>

                <span className="txt">Reader settings</span>

                <span className="lrr2SettingsMini">
                  <span className="pill">{Math.round(fontScale * 100)}%</span>
                  <span className="pill">{serif ? "Serif" : "Sans"}</span>
                  <span className="pill">{readingTheme}</span>
                </span>
              </button>

              {settingsOpen ? (
                <div className="lrr2SettingsMenu" role="menu" aria-label="Reader settings menu">
                  <div className="lrr2SettingsGroup">
                    <div className="lrr2SettingsLabel">Text</div>
                    <div className="lrr2SettingsRow">
                      <button
                        type="button"
                        className="lrr2SetBtn"
                        onClick={() => setFontScale((v) => Math.max(0.9, Number((v - 0.05).toFixed(2))))}
                      >
                        A−
                      </button>
                      <button
                        type="button"
                        className="lrr2SetBtn"
                        onClick={() => setFontScale((v) => Math.min(1.2, Number((v + 0.05).toFixed(2))))}
                      >
                        A+
                      </button>

                      <button
                        type="button"
                        className={`lrr2SetBtn ${serif ? "isOn" : ""}`}
                        onClick={() => setSerif((v) => !v)}
                      >
                        Serif
                      </button>
                    </div>
                  </div>

                  <div className="lrr2SettingsGroup">
                    <div className="lrr2SettingsLabel">Theme</div>
                    <div className="lrr2SettingsRow">
                      <button
                        type="button"
                        className={`lrr2SetBtn ${readingTheme === "paper" ? "isOn" : ""}`}
                        onClick={() => setReadingTheme("paper")}
                      >
                        Paper
                      </button>
                      <button
                        type="button"
                        className={`lrr2SetBtn ${readingTheme === "sepia" ? "isOn" : ""}`}
                        onClick={() => setReadingTheme("sepia")}
                      >
                        Sepia
                      </button>
                      <button
                        type="button"
                        className={`lrr2SetBtn ${readingTheme === "dark" ? "isOn" : ""}`}
                        onClick={() => setReadingTheme("dark")}
                      >
                        Dark
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

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
        <div className="lrr2MetaOneRow">
          {/* Left: primary chips (always visible) */}
          <div className="lrr2MetaPrimary">
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

            {isPremium ? (
              <div className="lrr2MetaInlineStatus">
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

          {/* Right: actions */}
          <div className="lrr2MetaActions">
            {/* Copy menu (replaces Copy title + Copy citation pills) */}
            <div className="lrr2Menu" ref={copyMenuRef}>
              <button
                type="button"
                className="lrr2IconBtn"
                title="Copy…"
                aria-haspopup="menu"
                aria-expanded={copyMenuOpen}
                onClick={() => setCopyMenuOpen((v) => !v)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 9h10v10H9z" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>
                <span className="txt">Copy</span>
              </button>

              {copyMenuOpen ? (
                <div className="lrr2MenuPopover" role="menu" aria-label="Copy menu">
                  <button type="button" className="lrr2MenuItem" onClick={() => { navigator.clipboard?.writeText(`${title}`); setCopyMenuOpen(false); }}>
                    Copy title
                  </button>

                  {report?.citation ? (
                    <button type="button" className="lrr2MenuItem" onClick={() => { navigator.clipboard?.writeText(String(report.citation)); setCopyMenuOpen(false); }}>
                      Copy citation
                    </button>
                  ) : null}

                  {report?.caseNumber ? (
                    <button type="button" className="lrr2MenuItem" onClick={() => { navigator.clipboard?.writeText(String(report.caseNumber)); setCopyMenuOpen(false); }}>
                      Copy case number
                    </button>
                  ) : null}

                  {llrNo ? (
                    <button type="button" className="lrr2MenuItem" onClick={() => { navigator.clipboard?.writeText(String(llrNo)); setCopyMenuOpen(false); }}>
                      Copy LLR number
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* More (⋯) overflow menu */}
            <div className="lrr2Menu" ref={metaMoreRef}>
              <button
                type="button"
                className="lrr2IconBtn ghost"
                title="More details"
                aria-haspopup="menu"
                aria-expanded={metaMoreOpen}
                onClick={() => setMetaMoreOpen((v) => !v)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12h.01M12 12h.01M19 12h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </button>

              {metaMoreOpen ? (
                <div className="lrr2MenuPopover" role="menu" aria-label="Case details">
                  {report.caseNumber ? (
                    <div className="lrr2MenuMetaRow">
                      <div className="k">Case No.</div>
                      <div className="v">{report.caseNumber}</div>
                    </div>
                  ) : null}

                  {report.decisionTypeLabel ? (
                    <div className="lrr2MenuMetaRow">
                      <div className="k">Decision</div>
                      <div className="v">{report.decisionTypeLabel}</div>
                    </div>
                  ) : null}

                  {report.judges ? (
                    <div className="lrr2MenuMetaRow">
                      <div className="k">Judge(s)</div>
                      <div className="v">{report.judges}</div>
                    </div>
                  ) : null}

                  {report.country ? (
                    <div className="lrr2MenuMetaRow">
                      <div className="k">Country</div>
                      <div className="v">{report.country}</div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

      </div>
      
      <div className="lrr2SegTabs" role="tablist" aria-label="Reader tabs">
        <button
          type="button"
          role="tab"
          aria-selected={view === "content"}
          className={`lrr2SegTab ${view === "content" ? "isActive" : ""}`}
          onClick={() => {
            setView("content");
            setContentOpen(true);
          }}
          title="Transcript"
        >
          Transcript
          {isPremium && !hasFullAccess ? <span className="lrr2SegBadge lock">🔒</span> : null}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={view === "ai"}
          className={`lrr2SegTab ${view === "ai" ? "isActive" : ""} ${aiAllowed ? "" : "isDisabled"}`}
          onClick={() => {
            if (!aiAllowed) return;
            setView("ai");
            setContentOpen(false);
          }}
          title={aiAllowed ? "LegalAI" : "LegalAI (subscribers only)"}
          disabled={!aiAllowed}
        >
          LegalAI <span className="lrr2SegBadge ai">✨</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={view === "split"}
          className={`lrr2SegTab ${view === "split" ? "isActive" : ""}`}
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
          <article className="lrr2Article lrr2PanelShell">
            <div className="lrr2PanelHead">
              <div className="lrr2PanelHeadLeft">
                <div className="lrr2PanelTitle">Transcript</div>
                <div className="lrr2PanelSub">
                  {isPremium && !hasFullAccess ? "Preview mode • Subscribe to unlock full text" : "Full text available"}
                </div>
              </div>

              <div className="lrr2PanelHeadRight">
                {isPremium ? (
                  <AccessStatusChip access={access} isPremium={isPremium} isAdmin={isAdmin} hasFullAccess={hasFullAccess} />
                ) : (
                  <span className="lrr2PanelPill ok">Free</span>
                )}
              </div>
            </div>

            {/* transcript body */}
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
            <aside className="lrr2Aside">
              {aiAllowed ? <LegalAiPanel compact={true} /> : <AiLockedPanel access={access} onGo={goUrl} />}
            </aside>
          </div>
        ) : (
          <article className="lrr2Article">

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
