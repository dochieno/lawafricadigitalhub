// =======================================================
// FILE: src/pages/dashboard/Library.jsx
// Purpose: Premium "My Library" matching Explore standards
// - Pagination: 12 items per page (3 rows x 4 cards)
// - Quick search (title, author, category, country)
// - Fixed cover height: 300px
// - Same maroon/neutral palette + soft shadows
// - Card hover lift + glass hover overlay
// - Bookmark-style remove affordance (top-right)
// - Real footer (full-width like Explore footer)
// - Keeps ALL existing API calls and routes
// =======================================================

import { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/library.css";
import { useNavigate } from "react-router-dom";
import api, { API_BASE_URL } from "../../api/client";
import { isLawReportDocument } from "../../utils/isLawReportDocument";

function getServerOrigin() {
  return String(API_BASE_URL || "").replace(/\/api\/?$/i, "");
}

function buildCoverUrl(coverImagePath) {
  if (!coverImagePath) return null;

  const clean = String(coverImagePath)
    .replace(/^Storage[\\/]/i, "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");

  return `${getServerOrigin()}/storage/${clean}`;
}

export default function Library() {
  const [ebooks, setEbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);

  const navigate = useNavigate();
  const [toast, setToast] = useState(null);

  // ✅ Quick search
  const [q, setQ] = useState("");

  // ✅ Pagination (3 rows x 4 cards)
  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);
  const topRef = useRef(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    async function loadLibrary() {
      try {
        const [libraryRes, progressRes] = await Promise.all([
          api.get("/my-library"),
          api.get("/reading-progress/recent?take=100"),
        ]);

        // ✅ Remove reports from My Library entirely
        const libraryItems = (libraryRes.data || []).filter(
          (x) => !isLawReportDocument(x)
        );

        const progressMap = {};
        (progressRes.data || []).forEach((p) => {
          progressMap[p.documentId] = p;
        });

        const mapped = libraryItems.map((item) => {
          const progress = progressMap[item.id];

          return {
            id: item.id,
            title: item.title,
            author: item.author || "LawAfrica",
            countryName: item.countryName || "",
            category: item.category || "",
            coverImagePath: item.coverImagePath || null,
            isPremium: !!item.isPremium,
            progress: progress?.percentage ?? 0,
            isCompleted: progress?.isCompleted ?? false,
          };
        });

        // In-progress first, then progress desc
        mapped.sort((a, b) => {
          if (a.isCompleted && !b.isCompleted) return 1;
          if (!a.isCompleted && b.isCompleted) return -1;
          return (b.progress || 0) - (a.progress || 0);
        });

        setEbooks(mapped);
      } catch (err) {
        console.error(err);
        setError("Failed to load your library. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    loadLibrary();
  }, []);

  async function removeFromLibrary(documentId) {
    try {
      setActionLoading(documentId);
      await api.delete(`/my-library/${documentId}`);
      setEbooks((prev) => prev.filter((book) => book.id !== documentId));
      showToast("Removed from your library");
    } catch {
      showToast("Failed to remove from library", "error");
    } finally {
      setActionLoading(null);
    }
  }

  const stats = useMemo(() => {
    const total = ebooks.length;
    const completed = ebooks.filter((x) => x.isCompleted).length;
    const inProgress = ebooks.filter(
      (x) => !x.isCompleted && (x.progress || 0) > 0
    ).length;
    return { total, completed, inProgress };
  }, [ebooks]);

  // ✅ Search + filter (no UI filters, just query)
  const filtered = useMemo(() => {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return ebooks;

    return ebooks.filter((b) => {
      const hay =
        `${b.title || ""} ${b.author || ""} ${b.category || ""} ${b.countryName || ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [ebooks, q]);

  // ✅ Reset to page 1 when query changes
  useEffect(() => {
    setPage(1);
  }, [q]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  }, [filtered.length]);

  // ✅ Clamp current page if results shrink
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  const pagedBooks = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  function goToPage(nextPage) {
    setPage(nextPage);
    requestAnimationFrame(() => {
      if (topRef.current) topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (loading) return <p className="library-loading">Loading your library…</p>;

  if (error) {
    return (
      <div className="library-empty">
        <h2>Library unavailable</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (ebooks.length === 0) {
    return (
      <div className="library-container">
        {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

        <header className="library-header library-headerHero">
          <div className="library-hero">
            <div>
              <h1 className="library-title">My Library</h1>
              <p className="library-intro">
                Your saved publications will appear here. Build a personal legal
                collection you can return to anytime.
              </p>
            </div>

            <div className="library-heroPills">
              <span className="library-pill">0 saved</span>
              <span className="library-pill subtle">0 in progress</span>
            </div>
          </div>
        </header>

        <div className="library-emptyCard">
          <div className="library-emptyIcon">📚</div>
          <h2>Your library is empty</h2>
          <p>Add books from the Explore page to see them here.</p>
          <button
            className="library-btnPrimary"
            onClick={() => navigate("/dashboard/explore")}
          >
            Browse Publications
          </button>
        </div>

        <footer className="library-footer">
          <div className="library-footerInner">
            <h3>Build your personal LawAfrica library</h3>
            <p>
              Save trusted publications and keep your research organized in one place.
            </p>
            <button
              className="library-footerBtn"
              onClick={() => navigate("/dashboard/explore")}
            >
              Explore Catalog
            </button>
          </div>
        </footer>
      </div>
    );
  }

  const showPager = filtered.length > PAGE_SIZE;

  return (
    <div className="library-container">
      <div ref={topRef} />

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <header className="library-header library-headerHero">
        <div className="library-hero">
          <div>
            <h1 className="library-title">My Library</h1>
            <p className="library-intro">
              Everything you’ve saved in one place — continue reading, track
              progress, and grow your personal LawAfrica legal library.
            </p>
          </div>

          <div className="library-heroPills" aria-label="Library stats">
            <span className="library-pill">
              <b>{stats.total}</b> saved
            </span>
            <span className="library-pill subtle">
              <b>{stats.inProgress}</b> in progress
            </span>
            <span className="library-pill subtle">
              <b>{stats.completed}</b> completed
            </span>
          </div>
        </div>

        {/* ✅ Search + actions row */}
        <div className="library-toolbar">
          <div className="library-searchWrap">
            <input
              className="library-search"
              placeholder="Search your library (title, author, country, category)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="library-headerActions">
            <button
              type="button"
              className="library-btnGhost"
              onClick={() => navigate("/dashboard/explore")}
            >
              ➕ Add more
            </button>
          </div>
        </div>

        {/* ✅ Compact pager (top) */}
        {showPager && (
          <div className="library-pager" aria-label="Pagination">
            <button
              type="button"
              className="library-pagerBtn"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              ← Prev
            </button>

            <div className="library-pagerMid">
              <span>
                Page <b>{page}</b> of <b>{totalPages}</b>
              </span>
              <span className="library-pagerDot">•</span>
              <span>{filtered.length} items</span>
            </div>

            <button
              type="button"
              className="library-pagerBtn"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </header>

      {filtered.length === 0 ? (
        <div className="library-emptyCard">
          <div className="library-emptyIcon">🔎</div>
          <h2>No matches</h2>
          <p>Try a different keyword (title, author, country, category).</p>
          <button className="library-btnOutline" onClick={() => setQ("")}>
            Clear search
          </button>
        </div>
      ) : (
        <>
          <div className="library-grid">
            {pagedBooks.map((book) => {
              const coverUrl = buildCoverUrl(book.coverImagePath);
              const pct = Math.max(0, Math.min(100, Number(book.progress || 0)));

              return (
                <div
                  key={book.id}
                  className="library-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/dashboard/documents/${book.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/dashboard/documents/${book.id}`);
                    }
                  }}
                >
                  <div className="library-cover">
                    <div className="library-coverOverlay" />
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={book.title}
                        className="library-coverImg"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="library-coverText">LAW</span>
                    )}

                    {/* Remove (bookmark-style) */}
                    <button
                      type="button"
                      className="library-bookmark"
                      title="Remove from Library"
                      aria-label="Remove from Library"
                      disabled={actionLoading === book.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromLibrary(book.id);
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="library-bookmarkIcon"
                      >
                        <path
                          d="M6 3.75C6 2.784 6.784 2 7.75 2h8.5C17.216 2 18 2.784 18 3.75V21l-6-3-6 3V3.75z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>

                    {/* Quick action on hover (desktop via CSS) */}
                    <div className="library-hoverActions" aria-hidden="true">
                      <button
                        type="button"
                        className="library-quickBtn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dashboard/documents/${book.id}/read`);
                        }}
                        title="Continue Reading"
                      >
                        📖 Continue
                      </button>
                    </div>
                  </div>

                  <div className="library-info">
                    <div className="library-badges">
                      {book.isPremium ? (
                        <span className="library-badge premium">Premium</span>
                      ) : (
                        <span className="library-badge free">Free</span>
                      )}

                      {book.isCompleted ? (
                        <span className="library-badge completed">Completed</span>
                      ) : pct > 0 ? (
                        <span className="library-badge progress">{pct}%</span>
                      ) : (
                        <span className="library-badge subtle">Saved</span>
                      )}
                    </div>

                    <h3 className="library-bookTitle" title={book.title}>
                      {book.title}
                    </h3>

                    <p className="library-meta">
                      {book.author}
                      {(book.countryName || book.category) ? (
                        <span className="library-metaDot">•</span>
                      ) : null}
                      <span className="library-metaMuted">
                        {[book.countryName, book.category].filter(Boolean).join(" • ")}
                      </span>
                    </p>

                    {!book.isCompleted && pct > 0 && pct < 100 && (
                      <div className="library-progressWrap" aria-label="Reading progress">
                        <div className="library-progressBar">
                          <div
                            className="library-progressFill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Mobile actions */}
                    <div className="library-mobileActions">
                      <button
                        className="library-btnPrimary"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dashboard/documents/${book.id}/read`);
                        }}
                      >
                        Continue Reading
                      </button>

                      <button
                        className="library-btnOutline"
                        disabled={actionLoading === book.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromLibrary(book.id);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pager bottom */}
          {showPager && (
            <div className="library-pager library-pagerBottom" aria-label="Pagination">
              <button
                type="button"
                className="library-pagerBtn"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                ← Prev
              </button>

              <div className="library-pagerMid">
                <span>
                  Page <b>{page}</b> of <b>{totalPages}</b>
                </span>
              </div>

              <button
                type="button"
                className="library-pagerBtn"
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      <footer className="library-footer">
        <div className="library-footerInner">
          <h3>Expand your Legal Library</h3>
          <p>
            Discover more publications across jurisdictions and practice areas to grow your personal LawAfrica library.
          </p>

          <button
            className="library-footerBtn"
            onClick={() => navigate("/dashboard/explore")}
          >
            Browse All Publications
          </button>
        </div>
      </footer>
    </div>
  );
}
