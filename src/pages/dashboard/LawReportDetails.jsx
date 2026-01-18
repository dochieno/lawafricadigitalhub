// src/pages/dashboard/LawReportDetails.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import { isLawReportDocument } from "../../utils/isLawReportDocument";
import "../../styles/lawReports.css";

function isInstitutionUser() {
  const c = getAuthClaims();
  return !!(c?.institutionId && c.institutionId > 0);
}

function isPublicUser() {
  const c = getAuthClaims();
  const userType = c?.payload?.userType || c?.payload?.UserType || null;
  const inst = c?.institutionId;
  return String(userType).toLowerCase() === "public" && (!inst || inst <= 0);
}

function extractReportMeta(d) {
  const lr =
    d?.lawReport ||
    d?.LawReport ||
    d?.report ||
    d?.Report ||
    d?.reportMeta ||
    d?.ReportMeta ||
    null;

  const pick = (...keys) => {
    for (const k of keys) {
      const v = d?.[k] ?? lr?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  };

  const reportNumber = String(pick("reportNumber", "ReportNumber", "code", "Code")).trim();
  const parties = String(pick("parties", "Parties")).trim();
  const citation = String(pick("citation", "Citation")).trim();
  const courtType = String(pick("courtType", "CourtType", "court", "Court")).trim();
  const town = String(pick("town", "Town")).trim();
  const postCode = String(pick("postCode", "PostCode", "postalCode", "PostalCode")).trim();

  const yearRaw = pick("year", "Year");
  const year = yearRaw ? Number(yearRaw) : NaN;

  const judgmentDateRaw = pick("judgmentDate", "JudgmentDate", "date", "Date");
  const judgmentDate = judgmentDateRaw ? String(judgmentDateRaw) : "";

  // Optional rich fields (if backend sends them)
  const judges = String(pick("judges", "Judges")).trim();
  const decisionType = String(pick("decisionType", "DecisionType")).trim();
  const caseNotes = String(pick("caseNotes", "CaseNotes")).trim();
  const hcRef = String(pick("hcRef", "HcRef", "HCRef")).trim();

  return {
    reportNumber,
    parties,
    citation,
    year: Number.isFinite(year) ? year : null,
    courtType,
    town,
    postCode,
    judgmentDate,
    judges,
    decisionType,
    caseNotes,
    hcRef,
  };
}

export default function LawReportDetails() {
  const { id } = useParams();
  const docId = Number(id);
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  const [hasContent, setHasContent] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await api.get(`/legal-documents/${docId}`);
        const d = res.data;

        if (!isLawReportDocument(d)) {
          // If someone navigates here with a non-report id, push them to standard details
          navigate(`/dashboard/documents/${docId}`, { replace: true });
          return;
        }

        if (!cancelled) setDoc(d);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("We couldn’t load this report. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (Number.isFinite(docId) && docId > 0) load();
    else {
      setError("Invalid report id.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [docId, navigate]);

  // Access + availability checks (same semantics as Explore)
  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!doc) return;

      // Availability
      try {
        setAvailabilityLoading(true);
        const r = await api.get(`/legal-documents/${docId}/availability`);
        const ok = !!r?.data?.hasContent;
        if (!cancelled) setHasContent(ok);
      } catch {
        if (!cancelled) setHasContent(true);
      } finally {
        if (!cancelled) setAvailabilityLoading(false);
      }

      // Access only for premium content and only for Inst/Public users
      if (doc.isPremium && (isInst || isPublic)) {
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
  }, [doc, docId, isInst, isPublic]);

  const meta = useMemo(() => (doc ? extractReportMeta(doc) : null), [doc]);

  const hasFullAccess = !!access?.hasFullAccess;
  const canReadNow = !!doc && hasContent && (!doc.isPremium || hasFullAccess);

  if (loading) return <div className="lr-wrap"><div className="lr-loading">Loading report…</div></div>;

  if (error) {
    return (
      <div className="lr-wrap">
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

  if (!doc) return null;

  return (
    <div className="lr-wrap">
      <div className="lr-header">
        <div className="lr-title">
          <h1>{meta?.parties || doc.title || "Law Report"}</h1>
          <p>
            {meta?.reportNumber ? <span className="lr-tag" style={{ marginRight: 8 }}>{meta.reportNumber}</span> : null}
            {meta?.citation ? <span className="lr-tag" style={{ marginRight: 8 }}>{meta.citation}</span> : null}
            {meta?.year ? <span className="lr-tag" style={{ marginRight: 8 }}>{meta.year}</span> : null}
            {meta?.courtType ? <span className="lr-tag" style={{ marginRight: 8 }}>{meta.courtType}</span> : null}
            {meta?.town ? <span className="lr-tag" style={{ marginRight: 8 }}>{meta.town}</span> : null}
            {!meta?.town && meta?.postCode ? <span className="lr-tag" style={{ marginRight: 8 }}>{meta.postCode}</span> : null}
          </p>
        </div>

        <div className="lr-actions">
          <button className="lr-pill" onClick={() => navigate("/dashboard/law-reports")}>
            ← Back
          </button>
          <button
            className="lr-pill"
            onClick={() => navigate(`/dashboard/documents/${docId}`)}
            title="Opens the standard document page (pricing/subscription/preview)"
          >
            Open document page
          </button>
        </div>
      </div>

      <div className="lr-grid" style={{ gridTemplateColumns: "1fr" }}>
        <section className="lr-results">
          <div className="lr-results-top">
            <div className="lr-count">
              {doc.isPremium ? "Premium report" : "Free report"}
              {accessLoading ? " • Checking access…" : doc.isPremium && (isInst || isPublic) && hasFullAccess ? " • Included" : ""}
              {availabilityLoading ? " • Checking availability…" : !hasContent ? " • Coming soon" : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              className="lr-btn"
              disabled={availabilityLoading || accessLoading || !canReadNow}
              title={!hasContent ? "Coming soon" : doc.isPremium && !hasFullAccess ? "Access required" : ""}
              onClick={() => {
                if (!hasContent) return;
                if (doc.isPremium && !hasFullAccess) {
                  navigate(`/dashboard/documents/${docId}`);
                  return;
                }
                navigate(`/dashboard/documents/${docId}/read`);
              }}
              style={{ maxWidth: 220 }}
            >
              {availabilityLoading || accessLoading ? "Checking…" : "Read report"}
            </button>

            <button
              className="lr-btn secondary"
              onClick={() => navigate(`/dashboard/documents/${docId}`)}
              style={{ maxWidth: 220 }}
            >
              View / Preview
            </button>
          </div>

          {/* Metadata section (shows what is available) */}
          <div className="lr-list" style={{ gap: 12 }}>
            <div className="lr-card" style={{ cursor: "default", gridTemplateColumns: "1fr" }}>
              <div>
                <h3 className="lr-card-title" style={{ marginBottom: 8 }}>Report details</h3>
                <div className="lr-meta">
                  {meta?.judgmentDate ? <span className="lr-tag">Judgment date: {meta.judgmentDate}</span> : null}
                  {meta?.decisionType ? <span className="lr-tag">Decision: {meta.decisionType}</span> : null}
                  {meta?.hcRef ? <span className="lr-tag">HC Ref: {meta.hcRef}</span> : null}
                  {meta?.judges ? <span className="lr-tag">Judges: {meta.judges}</span> : null}
                </div>

                {meta?.caseNotes ? (
                  <div style={{ marginTop: 10, color: "#374151", lineHeight: 1.5 }}>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Case notes</div>
                    <div>{meta.caseNotes}</div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, color: "#6b7280" }}>
                    This report’s extended metadata will appear here once the API returns it (ReportNumber, Parties, Citation, etc. are already supported).
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
