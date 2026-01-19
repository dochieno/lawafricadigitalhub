// src/pages/dashboard/LawReportDetails.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import "../../styles/lawReports.css";

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

function safeText(v) {
  return String(v || "").trim();
}

function cleanPreview(text) {
  const t = safeText(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!t) return "";
  // keep paragraph breaks, collapse excessive whitespace
  const collapsed = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return collapsed;
}

function makeExcerptFromContent(contentText, max = 520) {
  const t = cleanPreview(contentText).replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + "…";
}

export default function LawReportDetails() {
  const { id } = useParams(); // ✅ this is LawReportId now
  const reportId = Number(id);

  const navigate = useNavigate();

  const [report, setReport] = useState(null); // LawReportDto
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // derived doc id (LegalDocumentId) used for access + availability + reader routes
  const docId = report?.legalDocumentId ?? report?.LegalDocumentId ?? null;

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  const [hasContent, setHasContent] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();

  // ---------------------------
  // Load report by LawReportId
  // ---------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        // ✅ NEW SOURCE OF TRUTH: law report endpoint
        const res = await api.get(`/law-reports/${reportId}`);
        const r = res.data;

        // Basic guard: must have LegalDocumentId
        const ld = r?.legalDocumentId ?? r?.LegalDocumentId;
        if (!ld || ld <= 0) {
          throw new Error("Invalid report payload (missing LegalDocumentId).");
        }

        if (!cancelled) setReport(r);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("We couldn’t load this report. Please try again.");
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

  // ---------------------------
  // Availability + access checks (by LegalDocumentId)
  // ---------------------------
  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!docId) return;

      // Availability
      try {
        setAvailabilityLoading(true);
        const r = await api.get(`/legal-documents/${docId}/availability`);
        const ok = !!r?.data?.hasContent;
        if (!cancelled) setHasContent(ok);
      } catch {
        if (!cancelled) setHasContent(true); // fail-open to avoid blocking
      } finally {
        if (!cancelled) setAvailabilityLoading(false);
      }

      // Access for premium
      const isPremium = !!(report?.isPremium ?? report?.IsPremium);
      if (isPremium && (isInst || isPublic)) {
        try {
          setAccessLoading(true);
          const r = await api.get(`/legal-documents/${docId}/access`);
          if (!cancelled) setAccess(r?.data ?? null);
        } catch {
          if (!cancelled) setAccess(null);
        } finally {
          if (!cancelled) setAccessLoading(false);
        }
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [docId, report, isInst, isPublic]);

  // ---------------------------
  // Meta from LawReportDto
  // ---------------------------
  const meta = useMemo(() => {
    if (!report) return null;

    // Normalize casing because some serializers return PascalCase
    const r = report;

    const parties = safeText(r.parties ?? r.Parties);
    const title = safeText(r.title ?? r.Title);
    const reportNumber = safeText(r.reportNumber ?? r.ReportNumber);
    const citation = safeText(r.citation ?? r.Citation);
    const year = Number(r.year ?? r.Year) || null;

    const caseTypeLabel = safeText(r.caseTypeLabel ?? r.CaseTypeLabel);
    const courtTypeLabel = safeText(r.courtTypeLabel ?? r.CourtTypeLabel);
    const town = safeText(r.town ?? r.Town);
    const postCode = safeText(r.townPostCode ?? r.TownPostCode);
    const judges = safeText(r.judges ?? r.Judges);

    const decisionDateRaw = r.decisionDate ?? r.DecisionDate ?? null;
    const judgmentDate = decisionDateRaw ? String(decisionDateRaw).slice(0, 10) : "";

    return {
      parties,
      title,
      reportNumber,
      citation,
      year,
      caseType: caseTypeLabel,
      courtType: courtTypeLabel,
      town,
      postCode,
      judges,
      judgmentDate,
    };
  }, [report]);

  const contentText = useMemo(() => {
    if (!report) return "";
    return report.contentText ?? report.ContentText ?? "";
  }, [report]);

  const excerpt = useMemo(() => makeExcerptFromContent(contentText, 520), [contentText]);

  const isPremium = !!(report?.isPremium ?? report?.IsPremium);
  const hasFullAccess = !!access?.hasFullAccess;
  const canReadNow = !!report && !!docId && hasContent && (!isPremium || hasFullAccess);

  if (loading)
    return (
      <div className="lr-wrap lr-theme">
        <div className="lr-loading">Loading report…</div>
      </div>
    );

  if (error) {
    return (
      <div className="lr-wrap lr-theme">
        <div className="lr-results">
          <div className="lr-empty">
            <strong>Report unavailable</strong>
            <div style={{ marginTop: 6 }}>{error}</div>
            <div style={{ marginTop: 12 }}>
              <button className="lr-btn secondary" onClick={() => navigate("/dashboard/law-reports")}>
                Back to Law Reports
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="lr-wrap lr-theme">
      <div className="lr-hero lr-hero-mini">
        <div className="lr-hero-inner">
          <div className="lr-hero-left">
            <div className="lr-chip">Report details</div>
            <h1 className="lr-hero-title" style={{ fontSize: 26 }}>
              {meta?.parties || meta?.title || "Law Report"}
            </h1>

            <div className="lr-tags" style={{ marginTop: 10 }}>
              {meta?.reportNumber ? <span className="lr-tag">{meta.reportNumber}</span> : null}
              {meta?.citation ? <span className="lr-tag">{meta.citation}</span> : null}
              {meta?.year ? <span className="lr-tag">{meta.year}</span> : null}
              {meta?.caseType ? <span className="lr-tag">{meta.caseType}</span> : null}
              {meta?.courtType ? <span className="lr-tag">{meta.courtType}</span> : null}
              {meta?.town ? <span className="lr-tag">{meta.town}</span> : null}
              {!meta?.town && meta?.postCode ? <span className="lr-tag">{meta.postCode}</span> : null}
            </div>
          </div>

          <div className="lr-hero-right">
            <button className="lr-pill" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back
            </button>

            {docId ? (
              <button className="lr-pill ghost" onClick={() => navigate(`/dashboard/documents/${docId}`)}>
                Document page
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="lr-body">
        <section className="lr-results">
          <div className="lr-results-top">
            <div className="lr-count">
              {isPremium ? "Premium report" : "Free report"}
              {accessLoading ? " • checking access…" : isPremium && (isInst || isPublic) && hasFullAccess ? " • Included" : ""}
              {availabilityLoading ? " • checking availability…" : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              className="lr-btn"
              disabled={availabilityLoading || accessLoading || !canReadNow}
              title={!hasContent ? "Not available yet" : isPremium && !hasFullAccess ? "Access required" : ""}
              onClick={() => {
                if (!docId || !hasContent) return;
                if (isPremium && !hasFullAccess) {
                  navigate(`/dashboard/documents/${docId}`);
                  return;
                }
                navigate(`/dashboard/documents/${docId}/read`);
              }}
              style={{ maxWidth: 220 }}
            >
              {availabilityLoading || accessLoading ? "Checking…" : "Read report"}
            </button>

            {docId ? (
              <button className="lr-btn secondary" onClick={() => navigate(`/dashboard/documents/${docId}`)} style={{ maxWidth: 220 }}>
                View / Preview
              </button>
            ) : null}
          </div>

          <div className="lr-cards" style={{ gridTemplateColumns: "1fr" }}>
            <article className="lr-card2" style={{ cursor: "default" }}>
              <div className="lr-card2-top">
                <div className="lr-card2-title">Quick preview</div>
                <div className="lr-badges">
                  {isPremium ? <span className="lr-badge premium">Premium</span> : <span className="lr-badge">Free</span>}
                </div>
              </div>

              <div className="lr-mini">
                {meta?.judgmentDate ? `Judgment date: ${meta.judgmentDate}` : ""}
                {meta?.judges ? (meta?.judgmentDate ? ` • Judges: ${meta.judges}` : `Judges: ${meta.judges}`) : ""}
              </div>

              <div className="lr-excerpt" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                {excerpt || "Preview will appear here once the report content is available."}
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}
