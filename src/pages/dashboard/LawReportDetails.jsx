// src/pages/dashboard/LawReportDetails.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import { isLawReportDocument } from "../../utils/isLawReportDocument";
import { extractReportMeta, makeReportExcerpt } from "../../utils/lawReportMeta";
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

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!doc) return;

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
  const excerpt = useMemo(() => (doc ? makeReportExcerpt(doc, 520) : ""), [doc]);

  const hasFullAccess = !!access?.hasFullAccess;
  const canReadNow = !!doc && hasContent && (!doc.isPremium || hasFullAccess);

  if (loading) return <div className="lr-wrap lr-theme"><div className="lr-loading">Loading report…</div></div>;

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

  if (!doc) return null;

  return (
    <div className="lr-wrap lr-theme">
      <div className="lr-hero lr-hero-mini">
        <div className="lr-hero-inner">
          <div className="lr-hero-left">
            <div className="lr-chip">Report details</div>
            <h1 className="lr-hero-title" style={{ fontSize: 26 }}>
              {meta?.parties || doc.title || "Law Report"}
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
            <button className="lr-pill ghost" onClick={() => navigate(`/dashboard/documents/${docId}`)}>
              Document page
            </button>
          </div>
        </div>
      </div>

      <div className="lr-body">
        <section className="lr-results">
          <div className="lr-results-top">
            <div className="lr-count">
              {doc.isPremium ? "Premium report" : "Free report"}
              {accessLoading ? " • checking access…" : doc.isPremium && (isInst || isPublic) && hasFullAccess ? " • Included" : ""}
              {availabilityLoading ? " • checking availability…" : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              className="lr-btn"
              disabled={availabilityLoading || accessLoading || !canReadNow}
              title={!hasContent ? "Not available yet" : doc.isPremium && !hasFullAccess ? "Access required" : ""}
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

          <div className="lr-cards" style={{ gridTemplateColumns: "1fr" }}>
            <article className="lr-card2" style={{ cursor: "default" }}>
              <div className="lr-card2-top">
                <div className="lr-card2-title">Quick preview</div>
                <div className="lr-badges">
                  {doc.isPremium ? <span className="lr-badge premium">Premium</span> : <span className="lr-badge">Free</span>}
                </div>
              </div>

              <div className="lr-mini">
                {meta?.judgmentDate ? `Judgment date: ${meta.judgmentDate}` : ""}
                {meta?.judges ? (meta?.judgmentDate ? ` • Judges: ${meta.judges}` : `Judges: ${meta.judges}`) : ""}
              </div>

              <div className="lr-excerpt" style={{ marginTop: 10 }}>
                {excerpt || "Preview will appear here once the report content is available."}
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}
