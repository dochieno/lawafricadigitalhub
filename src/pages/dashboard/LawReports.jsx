// src/pages/dashboard/LawReports.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

/**
 * Robust metadata extraction. Supports several possible shapes depending on backend.
 * We intentionally keep this tolerant so UI doesn't break.
 */
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

  // Some systems have Town/PostCode combined; support both.
  const postCode = String(pick("postCode", "PostCode", "postalCode", "PostalCode")).trim();

  const yearRaw = pick("year", "Year");
  const year = yearRaw ? Number(yearRaw) : NaN;

  const judgmentDateRaw = pick("judgmentDate", "JudgmentDate", "date", "Date");
  const judgmentDate = judgmentDateRaw ? String(judgmentDateRaw) : "";

  return {
    reportNumber,
    parties,
    citation,
    year: Number.isFinite(year) ? year : null,
    courtType,
    town,
    postCode,
    judgmentDate,
  };
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

export default function LawReports() {
  const navigate = useNavigate();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Enrichment: if list endpoint does not include report meta, we fetch details per report
  const [detailsMap, setDetailsMap] = useState({}); // docId -> detail
  const [detailsLoadingIds, setDetailsLoadingIds] = useState(new Set());

  // Access + availability (same rule-set as Explore)
  const [accessMap, setAccessMap] = useState({});
  const [accessLoadingIds, setAccessLoadingIds] = useState(new Set());

  const [availabilityMap, setAvailabilityMap] = useState({});
  const [availabilityLoadingIds, setAvailabilityLoadingIds] = useState(new Set());

  const [toast, setToast] = useState(null);

  // Filters/search/sort
  const [q, setQ] = useState("");
  const [year, setYear] = useState(""); // string
  const [courtType, setCourtType] = useState("");
  const [town, setTown] = useState("");
  const [sortBy, setSortBy] = useState("year_desc");

  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  /**
   * Load reports list.
   * Preferred: GET /law-reports (if you have it)
   * Fallback: GET /legal-documents then filter by isLawReportDocument
   */
  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      try {
        setLoading(true);
        setError("");

        let list = null;

        try {
          const res = await api.get("/law-reports");
          list = res.data || [];
        } catch (e) {
          // Fallback to legal-documents
          if (e?.response?.status !== 404) {
            // If it's not 404, still fall back, but log it.
            console.warn("GET /law-reports failed; falling back to /legal-documents", e);
          }
        }

        if (!list) {
          const res = await api.get("/legal-documents");
          const all = res.data || [];
          list = all.filter(isLawReportDocument);
        }

        if (cancelled) return;

        // Normalize shape: ensure { id, title, ... } exists
        setReports(list);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("We couldn’t load Law Reports right now. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReports();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Enrich report details for items missing key metadata.
   * Uses GET /legal-documents/{id} (same strategy as AdminLLRServices).
   */
  useEffect(() => {
    let cancelled = false;

    async function enrichMissingDetails() {
      if (!reports || reports.length === 0) return;

      // Identify missing meta signals
      const needs = reports
        .map((r) => r?.id)
        .filter(Boolean)
        .filter((id) => {
          if (detailsMap[id]) return false;
          const base = reports.find((x) => x.id === id);
          const meta = extractReportMeta(base);
          const missingCore =
            !meta.reportNumber && !meta.parties && !meta.citation && !meta.courtType && !meta.town && !meta.year;
          return missingCore;
        });

      if (needs.length === 0) return;

      const batchSize = 8;

      for (let i = 0; i < needs.length; i += batchSize) {
        const batch = needs.slice(i, i + batchSize);

        setDetailsLoadingIds((prev) => {
          const s = new Set(prev);
          batch.forEach((x) => s.add(x));
          return s;
        });

        const results = await Promise.allSettled(batch.map((id) => api.get(`/legal-documents/${id}`)));

        if (cancelled) return;

        setDetailsMap((prev) => {
          const next = { ...prev };
          results.forEach((r, idx) => {
            const id = batch[idx];
            next[id] = r.status === "fulfilled" ? r.value?.data ?? null : null;
          });
          return next;
        });

        setDetailsLoadingIds((prev) => {
          const s = new Set(prev);
          batch.forEach((x) => s.delete(x));
          return s;
        });
      }
    }

    enrichMissingDetails();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

  // Merge base + enriched
  const mergedReports = useMemo(() => {
    return (reports || []).map((r) => {
      const enriched = detailsMap[r.id];
      return enriched ? { ...r, ...enriched } : r;
    });
  }, [reports, detailsMap]);

  // Build filter options
  const filterOptions = useMemo(() => {
    const years = new Set();
    const courts = new Set();
    const towns = new Set();

    for (const r of mergedReports) {
      const meta = extractReportMeta(r);
      if (meta.year) years.add(meta.year);
      if (meta.courtType) courts.add(meta.courtType);
      if (meta.town) towns.add(meta.town);
      // Allow Town/PostCode combined discovery
      if (meta.postCode) towns.add(meta.postCode);
    }

    const yearsArr = Array.from(years).sort((a, b) => b - a);
    const courtsArr = Array.from(courts).sort((a, b) => String(a).localeCompare(String(b)));
    const townsArr = Array.from(towns).sort((a, b) => String(a).localeCompare(String(b)));

    return { yearsArr, courtsArr, townsArr };
  }, [mergedReports]);

  // Apply search + filters + sort
  const visible = useMemo(() => {
    const query = normalize(q);
    const yearNum = year ? Number(year) : null;
    const courtNorm = normalize(courtType);
    const townNorm = normalize(town);

    let items = mergedReports.filter((r) => {
      const meta = extractReportMeta(r);

      // Search across: ReportNumber, Parties, Citation, Year, CourtType, Town/PostCode (+title)
      const haystack = [
        r.title,
        meta.reportNumber,
        meta.parties,
        meta.citation,
        meta.year ? String(meta.year) : "",
        meta.courtType,
        meta.town,
        meta.postCode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesQuery = !query || haystack.includes(query);
      const matchesYear = !yearNum || meta.year === yearNum;
      const matchesCourt = !courtNorm || normalize(meta.courtType) === courtNorm;
      const matchesTown =
        !townNorm ||
        normalize(meta.town) === townNorm ||
        normalize(meta.postCode) === townNorm;

      return matchesQuery && matchesYear && matchesCourt && matchesTown;
    });

    // Sorting
    const getYear = (r) => extractReportMeta(r).year ?? -1;
    const getReportNo = (r) => extractReportMeta(r).reportNumber || r.title || "";
    const getParties = (r) => extractReportMeta(r).parties || r.title || "";
    const getDate = (r) => {
      const raw = extractReportMeta(r).judgmentDate;
      const t = raw ? Date.parse(raw) : NaN;
      return Number.isFinite(t) ? t : -1;
    };

    if (sortBy === "year_asc") items.sort((a, b) => getYear(a) - getYear(b));
    else if (sortBy === "year_desc") items.sort((a, b) => getYear(b) - getYear(a));
    else if (sortBy === "reportno_asc") items.sort((a, b) => String(getReportNo(a)).localeCompare(String(getReportNo(b))));
    else if (sortBy === "parties_asc") items.sort((a, b) => String(getParties(a)).localeCompare(String(getParties(b))));
    else if (sortBy === "date_desc") items.sort((a, b) => getDate(b) - getDate(a));

    return items;
  }, [mergedReports, q, year, courtType, town, sortBy]);

  // Fetch access for visible premium docs (institution/public)
  useEffect(() => {
    let cancelled = false;

    async function fetchAccessForVisiblePremiumReports() {
      if (!isInst && !isPublic) return;

      const premiumIds = visible.filter((d) => d.isPremium).map((d) => d.id);
      const missing = premiumIds.filter((id) => accessMap[id] == null);
      if (missing.length === 0) return;

      const batchSize = 8;

      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize);

        setAccessLoadingIds((prev) => {
          const s = new Set(prev);
          batch.forEach((x) => s.add(x));
          return s;
        });

        const results = await Promise.allSettled(
          batch.map((docId) => api.get(`/legal-documents/${docId}/access`))
        );

        if (cancelled) return;

        setAccessMap((prev) => {
          const next = { ...prev };
          results.forEach((r, idx) => {
            const docId = batch[idx];
            next[docId] = r.status === "fulfilled" ? r.value?.data ?? null : null;
          });
          return next;
        });

        setAccessLoadingIds((prev) => {
          const s = new Set(prev);
          batch.forEach((x) => s.delete(x));
          return s;
        });
      }
    }

    fetchAccessForVisiblePremiumReports();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isInst, isPublic]);

  // Fetch availability for visible docs
  useEffect(() => {
    let cancelled = false;

    async function fetchAvailabilityForVisibleReports() {
      const visibleIds = visible.map((d) => d.id);
      const missing = visibleIds.filter((id) => availabilityMap[id] == null);
      if (missing.length === 0) return;

      const batchSize = 10;

      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize);

        setAvailabilityLoadingIds((prev) => {
          const s = new Set(prev);
          batch.forEach((x) => s.add(x));
          return s;
        });

        const results = await Promise.allSettled(
          batch.map((docId) => api.get(`/legal-documents/${docId}/availability`))
        );

        if (cancelled) return;

        setAvailabilityMap((prev) => {
          const next = { ...prev };
          results.forEach((r, idx) => {
            const docId = batch[idx];
            if (r.status === "fulfilled") next[docId] = !!r.value?.data?.hasContent;
            else next[docId] = true; // fallback permissive
          });
          return next;
        });

        setAvailabilityLoadingIds((prev) => {
          const s = new Set(prev);
          batch.forEach((x) => s.delete(x));
          return s;
        });
      }
    }

    fetchAvailabilityForVisibleReports();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function resetFilters() {
    setQ("");
    setYear("");
    setCourtType("");
    setTown("");
    setSortBy("year_desc");
    showToast("Filters cleared");
  }

  return (
    <div className="lr-wrap">
      {toast && <div className={`lr-toast ${toast.type === "error" ? "error" : ""}`}>{toast.message}</div>}

      <div className="lr-header">
        <div className="lr-title">
          <h1>Law Reports</h1>
          <p>
            Find case law faster with structured filters and a dedicated Law Reports library.
            Reports are intentionally separated from the general catalog and your library.
          </p>
        </div>

        <div className="lr-actions">
          <button className="lr-pill" onClick={() => navigate("/dashboard/explore")}>
            Explore Publications
          </button>
        </div>
      </div>

      {loading && <div className="lr-loading">Loading Law Reports…</div>}

      {!loading && error && (
        <div className="lr-results">
          <div className="lr-empty">
            <strong>Law Reports unavailable</strong>
            <div style={{ marginTop: 6 }}>{error}</div>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="lr-grid">
          {/* Filters */}
          <aside className="lr-panel">
            <h3>Filter & Search</h3>

            <div className="lr-field">
              <div className="lr-label">Search</div>
              <input
                className="lr-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Report number, parties, citation, year, court, town/post code…"
              />
            </div>

            <div className="lr-row">
              <div className="lr-field">
                <div className="lr-label">Year</div>
                <select className="lr-select" value={year} onChange={(e) => setYear(e.target.value)}>
                  <option value="">All</option>
                  {filterOptions.yearsArr.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lr-field">
                <div className="lr-label">Sort</div>
                <select className="lr-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="year_desc">Year (new → old)</option>
                  <option value="year_asc">Year (old → new)</option>
                  <option value="date_desc">Judgment date (new → old)</option>
                  <option value="reportno_asc">Report number (A → Z)</option>
                  <option value="parties_asc">Parties (A → Z)</option>
                </select>
              </div>
            </div>

            <div className="lr-field">
              <div className="lr-label">Court Type</div>
              <select className="lr-select" value={courtType} onChange={(e) => setCourtType(e.target.value)}>
                <option value="">All</option>
                {filterOptions.courtsArr.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="lr-field">
              <div className="lr-label">Town / Post Code</div>
              <select className="lr-select" value={town} onChange={(e) => setTown(e.target.value)}>
                <option value="">All</option>
                {filterOptions.townsArr.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="lr-panel-actions">
              <button className="lr-btn secondary" onClick={resetFilters}>
                Clear
              </button>
              <button
                className="lr-btn"
                onClick={() => showToast("Tip: use parties + year for fastest narrowing")}
              >
                Tip
              </button>
            </div>
          </aside>

          {/* Results */}
          <section className="lr-results">
            <div className="lr-results-top">
              <div className="lr-count">
                Showing <strong>{visible.length}</strong> report{visible.length === 1 ? "" : "s"}
                {detailsLoadingIds.size > 0 ? (
                  <span style={{ marginLeft: 8 }}>• Enriching metadata…</span>
                ) : null}
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="lr-empty">
                <strong>No matching reports</strong>
                <div style={{ marginTop: 6 }}>Try clearing filters or changing your search terms.</div>
              </div>
            ) : (
              <div className="lr-list">
                {visible.map((r) => {
                  const meta = extractReportMeta(r);

                  const access = accessMap[r.id];
                  const hasFullAccess = !!access?.hasFullAccess;
                  const accessLoading = accessLoadingIds.has(r.id);

                  const hasContent = availabilityMap[r.id] == null ? true : !!availabilityMap[r.id];
                  const availabilityLoading = availabilityLoadingIds.has(r.id);

                  // Same semantics as Explore: premium can be "Included" for institution/public with full access
                  const showIncluded = r.isPremium && (isInst || isPublic) && !accessLoading && hasFullAccess;

                  const showComingSoon = !hasContent && !availabilityLoading;

                  const canReadNow = hasContent && (!r.isPremium || hasFullAccess);

                  return (
                    <div
                      key={r.id}
                      className="lr-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/dashboard/law-reports/${r.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/dashboard/law-reports/${r.id}`);
                        }
                      }}
                    >
                      <div>
                        <h3 className="lr-card-title">
                          {meta.parties || r.title || "Untitled report"}
                        </h3>

                        <div className="lr-meta">
                          {meta.reportNumber ? <span className="lr-tag">{meta.reportNumber}</span> : null}
                          {meta.year ? <span className="lr-tag">{meta.year}</span> : null}
                          {meta.courtType ? <span className="lr-tag">{meta.courtType}</span> : null}
                          {meta.town ? <span className="lr-tag">{meta.town}</span> : null}
                          {!meta.town && meta.postCode ? <span className="lr-tag">{meta.postCode}</span> : null}
                          {meta.citation ? <span className="lr-tag">{meta.citation}</span> : null}
                        </div>
                      </div>

                      <div>
                        <div className="lr-badges">
                          {r.isPremium ? (
                            <span className="lr-badge premium">Premium</span>
                          ) : (
                            <span className="lr-badge">Free</span>
                          )}

                          {showIncluded && <span className="lr-badge included">Included</span>}
                          {showComingSoon && <span className="lr-badge soon">Coming soon</span>}
                        </div>

                        <div className="lr-card-actions" style={{ marginTop: 10 }}>
                          <button
                            className="lr-card-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/dashboard/law-reports/${r.id}`);
                            }}
                          >
                            View details
                          </button>

                          <button
                            className="lr-card-btn primary"
                            disabled={availabilityLoading || accessLoading || !canReadNow}
                            title={!hasContent ? "Coming soon" : r.isPremium && !hasFullAccess ? "Access required" : ""}
                            onClick={(e) => {
                              e.stopPropagation();

                              if (!hasContent) {
                                showToast("This report is marked as coming soon.", "error");
                                return;
                              }

                              // Access rules remain the same:
                              // If premium without access, push to DocumentDetails (existing paywall/subscription UX)
                              if (r.isPremium && !hasFullAccess) {
                                navigate(`/dashboard/documents/${r.id}`);
                                return;
                              }

                              // Otherwise open existing reader flow
                              navigate(`/dashboard/documents/${r.id}/read`);
                            }}
                          >
                            {availabilityLoading || accessLoading ? "Checking…" : "Read"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
