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

// Read both camelCase + PascalCase safely
function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function cleanText(t) {
  const s = String(t || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!s) return "";
  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function formatIsoDate(d) {
  if (!d) return "";
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export default function LawReportDetails() {
  const { id } = useParams();
  const reportId = Number(id); // ✅ this route param is LawReport.Id
  const navigate = useNavigate();

  const [report, setReport] = useState(null); // LawReportDto
  const [doc, setDoc] = useState(null); // LegalDocument (for isPremium + fallback fields)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  const [hasContent, setHasContent] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();

  // ------------------------------------------------------------
  // 1) Load LawReportDto from /api/law-reports/{id}
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await api.get(`/law-reports/${reportId}`);
        const r = res.data;

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

  // ------------------------------------------------------------
  // 2) Load parent LegalDocument (needed for isPremium)
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadDoc() {
      if (!report) return;

      const docId = pick(report, "legalDocumentId", "LegalDocumentId");
      if (!docId) return;

      try {
        const res = await api.get(`/legal-documents/${docId}`);
        if (!cancelled) setDoc(res.data ?? null);
      } catch {
        if (!cancelled) setDoc(null);
      }
    }

    loadDoc();
    return () => {
      cancelled = true;
    };
  }, [report]);

  // ------------------------------------------------------------
  // 3) Availability + access checks (by LegalDocumentId)
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!report) return;

      const docId = pick(report, "legalDocumentId", "LegalDocumentId");
      if (!docId) return;

      // Availability
      try {
        setAvailabilityLoading(true);
        const r = await api.get(`/legal-documents/${docId}/availability`);
        const ok = !!r?.data?.hasContent;
        if (!cancelled) setHasContent(ok);
      } catch {
        if (!cancelled) setHasContent(true); // fail-open
      } finally {
        if (!cancelled) setAvailabilityLoading(false);
      }

      // Premium detection (from LegalDocument, since LawReportDto doesn't include isPremium)
      const isPremium = !!pick(doc, "isPremium", "IsPremium");

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
      } else {
        if (!cancelled) setAccess(null);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [report, doc, isInst, isPublic]);

  // ------------------------------------------------------------
  // Derived fields
  // ------------------------------------------------------------
  const docId = useMemo(() => pick(report, "legalDocumentId", "LegalDocumentId") || null, [report]);
  const isPremium = useMemo(() => !!pick(doc, "isPremium", "IsPremium"), [doc]);

  const hasFullAccess = !!access?.hasFullAccess;
  const canSeeFullText = !!report && hasContent && (!isPremium || hasFullAccess);

  const title = useMemo(() => {
    const parties = pick(report, "parties", "Parties");
    const t = pick(report, "title", "Title");
    return parties || t || "Law Report";
  }, [report]);

  const tags = useMemo(() => {
    if (!report) return [];
    const out = [];

    const reportNumber = pick(report, "reportNumber", "ReportNumber");
    const citation = pick(report, "citation", "Citation");
    const year = pick(report, "year", "Year");

    const caseTypeLabel = pick(report, "caseTypeLabel", "CaseTypeLabel");
    const decisionTypeLabel = pick(report, "decisionTypeLabel", "DecisionTypeLabel");
    const courtTypeLabel = pick(report, "courtTypeLabel", "CourtTypeLabel");

    const town = pick(report, "town", "Town");
    const townPostCode = pick(report, "townPostCode", "TownPostCode");

    if (reportNumber) out.push(reportNumber);
    if (citation) out.push(citation);
    if (year) out.push(String(year));
    if (caseTypeLabel) out.push(caseTypeLabel);
    if (decisionTypeLabel) out.push(decisionTypeLabel);
    if (courtTypeLabel) out.push(courtTypeLabel);
    if (town) out.push(town);
    if (!town && townPostCode) out.push(townPostCode);

    return out;
  }, [report]);

  const decisionDate = useMemo(() => formatIsoDate(pick(report, "decisionDate", "DecisionDate")), [report]);
  const judges = useMemo(() => pick(report, "judges", "Judges") || "", [report]);

  const fullText = useMemo(() => {
    const t = pick(report, "contentText", "ContentText");
    return cleanText(t || "");
  }, [report]);

  if (loading) {
    return (
      <div className="lr-wrap lr-theme">
        <div className="lr-loading">Loading report…</div>
      </div>
    );
  }

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
            <div className="lr-chip">Report</div>
            <h1 className="lr-hero-title" style={{ fontSize: 26 }}>
              {title}
            </h1>

            <div className="lr-tags" style={{ marginTop: 10 }}>
              {tags.map((t) => (
                <span key={t} className="lr-tag">
                  {t}
                </span>
              ))}
            </div>

            <div className="lr-mini" style={{ marginTop: 10 }}>
              {decisionDate ? `Date: ${decisionDate}` : ""}
              {judges ? (decisionDate ? ` • Judges: ${judges}` : `Judges: ${judges}`) : ""}
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

          {docId ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <button
                className="lr-btn"
                disabled={availabilityLoading || accessLoading || !hasContent || (isPremium && !hasFullAccess)}
                title={!hasContent ? "Not available yet" : isPremium && !hasFullAccess ? "Access required" : ""}
                onClick={() => {
                  if (!hasContent) return;
                  if (isPremium && !hasFullAccess) {
                    navigate(`/dashboard/documents/${docId}`);
                    return;
                  }
                  navigate(`/dashboard/documents/${docId}/read`);
                }}
                style={{ maxWidth: 220 }}
              >
                {availabilityLoading || accessLoading ? "Checking…" : "Read in reader"}
              </button>

              <button className="lr-btn secondary" onClick={() => navigate(`/dashboard/documents/${docId}`)} style={{ maxWidth: 220 }}>
                View / Preview
              </button>
            </div>
          ) : null}

          {/* Full content now (formatting enhancements later) */}
          <div className="lr-cards" style={{ gridTemplateColumns: "1fr" }}>
            <article className="lr-card2" style={{ cursor: "default" }}>
              <div className="lr-card2-top">
                <div className="lr-card2-title">Full text</div>
                <div className="lr-badges">
                  {isPremium ? <span className="lr-badge premium">Premium</span> : <span className="lr-badge">Free</span>}
                </div>
              </div>

              {!hasContent && !availabilityLoading ? (
                <div className="lr-excerpt" style={{ marginTop: 10 }}>
                  This report is not available yet.
                </div>
              ) : isPremium && (isInst || isPublic) && !hasFullAccess ? (
                <div className="lr-excerpt" style={{ marginTop: 10 }}>
                  This is a premium report. Open the document page to subscribe or confirm access.
                </div>
              ) : (
                <div
                  className="lr-excerpt"
                  style={{
                    marginTop: 10,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.65,
                  }}
                >
                  {canSeeFullText ? fullText || "No text content found for this report yet." : "Access required to view this report."}
                </div>
              )}
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}
