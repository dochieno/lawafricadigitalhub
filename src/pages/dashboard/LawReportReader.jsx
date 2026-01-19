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
      ? rolesRaw.split(",").map((x) => x.trim()).filter(Boolean)
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

function splitIntoBlocks(content) {
  const text = normalizeText(content);
  if (!text.trim()) return [];

  const paras = text.split(/\n{2,}/g);
  const blocks = [];

  for (const p of paras) {
    const raw = p.replace(/\n{3,}/g, "\n\n").trim();
    if (!raw) continue;

    const lines = raw.split("\n");
    if (lines.length > 0 && looksLikeHeading(lines[0])) {
      blocks.push({ type: "heading", text: lines[0].trim() });
      const rest = lines.slice(1).join("\n").trim();
      if (rest) blocks.push({ type: "para", text: rest });
      continue;
    }

    blocks.push({ type: "para", text: raw });
  }

  return blocks;
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 10);
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

  // Availability + access checks (based on LegalDocumentId)
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

  const blocks = useMemo(() => splitIntoBlocks(report?.contentText || ""), [report]);

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
          {report.decisionDate ? <div><strong>Date:</strong> {formatDate(report.decisionDate)}</div> : null}
          {report.judges ? <div><strong>Judges:</strong> {report.judges}</div> : null}
          {report.court ? <div><strong>Court:</strong> {report.court}</div> : null}
          {report.caseNumber ? <div><strong>Case No:</strong> {report.caseNumber}</div> : null}
          {isAdmin ? <div className="lrr-soft">admin access</div> : null}
          {!isAdmin && accessLoading ? <div className="lrr-soft">checking access…</div> : null}
          {!isAdmin && availabilityLoading ? <div className="lrr-soft">checking availability…</div> : null}
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
                  <h2 key={idx} className="lrr-h2">
                    {b.text}
                  </h2>
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
