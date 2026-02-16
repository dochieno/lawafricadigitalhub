// =======================================================
// FILE: src/pages/dashboard/LawReportReportView.jsx
// Purpose: Optional "Report View" (print-like formatted transcript)
// Notes:
// - Uses SAME endpoints + SAME gating policy
// - Minimal toolbar (Back / Print / Download PDF)
// =======================================================

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import "../../styles/lawReportReportView.css";

/* -------- helpers (same as workspace, small subset) -------- */
function unwrapApi(res) {
  const d = res?.data;
  return d?.data ?? d;
}
function getApiErrorMessage(err, fallback = "Request failed.") {
  const data = err?.response?.data;
  if (data && typeof data === "object") {
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;
    if (data.errors && typeof data.errors === "object") {
      const k = Object.keys(data.errors)[0];
      const first = k ? data.errors[k]?.[0] : null;
      if (first) return first;
    }
    if (typeof data.detail === "string") return data.detail;
  }
  if (typeof err?.message === "string") return err.message;
  return fallback;
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
      ? rolesRaw.split(",").map((x) => x.trim()).filter(Boolean)
      : [];
  const norm = roles.map((r) => String(r).toLowerCase());
  return norm.includes("admin") || norm.includes("globaladmin") || norm.includes("superadmin");
}
function pickFirstNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
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
    return t.split(/\n\s*\n+/).map((p) => p.replace(/\n+/g, " ").trim()).filter(Boolean);
  }
  return t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}
