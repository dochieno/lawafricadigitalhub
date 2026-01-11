// src/pages/dashboard/Explore.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { API_BASE_URL } from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import "../../styles/explore.css";

function getServerOrigin() {
  return String(API_BASE_URL || "").replace(/\/api\/?$/i, "");
}

function buildCoverUrl(coverImagePath) {
  if (!coverImagePath) return null;

  const clean = String(coverImagePath)
    .replace(/^Storage\//i, "")
    .replace(/^\/+/, "")
    .toLowerCase();

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

export default function Explore() {
  const navigate = useNavigate();

  const [docs, setDocs] = useState([]);
  const [libraryIds, setLibraryIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [showPremium, setShowPremium] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const [toast, setToast] = useState(null);

  const [accessMap, setAccessMap] = useState({});
  const [accessLoadingIds, setAccessLoadingIds] = useState(new Set());

  // ✅ NEW: availability (hasContent) map
  const [availabilityMap, setAvailabilityMap] = useState({});
  const [availabilityLoadingIds, setAvailabilityLoadingIds] = useState(new Set());

  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    async function loadAll() {
      try {
        const [docsRes, libraryRes] = await Promise.all([
          api.get("/legal-documents"),
          api.get("/my-library"),
        ]);

        setDocs(docsRes.data || []);

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

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return docs.filter((d) => {
      const matchesQuery =
        !query ||
        (d.title || "").toLowerCase().includes(query) ||
        (d.description || "").toLowerCase().includes(query) ||
        (d.countryName || "").toLowerCase().includes(query) ||
        (d.author || "").toLowerCase().includes(query) ||
        (d.category || "").toLowerCase().includes(query);

      const matchesPremium = showPremium ? true : !d.isPremium;

      return matchesQuery && matchesPremium;
    });
  }, [docs, q, showPremium]);

  // ✅ Fetch access for visible premium docs
  useEffect(() => {
    let cancelled = false;

    async function fetchAccessForVisiblePremiumDocs() {
      if (!isInst && !isPublic) return;

      const premiumIds = filtered.filter((d) => d.isPremium).map((d) => d.id);
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

    fetchAccessForVisiblePremiumDocs();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, isInst, isPublic]);

  // ✅ NEW: Fetch availability for visible docs (so we can disable Add-to-library for "Coming soon")
  useEffect(() => {
    let cancelled = false;

    async function fetchAvailabilityForVisibleDocs() {
      const visibleIds = filtered.map((d) => d.id);
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
            if (r.status === "fulfilled") {
              next[docId] = !!r.value?.data?.hasContent;
            } else {
              // If availability fails, assume content exists to avoid blocking unnecessarily
              next[docId] = true;
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
  }, [filtered]);

  async function addToLibrary(documentId) {
    try {
      setActionLoading(documentId);
      await api.post(`/my-library/${documentId}`);

      setLibraryIds((prev) => new Set(prev).add(documentId));
      showToast("Added to your library");
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data ||
        err?.message ||
        "Failed to add to library";
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

  if (loading) return <p className="explore-loading">Loading catalog…</p>;

  if (error) {
    return (
      <div className="explore-error">
        <h2>Catalog unavailable</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="explore-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <header className="explore-header">
        <h1 className="explore-title">Explore LawAfrica Legal Knowledge Hub</h1>

        <div className="explore-controls">
          <input
            className="explore-search"
            placeholder="Search by title, category, country…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <label className="explore-checkbox">
            <input
              type="checkbox"
              checked={showPremium}
              onChange={(e) => setShowPremium(e.target.checked)}
            />
            Show premium content
          </label>
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="explore-empty">
          <h2>No results</h2>
          <p>Try a different search term or adjust filters.</p>
        </div>
      ) : (
        <div className="explore-grid">
          {filtered.map((d) => {
            const inLibrary = libraryIds.has(d.id);
            const coverUrl = buildCoverUrl(d.coverImagePath);

            const access = accessMap[d.id];
            const hasFullAccess = !!access?.hasFullAccess;
            const accessLoading = accessLoadingIds.has(d.id);

            const hasContent =
              availabilityMap[d.id] == null ? true : !!availabilityMap[d.id];
            const availabilityLoading = availabilityLoadingIds.has(d.id);

            // ✅ Institution premium: show Add/Remove if entitled
            const showPremiumAsLibraryAction = d.isPremium && isInst && hasFullAccess;

            // ✅ Public premium: if owned/subscribed => Read now
            const showPublicReadNow = d.isPremium && isPublic && hasFullAccess;

            // ✅ Universal rule: coming soon => no add-to-library
            const canAddLibraryHere =
              hasContent && (!d.isPremium || showPremiumAsLibraryAction);

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

                  {/* FREE docs: Add/Remove (disabled if coming soon) */}
                  {!d.isPremium && (
                    <button
                      className="explore-btn"
                      disabled={
                        actionLoading === d.id || !canAddLibraryHere || availabilityLoading
                      }
                      title={disabledReason}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!canAddLibraryHere) return;
                        inLibrary ? removeFromLibrary(d.id) : addToLibrary(d.id);
                      }}
                      style={{
                        opacity: canAddLibraryHere ? 1 : 0.5,
                        cursor: canAddLibraryHere ? "pointer" : "not-allowed",
                      }}
                    >
                      {availabilityLoading
                        ? "Checking…"
                        : inLibrary
                        ? "🗑️ Remove from Library"
                        : "➕ Add to Library"}
                    </button>
                  )}

                  {/* Premium + Institution + Entitled => Add/Remove (disabled if coming soon) */}
                  {d.isPremium && showPremiumAsLibraryAction && (
                    <button
                      className="explore-btn"
                      disabled={
                        actionLoading === d.id ||
                        accessLoading ||
                        availabilityLoading ||
                        !canAddLibraryHere
                      }
                      title={disabledReason}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!canAddLibraryHere) return;
                        inLibrary ? removeFromLibrary(d.id) : addToLibrary(d.id);
                      }}
                      style={{
                        opacity: canAddLibraryHere ? 1 : 0.5,
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

                  {/* Premium + Public + Owned => Read now */}
                  {d.isPremium && showPublicReadNow && (
                    <button
                      className="explore-btn explore-btn-premium"
                      disabled={!hasContent}
                      title={!hasContent ? "Coming soon" : ""}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!hasContent) return;
                        navigate(`/dashboard/documents/${d.id}/read`);
                      }}
                      style={{
                        opacity: hasContent ? 1 : 0.5,
                        cursor: hasContent ? "pointer" : "not-allowed",
                      }}
                    >
                      📖 Read Now
                    </button>
                  )}

                  {/* Default premium fallback => View / Preview */}
                  {d.isPremium && !showPremiumAsLibraryAction && !showPublicReadNow && (
                    <button
                      className="explore-btn explore-btn-premium"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard/documents/${d.id}`);
                      }}
                    >
                      📖 View / Preview
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="explore-cta">
        <h2>Build Your Personal Legal Library</h2>
        <p>
          Save free publications to your library and keep all your trusted legal
          resources organized in one place for quick access anytime.
        </p>

        <button
          className="explore-cta-btn"
          onClick={() => navigate("/dashboard/library")}
        >
          📚 Go to My Library
        </button>
      </section>
    </div>
  );
}
