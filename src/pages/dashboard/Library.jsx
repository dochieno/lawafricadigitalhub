// src/pages/dashboard/Library.jsx
import { useEffect, useState } from "react";
import "../../styles/library.css";
import { useNavigate } from "react-router-dom";
import api, { API_BASE_URL } from "../../api/client";

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

        const progressMap = {};
        (progressRes.data || []).forEach((p) => {
          progressMap[p.documentId] = p;
        });

        const mapped = (libraryRes.data || []).map((item) => {
          const progress = progressMap[item.id];

          return {
            id: item.id,
            title: item.title,
            author: item.author || "LawAfrica",
            coverImagePath: item.coverImagePath || null,
            isPremium: item.isPremium,
            progress: progress?.percentage ?? 0,
            isCompleted: progress?.isCompleted ?? false,
          };
        });

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
      <div className="library-empty">
        <h2>Your library is empty</h2>
        <p>Add books from the Explore page to see them here.</p>
      </div>
    );
  }

  return (
    <div className="library-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <header className="library-header">
        <h1 className="library-title">My Library: LawAfrica Legal Knowledge Hub</h1>
        <p className="library-intro">
          Access free legal resources and all your premium subscriptions
          in one seamless experience. Your LawAfrica Library keeps everything
          organized, bringing together complimentary materials and authoritative
          publications you’ve invested in, so you can research smarter and stay
          ahead with trusted content.
        </p>
      </header>

      <div className="library-cards">
        {ebooks.map((book) => {
          const coverUrl = buildCoverUrl(book.coverImagePath);

          return (
            <div
              key={book.id}
              className="ebook-card"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/dashboard/documents/${book.id}`)}
            >
              <div className="ebook-cover">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={book.title}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span className="ebook-placeholder">LAW</span>
                )}
              </div>

              <div className="ebook-info">
                <h3 className="ebook-title">{book.title}</h3>
                <p className="ebook-author">{book.author}</p>

                {book.isCompleted && <span className="badge completed">✓ Completed</span>}

                {book.progress > 0 && book.progress < 100 && (
                  <div className="progress-bar">
                    <div className="progress" style={{ width: `${book.progress}%` }} />
                  </div>
                )}

                <div className="ebook-actions">
                  <button
                    className="ebook-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/dashboard/documents/${book.id}/read`);
                    }}
                  >
                    Continue Reading
                  </button>

                  {!book.isPremium && (
                    <button
                      className="ebook-remove-btn"
                      disabled={actionLoading === book.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromLibrary(book.id);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <section className="library-cta">
        <h2>Expand Your Legal Library</h2>
        <p>
          Discover more free and premium legal publications across jurisdictions
          and practice areas to grow your personal LawAfrica library.
        </p>

        <button className="outline-btn" onClick={() => navigate("/dashboard/explore")}>
          Browse All Publications
        </button>
      </section>
    </div>
  );
}
