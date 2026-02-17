// src/pages/dashboard/Explore.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { API_BASE_URL } from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import { isLawReportDocument } from "../../utils/isLawReportDocument";
import "../../styles/explore.css";

function getServerOrigin() {
  // If API_BASE_URL is https://host/api -> return https://host
  return String(API_BASE_URL || "").replace(/\/api\/?$/i, "");
}

function buildCoverUrl(coverImagePath) {
  if (!coverImagePath) return null;

  // Keep original case (Linux is case-sensitive)
  const clean = String(coverImagePath)
    .replace(/^Storage[\\/]/i, "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");

  return `${getServerOrigin()}/storage/${clean}`;
}

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

function normalizeStr(v) {
  return String(v || "").trim();
}

function uniqSorted(arr) {
  const s = new Set();
  (arr || []).forEach((x) => {
    const v = normalizeStr(x);
    if (v) s.add(v);
  });
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

function toggleInSet(set, value) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function setHasAny(set) {
  return set && set.size > 0;
}

/* -------------------------------------------------------
   Small UI helpers (no external deps)
-------------------------------------------------------- */
function FilterSection({ title, right, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="explore-filterSection">
      <button
        type="button"
        className="explore-filterSectionHeader"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open ? "true" : "false"}
      >
        <span className="explore-filterSectionTitle">{title}</span>
        <span className="explore-filterSectionRight">
          {right}
          <span className={`explore-filterChevron ${open ? "open" : ""}`}>▾</span>
        </span>
      </button>
      {open && <div className="explore-filterSectionBody">{children}</div>}
    </div>
  );
}

function Chip({ label, onRemove }) {
  return (
    <button type="button" className="explore-chip" onClick={onRemove} title="Remove filter">
      <span className="explore-chipText">{label}</span>
      <span className="explore-chipX">×</span>
    </button>
  );
}