function isLikelyHeadingParagraph(p) {
  const s = String(p || "").trim();
  if (s.length <= 44 && /^[A-Z\s]+$/.test(s) && /[A-Z]/.test(s)) return true;
  if (s.length <= 44 && /^(Judgment|Introduction|Background|Facts|Issues?|Held|Analysis|Determination|Orders?|Conclusion)\b/.test(s))
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

/* PDF download (same endpoint) */
function getFilenameFromContentDisposition(cd) {
  const raw = String(cd || "");
  if (!raw) return "";
  const m5987 = raw.match(/filename\*\s*=\s*([^']*)''([^;]+)/i);
  if (m5987?.[2]) {
    try { return decodeURIComponent(m5987[2].trim().replace(/^"|"$/g, "")); }
    catch { return m5987[2].trim().replace(/^"|"$/g, ""); }
  }
  const m = raw.match(/filename\s*=\s*("?)([^";]+)\1/i);
  if (m?.[2]) return m[2].trim();
  return "";
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

export default function LawReportReportView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reportId = useMemo(() => Number(id), [id]);

  const isAdmin = isGlobalAdminUser();

  const [report, setReport] = useState(null);
  const [access, setAccess] = useState(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState("");

  const isPremium = useMemo(() => {
    if (!report) return false;
    const v = report?.isPremium ?? report?.IsPremium;
    if (v === true) return true;
    const lvl = String(report?.accessLevel || report?.AccessLevel || "").toLowerCase();
    if (lvl === "previewonly") return true;
    const blocked = report?.isBlocked ?? report?.IsBlocked;
    if (blocked === true) return true;
    return false;
  }, [report]);

  const hasFullAccess = useMemo(() => (isAdmin ? true : getHasFullAccess(access)), [access, isAdmin]);

  const rawContent = useMemo(() => String(report?.contentText || ""), [report?.contentText]);

  const gateSourceText = useMemo(() => {
    if (!rawContent) return "";
    const base = isProbablyHtml(rawContent) ? htmlToText(rawContent) : rawContent;
    return decodeHtmlEntities(base);
  }, [rawContent]);

  const previewPolicy = useMemo(() => getAccessPreviewPolicy(access), [access]);

  const previewText = useMemo(() => {
    const textHasContent = !!rawContent.trim();
    if (!isPremium || !textHasContent || hasFullAccess) {
      const renderHtml = isProbablyHtml(rawContent);
      return renderHtml ? decodeHtmlEntities(htmlToText(rawContent)) : decodeHtmlEntities(rawContent);
    }

    const paras = splitIntoParagraphs(gateSourceText);
    const maxParas = previewPolicy.maxParas;
    const maxChars = previewPolicy.maxChars;

    let out = "";
    let reached = false;

    if (paras.length) {
      const slice = paras.slice(0, Math.max(1, maxParas));
      out = slice.join("\n\n");
      if (paras.length > maxParas) reached = true;
    } else {
      out = normalizeText(gateSourceText);
    }

    if (out.length > maxChars) {
      out = out.slice(0, maxChars).trimEnd();
      reached = true;
    }

    return reached ? `${out}\n\n[Preview limit reached — subscribe to unlock full transcript.]` : out;
  }, [isPremium, hasFullAccess, rawContent, gateSourceText, previewPolicy]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setErr("");

        const res = await api.get(`/law-reports/${reportId}`);
        const payload = unwrapApi(res);
        if (cancelled) return;
        setReport(payload ?? null);

        // access (only if premium and has legalDocumentId)
        const legalDocumentId = payload?.legalDocumentId;
        if (!isAdmin && legalDocumentId) {
          try {
            const a = await api.get(`/legal-documents/${legalDocumentId}/access`);
            if (!cancelled) setAccess(unwrapApi(a) ?? null);
          } catch {
            if (!cancelled) setAccess(null);
          }
        } else if (isAdmin) {
          setAccess({ hasFullAccess: true });
        }
      } catch (e) {
        if (!cancelled) setErr(getApiErrorMessage(e, "We couldn’t load this report."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (Number.isFinite(reportId) && reportId > 0) load();
    else {
      setErr("Invalid report id.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [reportId, isAdmin]);

  async function downloadPdfNow() {
    if (!reportId) return;
    if (isPremium && !hasFullAccess && !isAdmin) return;

    setPdfErr("");
    try {
      setPdfBusy(true);
      const res = await api.get(`/law-reports/${reportId}/attachment/download`, { responseType: "blob" });
      const blob = res?.data;
      if (!blob) throw new Error("No file returned.");

      const cd =
        res?.headers?.["content-disposition"] ||
        res?.headers?.["Content-Disposition"] ||
        "";

      const name = getFilenameFromContentDisposition(cd) || `LawAfrica_LawReport_${reportId}.pdf`;
      saveBlobToDisk(blob, name);
    } catch (e) {
      setPdfErr(getApiErrorMessage(e, "Failed to download PDF."));
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading) {
    return <div className="lrvWrap"><div className="lrvLoading">Loading report view…</div></div>;
  }

  if (err || !report) {
    return (
      <div className="lrvWrap">
        <div className="lrvError">
          <div className="t">Report unavailable</div>
          <div className="s">{err || "Not found."}</div>
          <button className="lrvBtn" onClick={() => navigate(`/dashboard/law-reports/${reportId}/workspace`)}>
            ← Back to Workspace
          </button>
        </div>
      </div>
    );
  }

  const title = report?.parties || report?.title || "Law Report";
  const caseNo = report?.caseNumber || report?.caseNo || report?.CaseNumber || "";
  const court = report?.court || report?.courtTypeLabel || "";
  const date = report?.decisionDate || "";

  const paras = splitIntoParagraphs(previewText);

  return (
    <div className="lrvWrap">
      <div className="lrvTop">
        <button className="lrvBtn ghost" onClick={() => navigate(`/dashboard/law-reports/${reportId}/workspace`)}>
          ← Workspace
        </button>

        <div className="lrvTopMid">
          <div className="lrvTopTitle">Report View</div>
          <div className="lrvTopSub">Print-friendly formatted transcript</div>
        </div>

        <div className="lrvTopActions">
          <button className="lrvBtn ghost" onClick={() => window.print()}>
            Print
          </button>

          <button className="lrvBtn" disabled={(isPremium && !hasFullAccess && !isAdmin) || pdfBusy} onClick={downloadPdfNow}>
            {pdfBusy ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </div>

      {pdfErr ? <div className="lrvTopErr">{pdfErr}</div> : null}

      <div className="lrvPaper">
        <div className="lrvHeader">
          <div className="h1">{title}</div>
          <div className="meta">
            {caseNo ? <span>{caseNo}</span> : null}
            {court ? <span>• {court}</span> : null}
            {date ? <span>• {String(date).slice(0, 10)}</span> : null}
          </div>

          {isPremium && !hasFullAccess && !isAdmin ? (
            <div className="lrvLock">
              🔒 Preview mode — subscribe to unlock full transcript & PDF download.
              <button className="lrvBtn primary" onClick={() => navigate("/dashboard/law-reports/subscribe")}>
                Subscribe
              </button>
            </div>
          ) : null}
        </div>

        <div className="lrvBody">
          {paras.map((p, idx) => {
            const isH = isLikelyHeadingParagraph(p);
            return isH ? (
              <h3 key={idx} className="lrvH">{p}</h3>
            ) : (
              <p key={idx} className="lrvP">{p}</p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
