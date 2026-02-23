// src/pages/dashboard/lawyers/LawyerInquiries.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import api from "../../../api/client";
import {
  getLawyerInquiriesForMe,
  getMyLawyerInquiries,
  getMyLawyerProfile,
} from "../../../api/lawyers";

import "../../../styles/explore.css";

function formatErr(e) {
  return e?.response?.data?.message || e?.message || "Something went wrong.";
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

// UI-friendly labels (your backend enum values are New/Contacted/InProgress/Closed/Spam)
function prettyStatus(s) {
  const x = (s || "").toLowerCase();
  if (x === "new") return "Open";
  if (x === "contacted") return "Acknowledged";
  if (x === "inprogress" || x === "in progress") return "In Progress";
  if (x === "closed") return "Closed";
  if (x === "spam") return "Spam";
  return s || "—";
}

function StatusPill({ status }) {
  const raw = status || "";
  const x = raw.toLowerCase();
  const style = {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 850,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(15,23,42,0.04)",
    color: "rgba(15,23,42,0.82)",
  };

  if (x === "new") style.background = "rgba(59,130,246,0.10)";
  if (x === "contacted") style.background = "rgba(234,179,8,0.14)";
  if (x === "inprogress" || x === "in progress") style.background = "rgba(16,185,129,0.12)";
  if (x === "closed") style.background = "rgba(107,35,59,0.12)";
  if (x === "spam") style.background = "rgba(239,68,68,0.10)";

  return <span style={style}>{prettyStatus(raw)}</span>;
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 8, 23, 0.55)",
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: "min(980px, 96vw)",
          maxHeight: "88vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 18,
          border: "1px solid rgba(15,23,42,0.10)",
          boxShadow: "0 25px 70px rgba(2, 8, 23, 0.35)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid rgba(15,23,42,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 950, fontSize: 15 }}>{title}</div>
          <button className="explore-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

export default function LawyerInquiries() {
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState("mine"); // mine | for-me
  const [isLawyer, setIsLawyer] = useState(false);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]);

  // filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(""); // New/Contacted/InProgress/Closed/Spam
  const [onlyClosed, setOnlyClosed] = useState(false);

  // detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [detail, setDetail] = useState(null);

  // actions state
  const [actionBusy, setActionBusy] = useState(false);
  const [actionErr, setActionErr] = useState("");

  // rating state
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");

  // detect lawyer (if has lawyer profile)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await getMyLawyerProfile();
        if (!alive) return;
        const ok = !!p?.id;
        setIsLawyer(ok);
        if (!ok) setTab("mine");
      } catch {
        if (!alive) return;
        setIsLawyer(false);
        setTab("mine");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function loadList(activeTab = tab) {
    setErr("");
    setLoading(true);
    try {
      const res =
        activeTab === "for-me"
          ? await getLawyerInquiriesForMe({ take: 50, skip: 0 })
          : await getMyLawyerInquiries({ take: 50, skip: 0 });

      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setErr(formatErr(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filtered = useMemo(() => {
    const query = (q || "").trim().toLowerCase();
    return (items || [])
      .filter((x) => {
        const st = String(x.status || "");
        if (onlyClosed && st !== "Closed") return false;
        if (status && st !== status) return false;

        if (!query) return true;
        const hay = [
          x.problemSummary,
          x.practiceAreaName,
          x.townName,
          x.requesterName,
          x.requesterEmail,
          x.requesterPhone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [items, q, onlyClosed, status]);

  async function openDetail(id) {
    setDetailOpen(true);
    setDetail(null);
    setDetailErr("");
    setActionErr("");
    setDetailLoading(true);

    try {
      const res = await api.get(`/lawyers/inquiries/${id}`);
      const d = res.data || null;
      setDetail(d);

      setStars(d?.ratingStars || 5);
      setComment(d?.ratingComment || "");
    } catch (e) {
      setDetailErr(formatErr(e));
    } finally {
      setDetailLoading(false);
    }
  }

  // auto-open via ?open=123
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const openId = sp.get("open");
    const idNum = openId ? Number(openId) : 0;
    if (idNum > 0) {
      openDetail(idNum);
      // remove param so refresh doesn’t keep reopening
      sp.delete("open");
      navigate({ pathname: location.pathname, search: sp.toString() ? `?${sp.toString()}` : "" }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  async function patchStatus(nextStatus, { outcome = null, note = "" } = {}) {
    if (!detail?.id) return;
    setActionErr("");
    setActionBusy(true);
    try {
      await api.patch(`/lawyers/inquiries/${detail.id}/status`, {
        status: nextStatus,
        outcome,
        note,
      });
      await openDetail(detail.id);
      await loadList(tab);
    } catch (e) {
      setActionErr(formatErr(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function closeInquiry(outcome) {
    if (!detail?.id) return;
    setActionErr("");
    setActionBusy(true);
    try {
      await api.post(`/lawyers/inquiries/${detail.id}/close`, {
        outcome,
        note: "",
      });
      await openDetail(detail.id);
      await loadList(tab);
    } catch (e) {
      setActionErr(formatErr(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function submitRating() {
    if (!detail?.id) return;
    setActionErr("");
    setActionBusy(true);
    try {
      await api.post(`/lawyers/inquiries/${detail.id}/rating`, {
        stars,
        comment: (comment || "").trim() || null,
      });
      await openDetail(detail.id);
      await loadList(tab);
    } catch (e) {
      setActionErr(formatErr(e));
    } finally {
      setActionBusy(false);
    }
  }

  const canShowForMe = isLawyer;

  return (
    <div className="explore-container">
      <div className="explore-header">
        <div className="explore-titleRow">
          <div className="explore-brandTitle">
            <div className="explore-brandKicker">LawAfrica</div>
            <h1 className="explore-title">
              My <span className="explore-titleDot">•</span>{" "}
              <span className="explore-titleAccent">Inquiries</span>
            </h1>
            <p className="explore-subtitle">
              Manage inquiries you’ve sent and (if you’re a lawyer) requests assigned to you.
            </p>
          </div>

          <div className="explore-headerActions" style={{ gap: 10 }}>
            <button className="explore-btn explore-btn-hotOutline" onClick={() => navigate("/dashboard/lawyers")}>
              ← Back
            </button>
            <button className="explore-btn" onClick={() => loadList(tab)} title="Reload">
              ↻ Refresh
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
        {/* LEFT FILTER NAV */}
        <div
          style={{
            position: "sticky",
            top: 92,
            alignSelf: "start",
            background: "#fff",
            borderRadius: 18,
            padding: 14,
            border: "1px solid rgba(15,23,42,0.10)",
            boxShadow: "0 10px 26px rgba(15,23,42,0.08)",
          }}
        >
          <div className="explore-filterSectionTitle" style={{ marginBottom: 10 }}>
            View
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className={`explore-btn ${tab === "mine" ? "explore-btn-hot" : ""}`}
              onClick={() => setTab("mine")}
            >
              My Requests
            </button>

            {canShowForMe ? (
              <button
                className={`explore-btn ${tab === "for-me" ? "explore-btn-hot" : ""}`}
                onClick={() => setTab("for-me")}
              >
                For Me
              </button>
            ) : null}
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
              Filters
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <div className="explore-hint" style={{ marginTop: 0 }}>
                Search
              </div>
              <input
                className="explore-sidebarSearch"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Summary, town, practice area…"
              />
            </label>

            <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
              <div className="explore-hint" style={{ marginTop: 0 }}>
                Status
              </div>
              <select className="explore-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="New">Open</option>
                <option value="Contacted">Acknowledged</option>
                <option value="InProgress">In Progress</option>
                <option value="Closed">Closed</option>
                <option value="Spam">Spam</option>
              </select>
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
              <input type="checkbox" checked={onlyClosed} onChange={(e) => setOnlyClosed(e.target.checked)} />
              <div style={{ fontWeight: 800, color: "rgba(15,23,42,0.78)" }}>Closed only</div>
            </label>
          </div>

          <div className="explore-hint" style={{ marginTop: 12 }}>
            Tip: Click an item to open details and update status / close / rate.
          </div>
        </div>

        {/* RIGHT CONTENT */}
        <div>
          {loading ? (
            <div className="explore-loading">Loading…</div>
          ) : err ? (
            <div className="explore-error">{err}</div>
          ) : filtered.length === 0 ? (
            <div className="explore-empty">No inquiries found.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filtered.map((x) => (
                <div
                  key={x.id}
                  style={{
                    background: "#fff",
                    borderRadius: 18,
                    border: "1px solid rgba(15,23,42,0.10)",
                    boxShadow: "0 10px 26px rgba(15,23,42,0.08)",
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <StatusPill status={x.status} />
                      <div style={{ fontWeight: 950 }}>Inquiry #{x.id}</div>
                      <div style={{ color: "rgba(15,23,42,0.55)", fontWeight: 800, fontSize: 12.5 }}>
                        {fmtDate(x.createdAt)}
                      </div>
                    </div>

                    <div style={{ marginTop: 8, color: "rgba(15,23,42,0.82)", fontWeight: 800, lineHeight: 1.45 }}>
                      {x.problemSummary}
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                        color: "rgba(15,23,42,0.62)",
                        fontWeight: 750,
                        fontSize: 12.5,
                      }}
                    >
                      <span>{x.practiceAreaName ? x.practiceAreaName : "—"}</span>
                      <span className="explore-titleDot">•</span>
                      <span>{x.townName ? x.townName : "—"}</span>

                      {tab === "for-me" && (x.requesterName || x.requesterEmail || x.requesterPhone) ? (
                        <>
                          <span className="explore-titleDot">•</span>
                          <span>
                            {x.requesterName || "Requester"}{" "}
                            {x.requesterPhone ? `(${x.requesterPhone})` : x.requesterEmail ? `(${x.requesterEmail})` : ""}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button className="explore-cta-btn" onClick={() => openDetail(x.id)}>
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DETAIL MODAL */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail ? `Inquiry #${detail.id}` : "Inquiry"}
      >
        {detailLoading ? (
          <div className="explore-loading">Loading…</div>
        ) : detailErr ? (
          <div className="explore-error">{detailErr}</div>
        ) : !detail ? (
          <div className="explore-empty">No detail.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14, alignItems: "start" }}>
            {/* LEFT */}
            <div
              style={{
                border: "1px solid rgba(15,23,42,0.10)",
                borderRadius: 18,
                padding: 14,
                background: "linear-gradient(135deg, rgba(107,35,59,0.04), rgba(255,255,255,0.96))",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <StatusPill status={detail.status} />
                {detail.outcome ? (
                  <span style={{ fontWeight: 900, color: "rgba(15,23,42,0.78)" }}>Outcome: {detail.outcome}</span>
                ) : null}
              </div>

              <div style={{ marginTop: 10, fontWeight: 950 }}>Problem summary</div>
              <div style={{ marginTop: 6, color: "rgba(15,23,42,0.78)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {detail.problemSummary}
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 6, color: "rgba(15,23,42,0.70)", fontWeight: 750, fontSize: 12.5 }}>
                <div>Created: {fmtDate(detail.createdAt)}</div>
                {detail.contactedAtUtc ? <div>Acknowledged: {fmtDate(detail.contactedAtUtc)}</div> : null}
                {detail.inProgressAtUtc ? <div>In progress: {fmtDate(detail.inProgressAtUtc)}</div> : null}
                {detail.closedAtUtc ? <div>Closed: {fmtDate(detail.closedAtUtc)}</div> : null}
              </div>

              {actionErr ? <div style={{ marginTop: 10, color: "#b42318", fontWeight: 800 }}>{actionErr}</div> : null}
            </div>

            {/* RIGHT ACTIONS */}
            <div
              style={{
                border: "1px solid rgba(15,23,42,0.10)",
                borderRadius: 18,
                padding: 14,
                background: "#fff",
              }}
            >
              <div className="explore-filterSectionTitle" style={{ marginBottom: 10 }}>
                Actions
              </div>

              {/* Lawyer actions */}
              {tab === "for-me" && String(detail.status || "") !== "Closed" && String(detail.status || "") !== "Spam" ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <button className="explore-btn explore-btn-hot" disabled={actionBusy} onClick={() => patchStatus("Contacted")}>
                    Mark Acknowledged
                  </button>
                  <button className="explore-btn explore-btn-hotOutline" disabled={actionBusy} onClick={() => patchStatus("InProgress")}>
                    Mark In Progress
                  </button>

                  <div style={{ height: 1, background: "rgba(15,23,42,0.10)", margin: "6px 0" }} />

                  <div style={{ fontWeight: 900, color: "rgba(15,23,42,0.75)" }}>Close inquiry</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <button className="explore-btn" disabled={actionBusy} onClick={() => closeInquiry("Resolved")}>
                      Close as Resolved
                    </button>
                    <button className="explore-btn" disabled={actionBusy} onClick={() => closeInquiry("Declined")}>
                      Close as Declined
                    </button>
                    <button className="explore-btn" disabled={actionBusy} onClick={() => closeInquiry("NotResolved")}>
                      Close as Not Resolved
                    </button>
                    <button className="explore-btn" disabled={actionBusy} onClick={() => closeInquiry("Duplicate")}>
                      Close as Duplicate
                    </button>
                    <button className="explore-btn" disabled={actionBusy} onClick={() => closeInquiry("NoResponse")}>
                      Close as No Response
                    </button>
                    <button className="explore-btn" disabled={actionBusy} onClick={() => patchStatus("Spam")}>
                      Mark as Spam
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Requester actions */}
              {tab === "mine" && String(detail.status || "") !== "Closed" && String(detail.status || "") !== "Spam" ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 900, color: "rgba(15,23,42,0.75)" }}>Close inquiry</div>
                  <button className="explore-btn" disabled={actionBusy} onClick={() => closeInquiry("NotResolved")}>
                    Close as Not Resolved
                  </button>
                  <button className="explore-btn" disabled={actionBusy} onClick={() => closeInquiry("NoResponse")}>
                    Close as No Response
                  </button>
                  <button className="explore-btn" disabled={actionBusy} onClick={() => closeInquiry("Resolved")}>
                    Close as Resolved
                  </button>
                </div>
              ) : null}

              {/* Rating (requester only, closed only) */}
              {tab === "mine" && String(detail.status || "") === "Closed" ? (
                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  <div style={{ height: 1, background: "rgba(15,23,42,0.10)", margin: "6px 0" }} />

                  <div style={{ fontWeight: 950 }}>Rate this engagement</div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <div className="explore-hint" style={{ marginTop: 0 }}>Stars (1–5)</div>
                    <select className="explore-select" value={stars} onChange={(e) => setStars(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <div className="explore-hint" style={{ marginTop: 0 }}>Comment (optional)</div>
                    <textarea
                      className="explore-sidebarSearch"
                      style={{ minHeight: 110 }}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Share a brief review…"
                    />
                  </label>

                  <button className="explore-cta-btn" disabled={actionBusy} onClick={submitRating}>
                    {actionBusy ? "Saving…" : "Submit rating"}
                  </button>

                  {detail.ratingStars ? (
                    <div className="explore-hint" style={{ marginTop: 0 }}>
                      Already rated: <b>{detail.ratingStars}/5</b>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}