import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { logout } from "../auth/auth";
import "../styles/dashboard.css";

export default function Dashboard() {
  const nav = useNavigate();

  const [overview, setOverview] = useState(null);
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    api.get("/analytics/user/overview").then(r => setOverview(r.data));
    api.get("/analytics/user/documents").then(r => setDocuments(r.data));
  }, []);

  if (!overview) return <div className="dashboard-container">Loading…</div>;

  const continueReading = documents[0];

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Welcome back 👋 Continue where you left off.</p>
      </div>

      {/* Continue Reading */}
      {continueReading && (
        <div className="dashboard-section highlight">
          <div className="section-header">
            <h2>Continue Reading</h2>
            <button
              className="link-btn"
              onClick={() => nav(`/reader/${continueReading.documentId}`)}
            >
              Open →
            </button>
          </div>

          <div className="continue-card">
            <div className="continue-info">
              <h3>{continueReading.title}</h3>

              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${continueReading.percentageCompleted}%` }}
                />
              </div>

              <div className="progress-text">
                {continueReading.percentageCompleted}% completed
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Library Preview */}
      <div className="dashboard-section">
        <div className="section-header">
          <h2>Your Library</h2>
          <button className="link-btn">View all</button>
        </div>

        <div className="library-preview">
          {documents.slice(0, 6).map(doc => (
            <div
              key={doc.documentId}
              className="library-preview-card"
              onClick={() => nav(`/reader/${doc.documentId}`)}
            >
              <div className="library-cover">
                LAW
              </div>
              <span>{doc.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Explore CTA */}
      <div className="dashboard-section explore-cta">
        <h2>Explore more legal documents</h2>
        <p>Browse statutes, regulations and case law.</p>
        <button className="primary-btn">Explore Library</button>
      </div>

      {/* Logout */}
      <div style={{ marginTop: 40 }}>
        <button
          className="outline-btn"
          onClick={() => {
            logout();
            window.location.href = "/login";
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
