// src/pages/dashboard/LawReports.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import { isLawReportDocument } from "../../utils/isLawReportDocument";
import { extractReportMeta, getReportSearchHaystack, normalize } from "../../utils/lawReportMeta";
import { useDebounce } from "../../utils/useDebounce";
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
 * Expected server response formats supported:
 * A) { items: [...], total: 123 }
 * B) { data: [...], total: 123 }
 * C) [ ... ]  (no total)
 */
function parseSearchResponse(payload) {
  if (Array.isArray(payload)) return { items: payload, total: payload.length };

  const items = payload?.items ?? payload?.data ?? payload?.results ?? [];
  const total =
    payload?.total ??
    payload?.count ??
    (Array.isArray(items) ? items.length : 0);

  return { items: Array.isArray(items) ? items : [], total: Number(total) || 0 };
}

// ✅ Case Type enum options (UI labels). Backend is enum; we send string values.
const CASE_TYPES = ["Civil", "Criminal"];

export default function LawReports() {
  const navigate = useNavigate();
  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();

  // Mode: try server search first; fallback to client mode if 404
  const [mode, setMode] = useState("server"); // "server" | "client"
  const searchUnavailableRef = useRef(false);

  // Data
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);

  // Client fallback enrichment
  const [detailsMap, setDetailsMap] = useState({});
  const [detailsLoadingIds, setDetailsLoadingIds] = useState(new Set());

  // Access + availability (same semantics as Explore)
  const [accessMap, setAccessMap] = useState({});
  const [accessLoadingIds, setAccessLoadingIds] = useState(new Set());

  const [availabilityMap, setAvailabilityMap] = useState({});
  const [availabilityLoadingIds, setAvailabilityLoadingIds] = useState(new Set());

  // UX
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [toast, setToast] = useState(null);
  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  // Filters/search/sort
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);

  // Exact field filters (Step 3)
  const [reportNumber, setReportNumber] = useState("");
  const [parties, setParties] = useState("");
  const [citation, setCitation] = useState("");

  const [year, setYear] = useState(""); // string
  const [courtType, setCourtType] = useState("");
  const [townOrPostCode, setTownOrPostCode] = useState("");

  // ✅ NEW: Case Type filter
  const [caseType, setCaseType] = useState(""); // "" | "Civil" | "Criminal"

  const [sortBy, setSortBy] = useState("year_desc");

  // Pagination (server mode)
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [showAdvanced, setShowAdvanced] = useState(false);

  function resetFilters() {
    setQ("");
    setReportNumber("");
    setParties("");
    setCitation("");
    setYear("");
    setCourtType("");
    setTownOrPostCode("");
    setCaseType(""); // ✅ NEW
    setSortBy("year_desc");
    setPage(1);
    showToast("Filters cleared");
  }

  /**
   * SERVER SEARCH (preferred)
   * Endpoint: GET /law-reports/search
   */
  async function tryServerSearch(params) {
    if (searchUnavailableRef.current) return { ok: false, reason: "unavailable" };

    try {
      const res = await api.get("/law-reports/search", { params });
      const { items, total: t } = parseSearchResponse(res.data);
      return { ok: true, items, total: t };
    } catch (e) {
      const status = e?.response?.status;

      // If endpoint doesn't exist -> fallback permanently to client mode
      if (status === 404) {
        searchUnavailableRef.current = true;
        return { ok: false, reason: "404" };
      }

      throw e;
    }
  }

  /**
   * CLIENT FALLBACK load (Step 2 behavior)
   */
  async function loadAllReportsClientFallback() {
    const res = await api.get("/legal-documents");
    const all = res.data || [];
    return all.filter(isLawReportDocument);
  }

  /**
   * Main loader
   */
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError("");

        if (mode === "server") {
          const params = {
            q: debouncedQ?.trim() || undefined,
            reportNumber: reportNumber.trim() || undefined,
            parties: parties.trim() || undefined,
            citation: citation.trim() || undefined,
            year: year ? Number(year) : undefined,
            courtType: courtType || undefined,
            townOrPostCode: townOrPostCode || undefined,

            // ✅ NEW: caseType param
            caseType: caseType || undefined,

            sort: sortBy || "year_desc",
            page,
            pageSize,
          };

          const out = await tryServerSearch(params);

          if (!out.ok) {
            if (out.reason === "404") {
              if (cancelled) return;

              setMode("client");
              setPage(1);

              const list = await loadAllReportsClientFallback();
              if (cancelled) return;

              setReports(list);
              setTotal(list.length);
              return;
            }

            const list = await loadAllReportsClientFallback();
            if (cancelled) return;

            setMode("client");
            setReports(list);
            setTotal(list.length);
            return;
          }

          if (cancelled) return;

          setReports(out.items || []);
          setTotal(out.total || 0);
          return;
        }

        // client mode
        const list = await loadAllReportsClientFallback();
        if (cancelled) return;

        setReports(list);
        setTotal(list.length);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("We couldn’t load Law Reports right now. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    debouncedQ,
    reportNumber,
    parties,
    citation,
    year,
    courtType,
    townOrPostCode,
    caseType, // ✅ NEW
    sortBy,
    page,
  ]);

  /**
   * Client-mode enrichment for missing metadata
   */
  useEffect(() => {
    let cancelled = false;

    async function enrichMissingDetails() {
      if (mode !== "client") return;
      if (!reports || reports.length === 0) return;

      const needs = reports
        .map((r) => r?.id)
        .filter(Boolean)
        .filter((id) => {
          if (detailsMap[id]) return false;
          const base = reports.find((x) => x.id === id);
          const meta = extractReportMeta(base);
          const missingCore =
            !meta.reportNumber &&
            !meta.parties &&
            !meta.citation &&
            !meta.courtType &&
            !meta.town &&
            !meta.postCode &&
            !meta.caseType && // ✅ include CaseType in "has metadata"
            !meta.year;
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

        const results = await Promise.allSettled(
          batch.map((id) => api.get(`/legal-documents/${id}`))
        );

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
  }, [mode, reports, detailsMap]);

  // Merge base + enriched (client mode only)
  const mergedReports = useMemo(() => {
    if (mode !== "client") return reports || [];
    return (reports || []).map((r) => {
      const enriched = detailsMap[r.id];
      return enriched ? { ...r, ...enriched } : r;
    });
  }, [mode, reports, detailsMap]);

  // Client-mode filtering (exact fields)
  const visibleClient = useMemo(() => {
    if (mode !== "client") return mergedReports;

    const query = normalize(debouncedQ);
    const rn = normalize(reportNumber);
    const p = normalize(parties);
    const c = normalize(citation);

    const yearNum = year ? Number(year) : null;
    const courtNorm = normalize(courtType);
    const townNorm = normalize(townOrPostCode);

    // ✅ NEW
    const caseNorm = normalize(caseType);

    let items = mergedReports.filter((r) => {
      const meta = extractReportMeta(r);

      const matchesQ = !query || getReportSearchHaystack(r).includes(query);

      const matchesReportNumber = !rn || normalize(meta.reportNumber).includes(rn);
      const matchesParties = !p || normalize(meta.parties).includes(p);
      const matchesCitation = !c || normalize(meta.citation).includes(c);

      const matchesYear = !yearNum || meta.year === yearNum;
      const matchesCourt = !courtNorm || normalize(meta.courtType) === courtNorm;

      const matchesTown =
        !townNorm ||
        normalize(meta.town) === townNorm ||
        normalize(meta.postCode) === townNorm;

      // ✅ NEW: CaseType exact match
      const matchesCaseType = !caseNorm || normalize(meta.caseType) === caseNorm;

      return (
        matchesQ &&
        matchesReportNumber &&
        matchesParties &&
        matchesCitation &&
        matchesYear &&
        matchesCourt &&
        matchesTown &&
        matchesCaseType
      );
    });

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
    else if (sortBy === "reportno_asc")
      items.sort((a, b) => String(getReportNo(a)).localeCompare(String(getReportNo(b))));
    else if (sortBy === "parties_asc")
      items.sort((a, b) => String(getParties(a)).localeCompare(String(getParties(b))));
    else if (sortBy === "date_desc") items.sort((a, b) => getDate(b) - getDate(a));

    return items;
  }, [
    mode,
    mergedReports,
    debouncedQ,
    reportNumber,
    parties,
    citation,
    year,
    courtType,
    townOrPostCode,
    caseType, // ✅ NEW
    sortBy,
  ]);

  // Single "visible" list regardless of mode
  const visible = mode === "client" ? visibleClient : reports;

  /**
   * Access checks for visible premium docs (unchanged)
   */
  useEffect(() => {
    let cancelled = false;

    async function fetchAccessForVisiblePremiumReports() {
      if (!isInst && !isPublic) return;

      const premiumIds = (visible || []).filter((d) => d.isPremium).map((d) => d.id);
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

  /**
   * Availability checks for visible docs (unchanged)
   */
  useEffect(() => {
    let cancelled = false;

    async function fetchAvailabilityForVisibleReports() {
      const visibleIds = (visible || []).map((d) => d.id);
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
            else next[docId] = true;
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

  const totalPages = useMemo(() => {
    if (mode === "server") return Math.max(1, Math.ceil((total || 0) / pageSize));
    return 1;
  }, [mode, total, pageSize]);

  return (
    <div className="lr-wrap">
      {toast && <div className={`lr-toast ${toast.type === "error" ? "error" : ""}`}>{toast.message}</div>}

      <div className="lr-header">
        <div className="lr-title">
          <h1>Law Reports</h1>
          <p>
            Filter by report number, parties, citation, year, court type, town/post code — and case type.
            {mode === "server" ? " Fast search is enabled." : " Running in fallback mode."}
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
              <div className="lr-label">Quick search (all fields)</div>
              <input
                className="lr-input"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  if (mode === "server") setPage(1);
                }}
                placeholder="Report number, parties, citation, year, court, town/post code…"
              />
            </div>

            <div className="lr-field">
              <button
                className="lr-card-btn"
                onClick={() => setShowAdvanced((v) => !v)}
                style={{ width: "100%" }}
              >
                {showAdvanced ? "Hide" : "Show"} advanced fields
              </button>
            </div>

            {showAdvanced && (
              <>
                <div className="lr-field">
                  <div className="lr-label">Report Number (exact field)</div>
                  <input
                    className="lr-input"
                    value={reportNumber}
                    onChange={(e) => {
                      setReportNumber(e.target.value);
                      if (mode === "server") setPage(1);
                    }}
                    placeholder="e.g. CAR353…"
                  />
                </div>

                <div className="lr-field">
                  <div className="lr-label">Parties (exact field)</div>
                  <input
                    className="lr-input"
                    value={parties}
                    onChange={(e) => {
                      setParties(e.target.value);
                      if (mode === "server") setPage(1);
                    }}
                    placeholder="e.g. Republic v …"
                  />
                </div>

                <div className="lr-field">
                  <div className="lr-label">Citation (exact field)</div>
                  <input
                    className="lr-input"
                    value={citation}
                    onChange={(e) => {
                      setCitation(e.target.value);
                      if (mode === "server") setPage(1);
                    }}
                    placeholder="e.g. [2020] …"
                  />
                </div>
              </>
            )}

            <div className="lr-row">
              <div className="lr-field">
                <div className="lr-label">Year</div>
                <input
                  className="lr-input"
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4));
                    if (mode === "server") setPage(1);
                  }}
                  placeholder="e.g. 2021"
                />
              </div>

              <div className="lr-field">
                <div className="lr-label">Sort</div>
                <select
                  className="lr-select"
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value);
                    if (mode === "server") setPage(1);
                  }}
                >
                  <option value="year_desc">Year (new → old)</option>
                  <option value="year_asc">Year (old → new)</option>
                  <option value="date_desc">Judgment date (new → old)</option>
                  <option value="reportno_asc">Report number (A → Z)</option>
                  <option value="parties_asc">Parties (A → Z)</option>
                </select>
              </div>
            </div>

            {/* ✅ NEW: Case Type */}
            <div className="lr-field">
              <div className="lr-label">Case Type</div>
              <select
                className="lr-select"
                value={caseType}
                onChange={(e) => {
                  setCaseType(e.target.value);
                  if (mode === "server") setPage(1);
                }}
              >
                <option value="">All</option>
                {CASE_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
            </div>

            <div className="lr-field">
              <div className="lr-label">Court Type</div>
              <input
                className="lr-input"
                value={courtType}
                onChange={(e) => {
                  setCourtType(e.target.value);
                  if (mode === "server") setPage(1);
                }}
                placeholder="e.g. Court of Appeal"
              />
            </div>

            <div className="lr-field">
              <div className="lr-label">Town / Post Code</div>
              <input
                className="lr-input"
                value={townOrPostCode}
                onChange={(e) => {
                  setTownOrPostCode(e.target.value);
                  if (mode === "server") setPage(1);
                }}
                placeholder="e.g. Nairobi / 00100"
              />
            </div>

            <div className="lr-panel-actions">
              <button className="lr-btn secondary" onClick={resetFilters}>
                Clear
              </button>
              <button
                className="lr-btn"
                onClick={() => showToast("Tip: use Case Type + Year + Parties")}
              >
                Tip
              </button>
            </div>
          </aside>

          {/* Results */}
          <section className="lr-results">
            <div className="lr-results-top">
              <div className="lr-count">
                {mode === "server" ? (
                  <>
                    Showing <strong>{reports.length}</strong> of{" "}
                    <strong>{total}</strong> report{total === 1 ? "" : "s"} • Page{" "}
                    <strong>{page}</strong>/{totalPages}
                  </>
                ) : (
                  <>
                    Showing <strong>{visible.length}</strong> report{visible.length === 1 ? "" : "s"}
                    {detailsLoadingIds.size > 0 ? <span style={{ marginLeft: 8 }}>• Enriching metadata…</span> : null}
                  </>
                )}
              </div>

              {mode === "server" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="lr-card-btn"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </button>
                  <button
                    className="lr-card-btn"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              )}
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

                          {/* ✅ NEW: Case Type tag */}
                          {meta.caseType ? <span className="lr-tag">{meta.caseType}</span> : null}

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

                              if (r.isPremium && !hasFullAccess) {
                                navigate(`/dashboard/documents/${r.id}`);
                                return;
                              }

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

            {mode === "server" && totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
                <button
                  className="lr-card-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </button>
                <div style={{ alignSelf: "center", color: "#6b7280", fontSize: 13 }}>
                  Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                </div>
                <button
                  className="lr-card-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
