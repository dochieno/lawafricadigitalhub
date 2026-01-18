// src/pages/dashboard/LawReports.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { isLawReportDocument } from "../../utils/isLawReportDocument";
import "../../styles/explore.css"; // reuse existing clean styling for now

/**
 * Step 1: Route + shell page (UI placeholder).
 * Step 2: We will implement full listing/filter/sort + details view + reader integration.
 */
export default function LawReports() {
  const navigate = useNavigate();

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Basic controls (wired now; actual filtering logic comes in Step 2)
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      try {
        setLoading(true);
        setError("");

        /**
         * For Step 1 we safely reuse /legal-documents and filter reports client-side.
         * Step 2: we can switch to a dedicated endpoint if you have one
         * (e.g. /law-reports) to fetch report metadata efficiently.
         */
        const res = await api.get("/legal-documents");
        const all = res.data || [];

        const reportsOnly = all.filter(isLawReportDocument);

        if (!cancelled) setDocs(reportsOnly);
      } catch (err) {
        console.error(err);
        if (!cancelled)
          setError("We couldn’t load Law Reports right now. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReports();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();

    // Step 1: minimal filter by title/description only (metadata filtering comes Step 2)
    let items = docs.filter((d) => {
      if (!query) return true;
      return (
        String(d.title || "").toLowerCase().includes(query) ||
        String(d.description || "").toLowerCase().includes(query)
      );
    });

    // Step 1: basic sorting
    if (sortBy === "az") {
      items = items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    } else if (sortBy === "za") {
      items = items.sort((a, b) => String(b.title || "").localeCompare(String(a.title || "")));
    } else {
      // "newest" fallback: if API provides createdAt/year we’ll use it in Step 2
      items = items;
    }

    return items;
  }, [docs, q, sortBy]);

  return (
    <div className="explore-container">
      <header className="explore-header">
        <h1 className="explore-title">Law Reports</h1>
        <p style={{ marginTop: 6, maxWidth: 820 }}>
          Browse LawAfrica Law Reports in one dedicated place. These reports are kept separate
          from the general catalog and your library.
        </p>

        <div className="explore-controls" style={{ marginTop: 14 }}>
          <input
            className="explore-search"
            placeholder="Search reports… (Step 2 will add ReportNumber, Parties, Citation, Court, Town)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="explore-search"
            style={{ maxWidth: 240 }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort"
          >
            <option value="newest">Sort: Newest (placeholder)</option>
            <option value="az">Sort: A → Z</option>
            <option value="za">Sort: Z → A</option>
          </select>
        </div>
      </header>

      {loading && <p className="explore-loading">Loading Law Reports…</p>}

      {!loading && error && (
        <div className="explore-error">
          <h2>Law Reports unavailable</h2>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="explore-empty">
          <h2>No reports found</h2>
          <p>Try a different search term.</p>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="explore-grid">
          {visible.map((d) => (
            <div
              key={d.id}
              className="explore-card"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/dashboard/documents/${d.id}`)} // Step 2 can change to a dedicated report details page if needed
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/dashboard/documents/${d.id}`);
                }
              }}
            >
              {/* Reuse the explore card layout (cover may be null for reports; ok) */}
              <div className="explore-cover">
                <span className="explore-cover-text">LLR</span>
              </div>

              <div className="explore-info">
                <div className="explore-badges">
                  <span className="badge premium">Report</span>
                </div>

                <h3 className="explore-doc-title">{d.title}</h3>

                <p className="explore-meta">
                  {d.countryName || "—"} • {d.category || "Law Report"}
                </p>

                <button
                  className="explore-btn explore-btn-premium"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/dashboard/documents/${d.id}`);
                  }}
                >
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
