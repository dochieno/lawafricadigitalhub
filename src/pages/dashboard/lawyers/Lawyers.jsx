// src/pages/dashboard/lawyers/Lawyers.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createLawyerInquiry, searchLawyers } from "../../../api/lawyers";
import "../../../styles/lawyers.css";

function toIntOrNull(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatErr(e) {
  return (
    e?.response?.data?.message ||
    e?.message ||
    "Something went wrong. Please try again."
  );
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="modal-btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export default function Lawyers() {
  const navigate = useNavigate();

  // Filters
  const [q, setQ] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [countryId, setCountryId] = useState("");
  const [townId, setTownId] = useState("");
  const [practiceAreaId, setPracticeAreaId] = useState("");
  const [highestCourtAllowedId, setHighestCourtAllowedId] = useState("");

  // Data
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  // Inquiry modal
  const [inqOpen, setInqOpen] = useState(false);
  const [inqLawyer, setInqLawyer] = useState(null);
  const [inqSummary, setInqSummary] = useState("");
  const [inqPreferred, setInqPreferred] = useState("call");
  const [inqSubmitting, setInqSubmitting] = useState(false);
  const [inqError, setInqError] = useState("");

  const params = useMemo(() => {
    return {
      q: (q ?? "").trim() || undefined,
      verifiedOnly,
      countryId: toIntOrNull(countryId) ?? undefined,
      townId: toIntOrNull(townId) ?? undefined,
      practiceAreaId: toIntOrNull(practiceAreaId) ?? undefined,
      highestCourtAllowedId: toIntOrNull(highestCourtAllowedId) ?? undefined,
      take: 30,
      skip: 0,
    };
  }, [q, verifiedOnly, countryId, townId, practiceAreaId, highestCourtAllowedId]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await searchLawyers(params);
      setItems(res?.items ?? []);
    } catch (e) {
      setErr(formatErr(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearFilters() {
    setQ("");
    setVerifiedOnly(true);
    setCountryId("");
    setTownId("");
    setPracticeAreaId("");
    setHighestCourtAllowedId("");
  }

  function openInquiry(lawyer) {
    setInqLawyer(lawyer);
    setInqSummary("");
    setInqPreferred("call");
    setInqError("");
    setInqOpen(true);
  }

  async function submitInquiry() {
    setInqError("");
    const summary = (inqSummary ?? "").trim();
    if (!summary) {
      setInqError("Problem summary is required.");
      return;
    }

    setInqSubmitting(true);
    try {
      await createLawyerInquiry({
        lawyerProfileId: inqLawyer?.id,
        practiceAreaId: toIntOrNull(practiceAreaId),
        townId: toIntOrNull(townId),
        problemSummary: summary,
        preferredContactMethod: inqPreferred,
      });

      setInqOpen(false);
      navigate("/dashboard/lawyers/inquiries");
    } catch (e) {
      setInqError(formatErr(e));
    } finally {
      setInqSubmitting(false);
    }
  }

  const resultCount = items.length;

  return (
    <div className="lawyers-page">
      <div className="lawyers-shell">
        {/* ============ LEFT SIDEBAR FILTERS ============ */}
        <aside className="lawyers-sidebar">
          <div className="lw-side-top">
            <div>
              <div className="lw-side-title">Filters</div>
              <div className="lw-side-meta">{resultCount} results</div>
            </div>

            <button className="lw-clear" onClick={clearFilters}>
              Clear all
            </button>
          </div>

          <div className="lw-row" style={{ marginTop: 12 }}>
            <input
              className="la-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, firm..."
            />
          </div>

          <details className="lw-section" open>
            <summary>
              Access
              <span style={{ opacity: 0.55 }}>▾</span>
            </summary>
            <div className="lw-body">
              <label className="lw-check">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => setVerifiedOnly(e.target.checked)}
                />
                Verified only
              </label>
            </div>
          </details>

          <details className="lw-section" open>
            <summary>
              Location
              <span style={{ opacity: 0.55 }}>▾</span>
            </summary>
            <div className="lw-body">
              <div className="lw-row">
                <input
                  className="la-input"
                  value={countryId}
                  onChange={(e) => setCountryId(e.target.value)}
                  placeholder="CountryId (optional)"
                />
                <input
                  className="la-input"
                  value={townId}
                  onChange={(e) => setTownId(e.target.value)}
                  placeholder="TownId (optional)"
                />
              </div>
            </div>
          </details>

          <details className="lw-section">
            <summary>
              Specialisation
              <span style={{ opacity: 0.55 }}>▾</span>
            </summary>
            <div className="lw-body">
              <div className="lw-row">
                <input
                  className="la-input"
                  value={practiceAreaId}
                  onChange={(e) => setPracticeAreaId(e.target.value)}
                  placeholder="PracticeAreaId (optional)"
                />
              </div>
            </div>
          </details>

          <details className="lw-section">
            <summary>
              Court level
              <span style={{ opacity: 0.55 }}>▾</span>
            </summary>
            <div className="lw-body">
              <div className="lw-row">
                <input
                  className="la-input"
                  value={highestCourtAllowedId}
                  onChange={(e) => setHighestCourtAllowedId(e.target.value)}
                  placeholder="CourtId (optional)"
                />
              </div>
            </div>
          </details>

          <div className="lw-row" style={{ marginTop: 14 }}>
            <button className="modal-btn" onClick={load} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>

            <button
              className="modal-btn secondary"
              onClick={() => navigate("/dashboard/lawyers/inquiries")}
            >
              My Inquiries
            </button>
          </div>

          {err ? <div className="lw-error" style={{ marginTop: 10 }}>{err}</div> : null}
        </aside>

        {/* ============ MAIN CONTENT ============ */}
        <section className="lawyers-main">
          <div className="lw-hero">
            <div className="lw-hero-top">
              <div>
                <span className="lw-pill">LawAfrica</span>
                <h2 className="lw-title">Find a Lawyer</h2>
                <div className="lw-subtitle">
                  Premium directory of verified legal professionals. Filter by location, court level, and specialization.
                </div>
              </div>

              <div className="lw-hero-actions">
                <div className="lw-count">{resultCount} results</div>
              </div>
            </div>

            {/* Extra premium search bar (mirrors sidebar search but convenient) */}
            <div className="lw-searchbar">
              <input
                className="la-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or firm..."
              />
              <div className="lw-search-actions">
                <button className="modal-btn secondary" onClick={clearFilters} disabled={loading}>
                  Clear
                </button>
                <button className="modal-btn" onClick={load} disabled={loading}>
                  {loading ? "Searching..." : "Search"}
                </button>
              </div>
            </div>
          </div>

          <div className="lw-results">
            {loading ? (
              <div className="lw-loading">Loading lawyers…</div>
            ) : resultCount === 0 ? (
              <div className="lw-empty">
                No lawyers found. Try adjusting your filters.
              </div>
            ) : (
              <div className="lw-grid">
                {items.map((x) => (
                  <div className="lw-card" key={x.id}>
                    <div className="lw-card-top">
                      <div className="lw-avatar">
                        {x.profileImageUrl ? (
                          <img src={x.profileImageUrl} alt="" />
                        ) : null}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="lw-name-row">
                          <div className="lw-name">{x.displayName}</div>
                          {x.isVerified ? <span className="lw-verified">Verified</span> : null}
                        </div>

                        {x.firmName ? <div className="lw-firm">{x.firmName}</div> : null}

                        <div className="lw-meta">
                          {(x.primaryTownName || "—")} • {(x.countryName || "—")}
                        </div>

                        {x.highestCourtName ? (
                          <div className="lw-court">
                            Highest court: <b>{x.highestCourtName}</b>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="lw-card-actions">
                      <Link
                        className="modal-btn secondary"
                        to={`/dashboard/lawyers/${x.id}`}
                        style={{ textDecoration: "none" }}
                      >
                        View profile
                      </Link>
                      <button className="modal-btn" onClick={() => openInquiry(x)}>
                        Request help
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Inquiry modal */}
        <Modal
          open={inqOpen}
          title={inqLawyer ? `Request help from ${inqLawyer.displayName}` : "Request help"}
          onClose={() => setInqOpen(false)}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              Describe your issue and we’ll send it to the lawyer.
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 13, opacity: 0.8 }}>Preferred contact method</div>
              <select
                className="la-input"
                style={{ height: 42 }}
                value={inqPreferred}
                onChange={(e) => setInqPreferred(e.target.value)}
              >
                <option value="call">Call</option>
                <option value="email">Email</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 13, opacity: 0.8 }}>Problem summary</div>
              <textarea
                className="la-input"
                style={{ minHeight: 120, paddingTop: 10 }}
                value={inqSummary}
                onChange={(e) => setInqSummary(e.target.value)}
                placeholder="Explain your issue briefly…"
              />
            </label>

            {inqError ? <div style={{ color: "#b42318" }}>{inqError}</div> : null}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <button className="modal-btn secondary" onClick={() => setInqOpen(false)} disabled={inqSubmitting}>
                Cancel
              </button>
              <button className="modal-btn" onClick={submitInquiry} disabled={inqSubmitting}>
                {inqSubmitting ? "Sending..." : "Send inquiry"}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}