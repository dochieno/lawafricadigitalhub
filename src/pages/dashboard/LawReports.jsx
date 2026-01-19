// src/pages/dashboard/LawReports.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import { isLawReportDocument } from "../../utils/isLawReportDocument";
import {
  extractReportMeta,
  getReportSearchHaystack,
  makeReportMiniHeader,
  normalize,
  REPORT_CASE_TYPES_ALL,
} from "../../utils/lawReportMeta";
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

function parseSearchResponse(payload) {
  // /api/law-reports/search returns: { items, total, page, pageSize }
  if (Array.isArray(payload)) return { items: payload, total: payload.length };

  const items = payload?.items ?? payload?.Items ?? payload?.data ?? payload?.results ?? [];
  const total =
    payload?.total ??
    payload?.Total ??
    payload?.count ??
    (Array.isArray(items) ? items.length : 0);

  return { items: Array.isArray(items) ? items : [], total: Number(total) || 0 };
}

/**
 * Detect server list items from /api/law-reports/search.
 * Your list DTO fields (from controller):
 * Id, LegalDocumentId, Title, IsPremium, ReportNumber, Year, CaseNumber, Citation,
 * CourtType, CourtTypeLabel, DecisionType, DecisionTypeLabel, CaseType, CaseTypeLabel,
 * Court, Town, TownId, TownPostCode, Parties, Judges, DecisionDate, PreviewText
 */
function isLawReportListItem(x) {
  if (!x || typeof x !== "object") return false;
  return (
    typeof x.LegalDocumentId === "number" ||
    typeof x.PreviewText === "string" ||
    typeof x.CaseTypeLabel === "string" ||
    typeof x.ReportNumber === "string"
  );
}

function getDocId(item) {
  // Server mode: LegalDocumentId
  if (isLawReportListItem(item)) return item.LegalDocumentId;
  // Client fallback: LegalDocument.id
  return item?.id;
}

function getReportId(item) {
  // Server mode: Id is LawReportId
  if (isLawReportListItem(item)) return item.Id;
  return null;
}

function getTitle(item) {
  if (isLawReportListItem(item)) {
    return item.Parties || item.Title || "Untitled report";
  }
  const meta = extractReportMeta(item);
  return meta.parties || item.title || "Untitled report";
}

function getTags(item) {
  if (isLawReportListItem(item)) {
    return {
      reportNumber: item.ReportNumber || "",
      year: item.Year || null,
      caseType: item.CaseTypeLabel || "",
      courtType: item.CourtTypeLabel || item.Court || "",
      town: item.Town || "",
      postCode: item.TownPostCode || "",
      citation: item.Citation || "",
      judges: item.Judges || "",
      judgmentDate: item.DecisionDate ? String(item.DecisionDate) : "",
    };
  }

  const meta = extractReportMeta(item);
  return {
    reportNumber: meta.reportNumber || "",
    year: meta.year || null,
    caseType: meta.caseType || "",
    courtType: meta.courtType || "",
    town: meta.town || "",
    postCode: meta.postCode || "",
    citation: meta.citation || "",
    judges: meta.judges || "",
    judgmentDate: meta.judgmentDate || "",
  };
}

