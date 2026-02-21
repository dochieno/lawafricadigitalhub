// src/pages/dashboard/lawyers/Lawyers.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createLawyerInquiry, searchLawyers } from "../../../api/lawyers";

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
  const [showMoreFilters, setShowMoreFilters] = useState(false);

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
    // Initial load
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

  return (
    <div style={{ padding: "18px 18px 26px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end" }}>
        <div>
          <h2 style={{ margin: 0 }}>Find a Lawyer</h2>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            Search by name/firm and filter by location, practice area, and court level.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="modal-btn secondary" onClick={() => navigate("/dashboard/lawyers/inquiries")}>
            My Inquiries
          </button>
        </div>
      </div>

      {/* Filters (sticky-like block) */}
      <div
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 14,
          background: "white",
          boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
          position: "sticky",
          top: 78, // below topnav
          zIndex: 5,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 0.8fr", gap: 10, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or firm..."
            className="la-input"
            style={{ height: 42 }}
          />

          <label style={{ display: "flex", alignItems: "center", gap: 10, userSelect: "none" }}>
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
            />
            Verified only
          </label>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="modal-btn secondary" onClick={() => setShowMoreFilters((v) => !v)}>
              {showMoreFilters ? "Hide filters" : "More filters"}
            </button>
            <button className="modal-btn secondary" onClick={clearFilters}>Clear</button>
            <button className="modal-btn" onClick={load} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {showMoreFilters ? (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <input
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
              placeholder="CountryId (optional)"
              className="la-input"
              style={{ height: 42 }}
            />
            <input
              value={townId}
              onChange={(e) => setTownId(e.target.value)}
              placeholder="TownId (optional)"
              className="la-input"
              style={{ height: 42 }}
            />
            <input
              value={practiceAreaId}
              onChange={(e) => setPracticeAreaId(e.target.value)}
              placeholder="PracticeAreaId (optional)"
              className="la-input"
              style={{ height: 42 }}
            />
            <input
              value={highestCourtAllowedId}
              onChange={(e) => setHighestCourtAllowedId(e.target.value)}
              placeholder="CourtId (optional)"
              className="la-input"
              style={{ height: 42 }}
            />
          </div>
        ) : null}

        {err ? (
          <div style={{ marginTop: 10, color: "#b42318" }}>
            {err}
          </div>
        ) : null}
      </div>

      {/* Results */}
      <div style={{ marginTop: 16 }}>
        {loading ? (
          <div style={{ padding: 14, opacity: 0.7 }}>Loading lawyers…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 14, opacity: 0.8 }}>
            No lawyers found. Try adjusting your filters.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
            {items.map((x) => (
              <div
                key={x.id}
                style={{
                  background: "white",
                  borderRadius: 16,
                  padding: 14,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", gap: 12 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "#f3f4f6",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    {x.profileImageUrl ? (
                      <img
                        src={x.profileImageUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : null}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {x.displayName}
                      </div>
                      {x.isVerified ? (
                        <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "rgba(46,125,87,0.12)", color: "#2E7D57" }}>
                          Verified
                        </span>
                      ) : null}
                    </div>
                    {x.firmName ? (
                      <div style={{ opacity: 0.8, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {x.firmName}
                      </div>
                    ) : null}
                    <div style={{ opacity: 0.75, marginTop: 4, fontSize: 13 }}>
                      {(x.primaryTownName || "—")} • {(x.countryName || "—")}
                    </div>
                    {x.highestCourtName ? (
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                        Highest court: <b>{x.highestCourtName}</b>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                  <Link className="modal-btn secondary" to={`/dashboard/lawyers/${x.id}`} style={{ textDecoration: "none" }}>
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

      {/* Inquiry modal */}
      <Modal
        open={inqOpen}
        title={inqLawyer ? `Request help from ${inqLawyer.displayName}` : "Request help"}
        onClose={() => setInqOpen(false)}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ opacity: 0.8, fontSize: 13 }}>
            Describe your issue and we’ll send it to the lawyer. You must be logged in.
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
  );
}