// src/pages/dashboard/Home.jsx
import { useAuth } from "../../auth/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import api, { API_BASE_URL } from "../../api/client";
import "../../styles/dashboard.css";

function getServerOrigin() {
  return String(API_BASE_URL || "").replace(/\/api\/?$/i, "");
}

function buildCoverUrl(coverImagePath) {
  if (!coverImagePath) return null;

  const clean = String(coverImagePath)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^Storage\//, "");

  return `${getServerOrigin()}/storage/${clean}`;
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [ebooks, setEbooks] = useState([]);
  const [continueReadingDocId, setContinueReadingDocId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [readingStreak, setReadingStreak] = useState(0);
  /* const [recentItems, setRecentItems] = useState([]);*/

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const libraryRes = await api.get("/my-library");
        const progressRes = await api.get("/reading-progress/recent?take=5");

        const progressMap = {};
        (progressRes.data || []).forEach((p) => {
          progressMap[p.documentId] = p;
        });

        const mapped = (libraryRes.data || []).map((item) => {
          const progress = progressMap[item.id];

          return {
            id: item.id,
            title: item.title,
            coverImagePath: item.coverImagePath || null,
            progress: progress ? progress.percentage : 0,
          };
        });

        setEbooks(mapped);

        if (progressRes.data && progressRes.data.length > 0) {
          setContinueReadingDocId(progressRes.data[0].documentId);
        }
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  useEffect(() => {
    api.get("/reading-progress/recent?take=30").then((res) => {
      const days = new Set(res.data.map((x) => new Date(x.lastReadAt).toDateString()));

      let streak = 0;
      let day = new Date();

      while (days.has(day.toDateString())) {
        streak++;
        day.setDate(day.getDate() - 1);
      }

      setReadingStreak(streak);
    });
  }, []);

  // --------------------------------------------
  // LOAD RECENTLY READ
  // --------------------------------------------
  /*useEffect(() => {
    api
      .get("/reading-progress/recent?take=5")
      .then((res) => {
        setRecentItems(res.data || []);
      })
      .catch(() => {
        setRecentItems([]);
      });
  }, []);*/

  const continueReading =
    ebooks.find((b) => b.id === continueReadingDocId) || (ebooks.length > 0 ? ebooks[0] : null);

  const libraryPreview = ebooks.slice(0, 3);

  const ebookTitleMap = {};
  ebooks.forEach((b) => {
    ebookTitleMap[b.id] = b.title;
  });

  return (
    <div className="dashboard-container">
      {/* HEADER */}
      <header className="dashboard-header">
        <h1>Welcome back{user?.firstName ? `, ${user.firstName}` : ""} 👋</h1>
        <p>
          Ready to dive deeper into your legal research? Pick up where you left off or discover authoritative insights
          from LawAfrica’s trusted publications.
        </p>
        {readingStreak > 0 && <p className="reading-streak">🔥 {readingStreak}-day reading streak</p>}
      </header>

      {/* CONTINUE READING */}
      <section className="dashboard-section">
        <div className="section-header">
          <h2>Continue Reading</h2>
        </div>

        {loading ? (
          <p>Loading…</p>
        ) : continueReading ? (
          <div className="library-preview">
            <div
              className="library-preview-card"
              onClick={() => navigate(`/dashboard/documents/${continueReading.id}/read`)}
            >
              <div className="library-cover">
                {continueReading.coverImagePath ? (
                  <img
                    src={buildCoverUrl(continueReading.coverImagePath)}
                    alt={continueReading.title}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  "LAW"
                )}
              </div>

              <span>{continueReading.title}</span>

              {continueReading.progress > 0 && (
                <div className="progress-bar compact">
                  <div className="progress-fill" style={{ width: continueReading.progress + "%" }} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="empty-state">You haven’t started reading yet.</p>
        )}
      </section>

      {/* ================= RECENTLY READ ================= */}
      {/*
<section className="dashboard-section">
  <div className="section-header">
    <h2>Recently Read</h2>
  </div>

  <div className="recent-list">
    {recentItems.length > 0 ? (
      recentItems.map((item) => (
        <div
          key={item.documentId}
          className="recent-item"
          onClick={() =>
            navigate(`/dashboard/documents/${item.documentId}/read`)
          }
        >
          <div className="recent-meta">
            <div className="recent-title">
              {ebookTitleMap[item.documentId] || "Untitled document"}
            </div>

            <div className="recent-progress">
              <strong>{item.percentage}%</strong>
              <span>Page {item.pageNumber ?? "—"}</span>
            </div>
          </div>
        </div>
      ))
    ) : (
      <p className="empty-state">No recent activity yet.</p>
    )}
  </div>
</section>
*/}

      {/* LIBRARY PREVIEW */}
      <section className="dashboard-section">
        <div className="section-header">
          <h2>Your Library</h2>
          <button className="link-btn" onClick={() => navigate("/dashboard/library")}>
            View all →
          </button>
        </div>

        {loading ? (
          <p>Loading…</p>
        ) : libraryPreview.length > 0 ? (
          <div className="library-preview">
            {libraryPreview.map((book) => (
              <div
                key={book.id}
                className="library-preview-card"
                onClick={() => navigate(`/dashboard/documents/${book.id}`)}
              >
                <div className="library-cover">
                  {book.coverImagePath ? (
                    <img
                      src={buildCoverUrl(book.coverImagePath)}
                      alt={book.title}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    "LAW"
                  )}
                </div>
                <span>{book.title}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">Your library is empty.</p>
        )}
      </section>

      {/* EXPLORE CTA */}
      <section className="dashboard-explore-cta">
        <h2>Explore the Full LawAfrica Catalog</h2>
        <p>
          Discover free and premium legal publications across jurisdictions, categories, and practice areas curated for
          professionals and students.
        </p>

        <button className="outline-btn" onClick={() => navigate("/dashboard/explore")}>
          Browse All Publications
        </button>
      </section>
    </div>
  );
}