function makeExcerpt(item, max = 260) {
  // ✅ Server mode: use PreviewText from list endpoint
  if (isLawReportListItem(item)) {
    const t = String(item.PreviewText || "").replace(/\s+/g, " ").trim();
    if (!t) return "Preview will appear here once the report content is available.";
    if (t.length <= max) return t;
    return t.slice(0, max).trim() + "…";
  }

  // Client fallback: attempt to use extracted meta content
  const meta = extractReportMeta(item);
  const raw = String(meta.content || "").replace(/\s+/g, " ").trim();
  if (!raw) return "Preview will appear here once the report content is available.";
  if (raw.length <= max) return raw;
  return raw.slice(0, max).trim() + "…";
}

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

  // Access + availability (maps keyed by ✅ LegalDocumentId)
  const [accessMap, setAccessMap] = useState({});
  const [accessLoadingIds, setAccessLoadingIds] = useState(new Set());

  const [availabilityMap, setAvailabilityMap] = useState({});
  const [availabilityLoadingIds, setAvailabilityLoadingIds] = useState(new Set());

  // ✅ Case type options from Step 4B (DB distinct endpoint)
  // [{ Value, Label, Count }] (PascalCase as in your code)
  const [caseTypeOptions, setCaseTypeOptions] = useState([]);

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

  const [reportNumber, setReportNumber] = useState("");
  const [parties, setParties] = useState("");
  const [citation, setCitation] = useState("");

  const [year, setYear] = useState("");
  const [courtType, setCourtType] = useState("");
  const [townOrPostCode, setTownOrPostCode] = useState("");

  /**
   * ✅ Backend expects caseType as string (int or name).
   * We'll store dropdown selection as string numeric: "", "1", "2" ...
   */
  const [caseType, setCaseType] = useState("");

  const [sortBy, setSortBy] = useState("year_desc");

  // Pagination (server mode)
  const [page, setPage] = useState(1);
  const pageSize = 18;

  const [showAdvanced, setShowAdvanced] = useState(false);

  function resetFilters() {
    setQ("");
    setReportNumber("");
    setParties("");
    setCitation("");
    setYear("");
    setCourtType("");
    setTownOrPostCode("");
    setCaseType("");
    setSortBy("year_desc");
    setPage(1);
    showToast("Filters cleared");
  }

  // ✅ Step 4B: populate dropdown from /api/law-reports/case-types
  useEffect(() => {
    let cancelled = false;

    async function loadCaseTypes() {
      try {
        const res = await api.get("/law-reports/case-types");
        const arr = Array.isArray(res.data) ? res.data : res.data?.items ?? res.data?.data ?? [];

        const cleaned = (arr || [])
          .map((x) => ({
            value: Number(x?.Value),
            label: String(x?.Label || "").trim(),
            count: Number(x?.Count || 0),
          }))
          .filter((x) => Number.isFinite(x.value) && x.value > 0 && x.label);

        if (!cancelled) setCaseTypeOptions(cleaned);
      } catch {
        if (!cancelled) setCaseTypeOptions([]);
      }
    }

    loadCaseTypes();
    return () => {
      cancelled = true;
    };
  }, []);

  async function tryServerSearch(params) {
    if (searchUnavailableRef.current) return { ok: false, reason: "unavailable" };

    try {
      const res = await api.get("/law-reports/search", { params });
      const { items, total: t } = parseSearchResponse(res.data);
      return { ok: true, items, total: t };
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404) {
        searchUnavailableRef.current = true;
        return { ok: false, reason: "404" };
      }
      throw e;
    }
  }

  async function loadAllReportsClientFallback() {
    const res = await api.get("/legal-documents");
    const all = res.data || [];
    return all.filter(isLawReportDocument);
  }

  // ✅ Main loader
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

            // ✅ send string numeric to match TryParseCaseType
            caseType: caseType || undefined,

            sort: sortBy || "year_desc",
            page,
            pageSize,
          };

          const out = await tryServerSearch(params);

          if (!out.ok) {
            // fallback to old client mode if endpoint missing
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
    caseType,
    sortBy,
    page,
  ]);

  // Client-mode enrichment for missing metadata (legacy)
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
            !meta.caseType &&
            !meta.year &&
            !meta.content;

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

  // Client-mode filtering (legacy)
  const visibleClient = useMemo(() => {
    if (mode !== "client") return mergedReports;

    const query = normalize(debouncedQ);
    const rn = normalize(reportNumber);
    const p = normalize(parties);
    const c = normalize(citation);

    const yearNum = year ? Number(year) : null;
    const courtNorm = normalize(courtType);
    const townNorm = normalize(townOrPostCode);
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
    caseType,
  ]);

  const visible = mode === "client" ? visibleClient : reports;

  // ✅ Access checks (by LegalDocumentId)
  useEffect(() => {
    let cancelled = false;

    async function fetchAccessForVisiblePremiumReports() {
      if (!isInst && !isPublic) return;

      const premiumDocIds = (visible || [])
        .filter((d) => d?.IsPremium || d?.isPremium)
        .map((d) => getDocId(d))
        .filter((x) => Number.isFinite(x) && x > 0);

      const missing = premiumDocIds.filter((docId) => accessMap[docId] == null);
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

  // ✅ Availability checks (by LegalDocumentId)
  useEffect(() => {
    let cancelled = false;

    async function fetchAvailabilityForVisibleReports() {
      const docIds = (visible || [])
        .map((d) => getDocId(d))
        .filter((x) => Number.isFinite(x) && x > 0);

      const missing = docIds.filter((docId) => availabilityMap[docId] == null);
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

  // ✅ Dropdown options
  const computedCaseOptions = useMemo(() => {
    if (caseTypeOptions && caseTypeOptions.length > 0) return caseTypeOptions;

    // fallback: show all enum values (no counts)
    return (REPORT_CASE_TYPES_ALL || []).map((label, i) => ({
      value: i + 1,
      label,
      count: 0,
    }));
  }, [caseTypeOptions]);

  return (
    <div className="lr-wrap lr-theme">
      {toast && <div className={`lr-toast ${toast.type === "error" ? "error" : ""}`}>{toast.message}</div>}

      <div className="lr-hero">
        <div className="lr-hero-inner">
          <div className="lr-hero-left">
            <div className="lr-chip">LawAfrica Reports</div>
            <h1 className="lr-hero-title">Law Reports</h1>
            <p className="lr-hero-sub">
              Discover judgments and rulings with powerful filters — and preview a short excerpt before you open.
            </p>
          </div>

          <div className="lr-hero-right">
            <button className="lr-pill" onClick={() => navigate("/dashboard/explore")}>
              Explore Publications
            </button>
            <button className="lr-pill ghost" onClick={resetFilters}>
              Clear filters
            </button>
          </div>
        </div>
      </div>

      <div className="lr-body">
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
              <div className="lr-panel-title">Search & Filters</div>

              <div className="lr-field">
                <div className="lr-label">Quick search</div>
                <input
                  className="lr-input"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    if (mode === "server") setPage(1);
                  }}
                  placeholder="Report no, parties, citation, year, court, town/post code…"
                />
              </div>

              <div className="lr-field">
                <button className="lr-card-btn" onClick={() => setShowAdvanced((v) => !v)} style={{ width: "100%" }}>
                  {showAdvanced ? "Hide" : "Show"} advanced fields
                </button>
              </div>

              {showAdvanced && (
                <>
                  <div className="lr-field">
                    <div className="lr-label">Report Number</div>
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
                    <div className="lr-label">Parties</div>
                    <input
                      className="lr-input"
                      value={parties}
                      onChange={(e) => {
                        setParties(e.target.value);
                        if (mode === "server") setPage(1);
                      }}
                      placeholder="e.g. Mwabonje v Sarova…"
                    />
                  </div>

                  <div className="lr-field">
                    <div className="lr-label">Citation</div>
                    <input
                      className="lr-input"
                      value={citation}
                      onChange={(e) => {
                        setCitation(e.target.value);
                        if (mode === "server") setPage(1);
                      }}
                      placeholder="e.g. [2016] LLR (HCK)…"
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
                    placeholder="e.g. 2016"
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
                  {computedCaseOptions.map((opt) => (
                    <option key={String(opt.value)} value={String(opt.value)}>
                      {opt.label}
                      {opt.count ? ` (${opt.count})` : ""}
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
                  placeholder="e.g. Employment & Labour Relations Court"
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
                  placeholder="e.g. Mombasa / 00100"
                />
              </div>

              <div className="lr-panel-actions">
                <button className="lr-btn secondary" onClick={resetFilters}>
                  Clear
                </button>
                <button className="lr-btn" onClick={() => showToast("Tip: try Case Type + Year + Parties")}>
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
                      Showing <strong>{reports.length}</strong> of <strong>{total}</strong>{" "}
                      report{total === 1 ? "" : "s"} • Page <strong>{page}</strong>/{totalPages}
                    </>
                  ) : (
                    <>
                      Showing <strong>{visible.length}</strong> report{visible.length === 1 ? "" : "s"}
                      {detailsLoadingIds.size > 0 ? <span className="lr-soft"> • loading details…</span> : null}
                    </>
                  )}
                </div>

                {mode === "server" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="lr-card-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      ← Prev
                    </button>
                    <button className="lr-card-btn" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
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
                <div className="lr-cards">
                  {visible.map((item) => {
                    const tags = getTags(item);
                    const excerpt = makeExcerpt(item, 260);

                    const docId = getDocId(item);
                    const reportId = getReportId(item);

                    const isPremium = !!(item?.IsPremium ?? item?.isPremium);

                    const access = accessMap[docId];
                    const hasFullAccess = !!access?.hasFullAccess;
                    const accessLoading = accessLoadingIds.has(docId);

                    const hasContent = availabilityMap[docId] == null ? true : !!availabilityMap[docId];
                    const availabilityLoading = availabilityLoadingIds.has(docId);

                    const showIncluded = isPremium && (isInst || isPublic) && !accessLoading && hasFullAccess;

                    const goDetails = () => {
                      if (mode === "server" && reportId) {
                        navigate(`/dashboard/law-reports/${reportId}`);
                        return;
                      }
                      // fallback
                      navigate(`/dashboard/documents/${docId}`);
                    };

                    // mini header
                    const miniHeader =
                      mode === "client"
                        ? makeReportMiniHeader(item)
                        : (() => {
                            const parts = [];
                            if (tags.courtType) parts.push(tags.courtType);
                            if (tags.judgmentDate) parts.push(`Date: ${tags.judgmentDate}`);
                            if (tags.judges) parts.push(`Judges: ${tags.judges}`);
                            return parts.join(" • ");
                          })();

                    return (
                      <article
                        key={`${mode}-${reportId || docId}`}
                        className="lr-card2"
                        role="button"
                        tabIndex={0}
                        onClick={goDetails}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            goDetails();
                          }
                        }}
                      >
                        <div className="lr-card2-top">
                          <div className="lr-card2-title">{getTitle(item)}</div>

                          <div className="lr-badges">
                            {isPremium ? <span className="lr-badge premium">Premium</span> : <span className="lr-badge">Free</span>}
                            {showIncluded && <span className="lr-badge included">Included</span>}
                          </div>
                        </div>

                        <div className="lr-tags">
                          {tags.reportNumber ? <span className="lr-tag">{tags.reportNumber}</span> : null}
                          {tags.year ? <span className="lr-tag">{tags.year}</span> : null}
                          {tags.caseType ? <span className="lr-tag">{tags.caseType}</span> : null}
                          {tags.courtType ? <span className="lr-tag">{tags.courtType}</span> : null}
                          {tags.town ? <span className="lr-tag">{tags.town}</span> : null}
                          {!tags.town && tags.postCode ? <span className="lr-tag">{tags.postCode}</span> : null}
                          {tags.citation ? <span className="lr-tag">{tags.citation}</span> : null}
                        </div>

                        {miniHeader ? <div className="lr-mini">{miniHeader}</div> : null}

                        <div className="lr-excerpt">{excerpt}</div>

                        <div className="lr-card2-actions">
                          <button
                            className="lr-card-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              goDetails();
                            }}
                          >
                            Details
                          </button>

                          <button
                            className="lr-card-btn primary"
                            disabled={!hasContent || availabilityLoading}
                            title={!hasContent ? "Not available yet" : ""}
                            onClick={(e) => {
                              e.stopPropagation();
                              goDetails();
                            }}
                            style={{
                              opacity: hasContent ? 1 : 0.6,
                              cursor: hasContent ? "pointer" : "not-allowed",
                            }}
                          >
                            {availabilityLoading ? "Checking…" : "Read More"}
                          </button>

                          <button
                            className="lr-card-btn ghost"
                            disabled={availabilityLoading || accessLoading || !hasContent || (isPremium && !hasFullAccess)}
                            title={
                              !hasContent
                                ? "Not available yet"
                                : isPremium && !hasFullAccess
                                  ? "Access required"
                                  : "Open reader"
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!hasContent) return;
                              if (isPremium && !hasFullAccess) {
                                navigate(`/dashboard/documents/${docId}`);
                                return;
                              }
                              navigate(`/dashboard/documents/${docId}/read`);
                            }}
                          >
                            Open
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {mode === "server" && totalPages > 1 && (
                <div className="lr-pager">
                  <button className="lr-card-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    ← Prev
                  </button>
                  <div className="lr-soft">
                    Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                  </div>
                  <button className="lr-card-btn" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next →
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