export default function Explore() {
  const navigate = useNavigate();

  const [docs, setDocs] = useState([]);
  const [libraryIds, setLibraryIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Search + filters
  const [q, setQ] = useState("");

  // Access filter:
  // - all: show everything
  // - free: only non-premium
  // - premium: only premium
  // - included: institution/public users with hasFullAccess
  const [accessMode, setAccessMode] = useState("all");

  // Multi-select filters
  const [countrySet, setCountrySet] = useState(new Set());
  const [categorySet, setCategorySet] = useState(new Set());

  // Filter list search (inside sidebar)
  const [countryListQ, setCountryListQ] = useState("");
  const [categoryListQ, setCategoryListQ] = useState("");

  // Availability filter (soft): unknown treated as available
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  // Sort
  const [sortBy, setSortBy] = useState("relevance"); // relevance | title | country | category | premium

  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);

  const [accessMap, setAccessMap] = useState({});
  const [accessLoadingIds, setAccessLoadingIds] = useState(new Set());

  const [availabilityMap, setAvailabilityMap] = useState({});
  const [availabilityLoadingIds, setAvailabilityLoadingIds] = useState(new Set());

  // Mobile filters drawer
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();

  // ✅ Pagination (client-side, no API changes)
  const PAGE_SIZE = 8;
  const [page, setPage] = useState(1);
  const topRef = useRef(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  function clearAllFilters() {
    setQ("");
    setAccessMode("all");
    setCountrySet(new Set());
    setCategorySet(new Set());
    setOnlyAvailable(false);
    setSortBy("relevance");
    setCountryListQ("");
    setCategoryListQ("");
  }

  // Load docs
  useEffect(() => {
    async function loadAll() {
      try {
        const [docsRes, libraryRes] = await Promise.all([api.get("/legal-documents"), api.get("/my-library")]);

        // ✅ Remove reports from Explore
        const all = docsRes.data || [];
        const nonReports = all.filter((d) => !isLawReportDocument(d));
        setDocs(nonReports);

        const ids = new Set((libraryRes.data || []).map((item) => item.id));
        setLibraryIds(ids);
      } catch (err) {
        console.error(err);
        setError("We couldn’t load the catalog right now. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

  // Derived filter lists
  const allCountries = useMemo(() => uniqSorted(docs.map((d) => d.countryName)), [docs]);
  const allCategories = useMemo(() => uniqSorted(docs.map((d) => d.category)), [docs]);

  const visibleCountries = useMemo(() => {
    const s = countryListQ.trim().toLowerCase();
    if (!s) return allCountries;
    return allCountries.filter((x) => x.toLowerCase().includes(s));
  }, [allCountries, countryListQ]);

  const visibleCategories = useMemo(() => {
    const s = categoryListQ.trim().toLowerCase();
    if (!s) return allCategories;
    return allCategories.filter((x) => x.toLowerCase().includes(s));
  }, [allCategories, categoryListQ]);

  // Filter + sort pipeline
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    let out = docs.filter((d) => {
      // Search
      const matchesQuery =
        !query ||
        (d.title || "").toLowerCase().includes(query) ||
        (d.description || "").toLowerCase().includes(query) ||
        (d.countryName || "").toLowerCase().includes(query) ||
        (d.author || "").toLowerCase().includes(query) ||
        (d.category || "").toLowerCase().includes(query);

      if (!matchesQuery) return false;

      // Access mode
      if (accessMode === "free" && d.isPremium) return false;
      if (accessMode === "premium" && !d.isPremium) return false;

      // included: premium docs that user has full access to (for inst/public only)
      if (accessMode === "included") {
        if (!d.isPremium) return false;
        if (!isInst && !isPublic) return false;
        if (!accessMap[d.id]?.hasFullAccess) return false;

      }

      // Multi filters
      if (setHasAny(countrySet)) {
        const c = normalizeStr(d.countryName);
        if (!countrySet.has(c)) return false;
      }

      if (setHasAny(categorySet)) {
        const cat = normalizeStr(d.category);
        if (!categorySet.has(cat)) return false;
      }

      // Availability (soft)
      if (onlyAvailable) {
        const known = availabilityMap[d.id];
        const hasContent = known == null ? true : !!known;
        if (!hasContent) return false;
      }

      return true;
    });

    // Sort
    const qActive = !!query;
    const s = String(sortBy || "relevance");

    out.sort((a, b) => {
      // Premium sort option
      if (s === "premium") {
        const ap = a.isPremium ? 1 : 0;
        const bp = b.isPremium ? 1 : 0;
        if (bp !== ap) return bp - ap; // premium first
        return String(a.title || "").localeCompare(String(b.title || ""));
      }

      if (s === "title") return String(a.title || "").localeCompare(String(b.title || ""));
      if (s === "country") return String(a.countryName || "").localeCompare(String(b.countryName || ""));
      if (s === "category") return String(a.category || "").localeCompare(String(b.category || ""));

      // relevance: if searching, prefer title matches first, then alphabetical
      if (s === "relevance" && qActive) {
        const at = String(a.title || "").toLowerCase().includes(query) ? 1 : 0;
        const bt = String(b.title || "").toLowerCase().includes(query) ? 1 : 0;
        if (bt !== at) return bt - at;
        return String(a.title || "").localeCompare(String(b.title || ""));
      }

      // default
      return String(a.title || "").localeCompare(String(b.title || ""));
    });

    return out;
  }, [
    docs,
    q,
    accessMode,
    sortBy,
    countrySet,
    categorySet,
    onlyAvailable,
    availabilityMap,
    accessMap,
    isInst,
    isPublic,
  ]);

  // ✅ Reset to page 1 when filters/search change
  useEffect(() => {
    setPage(1);
  }, [q, accessMode, sortBy, onlyAvailable, countrySet, categorySet]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  }, [filtered.length]);

  // ✅ Clamp current page if results shrink
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  const pagedDocs = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // ✅ Scroll to top of grid when changing pages
  function goToPage(nextPage) {
    setPage(nextPage);
    requestAnimationFrame(() => {
      if (topRef.current) topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Keep your existing access batching (visible premium only)
  useEffect(() => {
    let cancelled = false;

    async function fetchAccessForVisiblePremiumDocs() {
      if (!isInst && !isPublic) return;

      const premiumIds = pagedDocs.filter((d) => d.isPremium).map((d) => d.id);
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

        const results = await Promise.allSettled(batch.map((docId) => api.get(`/legal-documents/${docId}/access`)));
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

    fetchAccessForVisiblePremiumDocs();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagedDocs, isInst, isPublic]);

  // Keep your existing availability batching (visible docs only)
  useEffect(() => {
    let cancelled = false;

    async function fetchAvailabilityForVisibleDocs() {
      const visibleIds = pagedDocs.map((d) => d.id);
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

        const results = await Promise.allSettled(batch.map((docId) => api.get(`/legal-documents/${docId}/availability`)));
        if (cancelled) return;

        setAvailabilityMap((prev) => {
          const next = { ...prev };
          results.forEach((r, idx) => {
            const docId = batch[idx];
            if (r.status === "fulfilled") {
              next[docId] = !!r.value?.data?.hasContent;
            } else {
              next[docId] = true; // fail-open
            }
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

    fetchAvailabilityForVisibleDocs();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagedDocs]);

  async function addToLibrary(documentId) {
    try {
      setActionLoading(documentId);
      await api.post(`/my-library/${documentId}`);
      setLibraryIds((prev) => new Set(prev).add(documentId));
      showToast("Added to your library");
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data || err?.message || "Failed to add to library";
      showToast(String(msg), "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function removeFromLibrary(documentId) {
    try {
      setActionLoading(documentId);
      await api.delete(`/my-library/${documentId}`);
      setLibraryIds((prev) => {
        const copy = new Set(prev);
        copy.delete(documentId);
        return copy;
      });
      showToast("Removed from library");
    } catch {
      showToast("Failed to remove from library", "error");
    } finally {
      setActionLoading(null);
    }
  }

  // Active chips
  const chips = useMemo(() => {
    const out = [];

    if (q.trim()) out.push({ key: "q", label: `Search: "${q.trim()}"`, onRemove: () => setQ("") });

    if (accessMode !== "all") {
      const map = {
        free: "Free only",
        premium: "Premium only",
        included: "Included for me",
      };
      out.push({ key: "access", label: map[accessMode] || "Access", onRemove: () => setAccessMode("all") });
    }

    if (onlyAvailable) out.push({ key: "avail", label: "Available now", onRemove: () => setOnlyAvailable(false) });

    Array.from(countrySet).forEach((c) => {
      out.push({
        key: `c:${c}`,
        label: c,
        onRemove: () => setCountrySet((prev) => toggleInSet(prev, c)),
      });
    });

    Array.from(categorySet).forEach((c) => {
      out.push({
        key: `cat:${c}`,
        label: c,
        onRemove: () => setCategorySet((prev) => toggleInSet(prev, c)),
      });
    });

    return out;
  }, [q, accessMode, onlyAvailable, countrySet, categorySet]);

  if (loading) return <p className="explore-loading">Loading catalog…</p>;

  if (error) {
    return (
      <div className="explore-error">
        <h2>Catalog unavailable</h2>
        <p>{error}</p>
      </div>
    );
  }

  const showPager = filtered.length > PAGE_SIZE;

  // Shared filter panel (desktop + mobile drawer content)
  const FilterPanel = ({ inDrawer = false }) => (
    <div className={`explore-sidebar ${inDrawer ? "drawer" : ""}`}>
      <div className="explore-sidebarTop">
        <div className="explore-sidebarTitleRow">
          <div>
            <div className="explore-sidebarTitle">Filters</div>
            <div className="explore-sidebarSub">
              <b>{filtered.length}</b> results
            </div>
          </div>

          <button type="button" className="explore-linkBtn" onClick={clearAllFilters}>
            Clear all
          </button>
        </div>

        <div className="explore-sidebarSearchWrap">
          <input
            className="explore-sidebarSearch"
            placeholder="Search title, category, country…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="explore-sidebarBody">
        <FilterSection title="Access">
          <div className="explore-radioGroup">
            <label className="explore-radio">
              <input
                type="radio"
                name={inDrawer ? "accessDrawer" : "access"}
                checked={accessMode === "all"}
                onChange={() => setAccessMode("all")}
              />
              <span>All content</span>
            </label>

            <label className="explore-radio">
              <input
                type="radio"
                name={inDrawer ? "accessDrawer" : "access"}
                checked={accessMode === "free"}
                onChange={() => setAccessMode("free")}
              />
              <span>Free only</span>
            </label>

            <label className="explore-radio">
              <input
                type="radio"
                name={inDrawer ? "accessDrawer" : "access"}
                checked={accessMode === "premium"}
                onChange={() => setAccessMode("premium")}
              />
              <span>Premium only</span>
            </label>

            <label className={`explore-radio ${!isInst && !isPublic ? "disabled" : ""}`}>
              <input
                type="radio"
                name={inDrawer ? "accessDrawer" : "access"}
                checked={accessMode === "included"}
                onChange={() => setAccessMode("included")}
                disabled={!isInst && !isPublic}
              />
              <span>Included for me</span>
            </label>
          </div>

          <label className="explore-toggle">
            <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
            <span>Available now</span>
          </label>
        </FilterSection>

        <FilterSection title="Sort">
          <select className="explore-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="relevance">Relevance</option>
            <option value="title">Title A–Z</option>
            <option value="country">Country A–Z</option>
            <option value="category">Category A–Z</option>
            <option value="premium">Premium first</option>
          </select>
          <div className="explore-hint">Tip: Relevance prioritizes title matches when searching.</div>
        </FilterSection>

        <FilterSection
          title="Country"
          right={setHasAny(countrySet) ? <span className="explore-pill">{countrySet.size}</span> : null}
        >
          <input
            className="explore-miniSearch"
            placeholder="Find country…"
            value={countryListQ}
            onChange={(e) => setCountryListQ(e.target.value)}
          />

          <div className="explore-checkList">
            {visibleCountries.length === 0 ? (
              <div className="explore-muted">No matches</div>
            ) : (
              visibleCountries.map((c) => {
                const checked = countrySet.has(c);
                return (
                  <label key={c} className="explore-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setCountrySet((prev) => toggleInSet(prev, c))}
                    />
                    <span>{c}</span>
                  </label>
                );
              })
            )}
          </div>
        </FilterSection>

        <FilterSection
          title="Category"
          right={setHasAny(categorySet) ? <span className="explore-pill">{categorySet.size}</span> : null}
        >
          <input
            className="explore-miniSearch"
            placeholder="Find category…"
            value={categoryListQ}
            onChange={(e) => setCategoryListQ(e.target.value)}
          />

          <div className="explore-checkList">
            {visibleCategories.length === 0 ? (
              <div className="explore-muted">No matches</div>
            ) : (
              visibleCategories.map((c) => {
                const checked = categorySet.has(c);
                return (
                  <label key={c} className="explore-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setCategorySet((prev) => toggleInSet(prev, c))}
                    />
                    <span>{c}</span>
                  </label>
                );
              })
            )}
          </div>
        </FilterSection>

        {inDrawer && (
          <div className="explore-drawerActions">
            <button
              type="button"
              className="explore-btnPrimary"
              onClick={() => setMobileFiltersOpen(false)}
            >
              Apply filters
            </button>
            <button type="button" className="explore-btnGhost" onClick={clearAllFilters}>
              Clear all
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="explore-container">
      <div ref={topRef} />

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      {/* Mobile filters drawer */}
      {mobileFiltersOpen && (
        <div
          className="explore-drawerOverlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setMobileFiltersOpen(false)}
        >
          <div className="explore-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="explore-drawerHeader">
              <div className="explore-drawerHeaderTitle">Filters</div>
              <button type="button" className="explore-drawerClose" onClick={() => setMobileFiltersOpen(false)}>
                ×
              </button>
            </div>
            <FilterPanel inDrawer />
          </div>
        </div>
      )}

      <div className="explore-shell">
        {/* Desktop sidebar */}
        <div className="explore-shellLeft">
          <FilterPanel />
        </div>

        {/* Main content */}
        <div className="explore-shellRight">
          <header className="explore-header">
            <div className="explore-titleRow">
              <div>
                <h1 className="explore-title">Explore LawAfrica Legal Knowledge Hub</h1>
                <p className="explore-subtitle">
                  Browse publications, save favorites, and build your personal legal library.
                </p>
              </div>

              <div className="explore-headerActions">
                <button
                  type="button"
                  className="explore-filtersBtn"
                  onClick={() => setMobileFiltersOpen(true)}
                >
                  ⚙️ Filters
                </button>

                <div className="explore-resultsPill">{filtered.length} results</div>

              </div>
            </div>

            {/* Active filter chips */}
            {chips.length > 0 && (
              <div className="explore-chipsRow" aria-label="Active filters">
                <div className="explore-chips">
                  {chips.map((c) => (
                    <Chip key={c.key} label={c.label} onRemove={c.onRemove} />
                  ))}
                </div>

                <button type="button" className="explore-linkBtn" onClick={clearAllFilters}>
                  Clear all
                </button>
              </div>
            )}

            {/* Compact Pagination bar (top) */}
            {showPager && (
              <div className="explore-pager" aria-label="Pagination">
                <button
                  type="button"
                  className="explore-pager-btn"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                  aria-label="Previous page"
                >
                  ← Prev
                </button>

                <div className="explore-pager-mid">
                  <span className="explore-pager-text">
                    Page <b>{page}</b> of <b>{totalPages}</b>
                  </span>
                  <span className="explore-pager-dot">•</span>
                  <span className="explore-pager-text">{filtered.length} items</span>
                </div>

                <button
                  type="button"
                  className="explore-pager-btn"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                  aria-label="Next page"
                >
                  Next →
                </button>
              </div>
            )}
          </header>

          {filtered.length === 0 ? (
            <div className="explore-empty">
              <h2>No results</h2>
              <p>Try a different search term or adjust filters.</p>
              <button type="button" className="explore-btnPrimary" onClick={clearAllFilters}>
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div className="explore-grid">
                {pagedDocs.map((d) => {
                  const inLibrary = libraryIds.has(d.id);
                  const coverUrl = buildCoverUrl(d.coverImagePath);

                  const access = accessMap[d.id];
                  const hasFullAccess = !!access?.hasFullAccess;
                  const accessLoading = accessLoadingIds.has(d.id);

                  const hasContent = availabilityMap[d.id] == null ? true : !!availabilityMap[d.id];
                  const availabilityLoading = availabilityLoadingIds.has(d.id);

                  const showPremiumAsLibraryAction = d.isPremium && isInst && hasFullAccess;
                  const showPublicReadNow = d.isPremium && isPublic && hasFullAccess;

                  const canAddLibraryHere = hasContent && (!d.isPremium || showPremiumAsLibraryAction);
                  const disabledReason = !hasContent ? "Coming soon" : "";

                  return (
                    <div
                      key={d.id}
                      className="explore-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/dashboard/documents/${d.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/dashboard/documents/${d.id}`);
                        }
                      }}
                    >
                      <div className="explore-cover">
                        <div className="explore-cover-overlay" />
                        {coverUrl ? (
                          <img
                            src={coverUrl}
                            alt={d.title}
                            className="explore-cover-img"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="explore-cover-text">LAW</span>
                        )}
                      </div>

                      <div className="explore-info">
                        <div className="explore-badges">
                          {d.isPremium ? (
                            <span className="badge premium">Premium</span>
                          ) : (
                            <span className="badge free">Free</span>
                          )}

                          {!hasContent && (
                            <span className="badge coming-soon" style={{ marginLeft: 8 }}>
                              Coming soon
                            </span>
                          )}

                          {d.isPremium && isInst && !accessLoading && hasFullAccess && (
                            <span className="badge free" style={{ marginLeft: 8 }}>
                              Included
                            </span>
                          )}
                        </div>

                        <h3 className="explore-doc-title">{d.title}</h3>

                        <p className="explore-meta">
                          {d.countryName} • {d.category}
                        </p>

                        {!d.isPremium && (
                          <button
                            className="explore-btn explore-btn-hot"
                            disabled={actionLoading === d.id || !canAddLibraryHere || availabilityLoading}
                            title={disabledReason}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canAddLibraryHere) return;
                              inLibrary ? removeFromLibrary(d.id) : addToLibrary(d.id);
                            }}
                            style={{
                              opacity: canAddLibraryHere ? 1 : 0.55,
                              cursor: canAddLibraryHere ? "pointer" : "not-allowed",
                            }}
                          >
                            {availabilityLoading ? "Checking…" : inLibrary ? "🗑️ Remove from Library" : "➕ Add to Library"}
                          </button>
                        )}

                        {d.isPremium && showPremiumAsLibraryAction && (
                          <button
                            className="explore-btn explore-btn-hot"
                            disabled={actionLoading === d.id || accessLoading || availabilityLoading || !canAddLibraryHere}
                            title={disabledReason}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canAddLibraryHere) return;
                              inLibrary ? removeFromLibrary(d.id) : addToLibrary(d.id);
                            }}
                            style={{
                              opacity: canAddLibraryHere ? 1 : 0.55,
                              cursor: canAddLibraryHere ? "pointer" : "not-allowed",
                            }}
                          >
                            {accessLoading || availabilityLoading
                              ? "Checking…"
                              : inLibrary
                              ? "🗑️ Remove from Library"
                              : "➕ Add to Library"}
                          </button>
                        )}

                        {d.isPremium && showPublicReadNow && (
                          <button
                            className="explore-btn explore-btn-hot"
                            disabled={!hasContent}
                            title={!hasContent ? "Coming soon" : ""}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!hasContent) return;
                              navigate(`/dashboard/documents/${d.id}/read`);
                            }}
                            style={{
                              opacity: hasContent ? 1 : 0.55,
                              cursor: hasContent ? "pointer" : "not-allowed",
                            }}
                          >
                            📖 Read Now
                          </button>
                        )}

                        {d.isPremium && !showPremiumAsLibraryAction && !showPublicReadNow && (
                          <button
                            className="explore-btn explore-btn-premium explore-btn-hotOutline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/dashboard/documents/${d.id}`);
                            }}
                          >
                            <span>📖 View / Preview</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Compact Pagination bar (bottom) */}
              {showPager && (
                <div className="explore-pager explore-pager-bottom" aria-label="Pagination">
                  <button
                    type="button"
                    className="explore-pager-btn"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                    aria-label="Previous page"
                  >
                    ← Prev
                  </button>

                  <div className="explore-pager-mid">
                    <span className="explore-pager-text">
                      Page <b>{page}</b> of <b>{totalPages}</b>
                    </span>
                  </div>

                  <button
                    type="button"
                    className="explore-pager-btn"
                    disabled={page >= totalPages}
                    onClick={() => goToPage(page + 1)}
                    aria-label="Next page"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}

          <section className="explore-cta">
            <h2>Build Your Personal Legal Library</h2>
            <p>
              Save free publications to your library and keep all your trusted legal resources organized in one place for quick access
              anytime.
            </p>

            <button className="explore-cta-btn explore-cta-btn-hot" onClick={() => navigate("/dashboard/library")}>
              📚 Go to My Library
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
