// src/pages/dashboard/admin/lawyers/AdminLawyerProfiles.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import "../../../../styles/explore.css";
import {
  adminGetLawyerProfile,
  adminListLawyerProfiles,
  adminVerifyLawyerProfile,
} from "../../../../api/adminLawyers";
import { toApiAssetUrl } from "../../../../api/client";

function formatErr(e) {
  return e?.response?.data?.message || e?.message || "Something went wrong.";
}

function PillBtn({ active, children, onClick, title }) {
  return (
    <button
      className={`explore-btn ${active ? "" : "explore-btn-hotOutline"}`}
      onClick={onClick}
      title={title}
      style={{
        borderRadius: 999,
        padding: "8px 12px",
        fontWeight: 850,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
      type="button"
    >
      {children}
    </button>
  );
}

function Icon({ name }) {
  // tiny inline icons (no external deps)
  if (name === "refresh") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "open") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M14 3h7v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 14 21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M21 14v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "x") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "ban") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M6.5 6.5 17.5 17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

function StatusBadge({ status }) {
  const s = String(status || "").toLowerCase();
  if (s === "verified") return <span className="badge premium">Verified</span>;
  if (s === "pending") return <span className="badge">Pending</span>;
  if (s === "rejected") return <span className="badge">Rejected</span>;
  if (s === "suspended") return <span className="badge">Suspended</span>;
  return <span className="badge">Unknown</span>;
}

function Drawer({ open, title, onClose, children }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,8,23,0.55)",
        zIndex: 50,
        display: "grid",
        gridTemplateColumns: "1fr min(560px, 92vw)",
      }}
      role="dialog"
      aria-modal="true"
    >
      <div onClick={onClose} />

      <div
        style={{
          background: "#fff",
          height: "100vh",
          overflow: "auto",
          borderTopLeftRadius: 18,
          borderBottomLeftRadius: 18,
          boxShadow: "0 20px 60px rgba(2, 8, 23, 0.25)",
          borderLeft: "1px solid rgba(15,23,42,0.12)",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            background: "linear-gradient(135deg, rgba(107,35,59,0.08), rgba(255,255,255,0.96))",
            padding: 14,
            borderBottom: "1px solid rgba(15,23,42,0.10)",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {title}
              </div>
              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>Review details, documents and approve/reject.</div>
            </div>

            <button className="explore-btn explore-btn-hotOutline" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>

        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  );
}

export default function AdminLawyerProfiles() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("pending"); // default
  const [take, setTake] = useState(50);
  const [skip, setSkip] = useState(0);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState({ total: 0, items: [] });

  // Drawer
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [detail, setDetail] = useState(null);

  // Admin action UI
  const [actionBusy, setActionBusy] = useState(false);
  const [reason, setReason] = useState("");

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  const pageFrom = total === 0 ? 0 : skip + 1;
  const pageTo = Math.min(skip + take, total);

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await adminListLawyerProfiles({
        q: q.trim(),
        status: status === "all" ? "" : status,
        take,
        skip,
      });
      setData(res || { total: 0, items: [] });
    } catch (e) {
      setErr(formatErr(e));
    } finally {
      setLoading(false);
    }
  }, [q, status, take, skip]);

  useEffect(() => {
    load();
  }, [load]);

  const openDrawer = useCallback(async (id) => {
    setSelectedId(id);
    setOpen(true);
    setDetail(null);
    setDetailErr("");
    setReason("");

    setDetailLoading(true);
    try {
      const d = await adminGetLawyerProfile(id);
      setDetail(d);
    } catch (e) {
      setDetailErr(formatErr(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function doAction(action) {
    if (!selectedId) return;

    // for reject/suspend, allow reason but don't force (you asked to pause enforcement)
    setActionBusy(true);
    try {
      await adminVerifyLawyerProfile(selectedId, { action, reason });
      // reload detail + list
      await openDrawer(selectedId);
      await load();
    } catch (e) {
      alert(formatErr(e));
    } finally {
      setActionBusy(false);
    }
  }

  const statusOptions = useMemo(
    () => [
      { key: "pending", label: "Pending" },
      { key: "verified", label: "Verified" },
      { key: "rejected", label: "Rejected" },
      { key: "suspended", label: "Suspended" },
      { key: "all", label: "All" },
    ],
    []
  );

  return (
    <div className="explore-container">
      {/* Header */}
      <div className="explore-header">
        <div className="explore-titleRow">
          <div className="explore-brandTitle">
            <div className="explore-brandKicker">Admin</div>
            <h1 className="explore-title">
              Lawyer <span className="explore-titleAccent">Profiles</span>
            </h1>
            <p className="explore-subtitle">
              Review applications, verify lawyers, and inspect uploaded documents.
            </p>
          </div>

          <div className="explore-headerActions" style={{ alignItems: "center" }}>
            <button
              className="explore-btn explore-btn-hotOutline"
              onClick={load}
              disabled={loading}
              title="Refresh list"
              type="button"
              style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
            >
              <Icon name="refresh" />
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <span className="explore-resultsPill" style={{ whiteSpace: "nowrap" }}>
              {pageFrom}-{pageTo} of {total}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="explore-chipsRow">
          <div className="explore-chips" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {statusOptions.map((s) => (
              <PillBtn
                key={s.key}
                active={status === s.key}
                onClick={() => {
                  setSkip(0);
                  setStatus(s.key);
                }}
                title={`Filter: ${s.label}`}
              >
                {s.label}
              </PillBtn>
            ))}

            <div style={{ flex: 1, minWidth: 240 }} />

            <input
              className="explore-sidebarSearch"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, firm, email..."
              style={{ width: 340, maxWidth: "100%" }}
            />

            <button
              className="explore-btn explore-btn-hotOutline"
              onClick={() => {
                setSkip(0);
                load();
              }}
              disabled={loading}
              type="button"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {err ? <div className="explore-error" style={{ marginTop: 14 }}>{err}</div> : null}

      {/* List */}
      <div className="explore-empty" style={{ marginTop: 14 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(15,23,42,0.10)" }}>
                <th style={{ padding: 10 }}>Lawyer</th>
                <th style={{ padding: 10 }}>Status</th>
                <th style={{ padding: 10 }}>Location</th>
                <th style={{ padding: 10 }}>User</th>
                <th style={{ padding: 10, width: 180 }}>Created</th>
                <th style={{ padding: 10, width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 12, opacity: 0.7 }}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 12, opacity: 0.7 }}>No profiles found.</td></tr>
              ) : (
                items.map((x) => (
                  <tr key={x.id} style={{ borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 900 }}>{x.displayName}</div>
                      <div style={{ opacity: 0.75, fontSize: 12.5 }}>{x.firmName || "—"}</div>
                    </td>

                    <td style={{ padding: 10 }}>
                      <StatusBadge status={x.verificationStatus} />
                    </td>

                    <td style={{ padding: 10, opacity: 0.8 }}>
                      {x.primaryTownName || "—"}{x.countryName ? ` • ${x.countryName}` : ""}
                    </td>

                    <td style={{ padding: 10, opacity: 0.85 }}>
                      <div style={{ fontWeight: 800, fontSize: 12.5 }}>{x.userEmail || "—"}</div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>{x.userPhone || ""}</div>
                    </td>

                    <td style={{ padding: 10, opacity: 0.75, fontSize: 12.5 }}>
                      {x.createdAt ? new Date(x.createdAt).toLocaleString() : "—"}
                    </td>

                    <td style={{ padding: 10 }}>
                      <button
                        className="explore-btn explore-btn-hotOutline"
                        onClick={() => openDrawer(x.id)}
                        type="button"
                        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                        title="Open and review"
                      >
                        <Icon name="open" />
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ opacity: 0.75, fontSize: 12.5 }}>
            Showing <b>{pageFrom}</b>–<b>{pageTo}</b> of <b>{total}</b>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", opacity: 0.85, fontSize: 12.5 }}>
              Take
              <select
                className="explore-select"
                value={take}
                onChange={(e) => {
                  setSkip(0);
                  setTake(Number(e.target.value));
                }}
                style={{ height: 38 }}
              >
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={80}>80</option>
                <option value={120}>120</option>
              </select>
            </label>

            <button
              className="explore-btn explore-btn-hotOutline"
              onClick={() => setSkip((s) => Math.max(0, s - take))}
              disabled={loading || skip === 0}
              type="button"
            >
              Prev
            </button>

            <button
              className="explore-btn explore-btn-hotOutline"
              onClick={() => setSkip((s) => (s + take < total ? s + take : s))}
              disabled={loading || skip + take >= total}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Drawer */}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={detail?.displayName ? `Review: ${detail.displayName}` : "Review profile"}
      >
        {detailLoading ? (
          <div style={{ opacity: 0.75 }}>Loading profile…</div>
        ) : detailErr ? (
          <div className="explore-error">{detailErr}</div>
        ) : !detail ? (
          <div style={{ opacity: 0.75 }}>No details.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {/* Summary */}
            <div
              style={{
                border: "1px solid rgba(15,23,42,0.10)",
                borderRadius: 16,
                padding: 12,
                background: "linear-gradient(135deg, rgba(107,35,59,0.06), rgba(255,255,255,0.96))",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>{detail.displayName}</div>
                  <StatusBadge status={detail.verificationStatus} />
                </div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>
                  {detail.createdAt ? new Date(detail.createdAt).toLocaleString() : "—"}
                </div>
              </div>

              <div style={{ marginTop: 8, opacity: 0.85, fontSize: 12.5 }}>
                <div><b>Firm:</b> {detail.firmName || "—"}</div>
                <div><b>Location:</b> {detail.primaryTownName || "—"}{detail.countryName ? ` • ${detail.countryName}` : ""}</div>
                <div><b>User:</b> {detail.userEmail || "—"} {detail.userPhone ? `• ${detail.userPhone}` : ""}</div>
                <div><b>Highest court:</b> {detail.highestCourtAllowedName || "—"}</div>
              </div>

              {detail.bio ? (
                <div style={{ marginTop: 10, color: "rgba(15,23,42,0.78)", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                  {detail.bio}
                </div>
              ) : null}
            </div>

            {/* Tags */}
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>Practice areas</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(detail.practiceAreas || []).length ? (
                    detail.practiceAreas.map((p) => (
                      <span key={p} className="explore-chip">
                        <span className="explore-chipText">{p}</span>
                      </span>
                    ))
                  ) : (
                    <span style={{ opacity: 0.7 }}>—</span>
                  )}
                </div>
              </div>

              <div>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>Towns served</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(detail.townsServed || []).length ? (
                    detail.townsServed.map((t) => (
                      <span key={t} className="explore-chip">
                        <span className="explore-chipText">{t}</span>
                      </span>
                    ))
                  ) : (
                    <span style={{ opacity: 0.7 }}>—</span>
                  )}
                </div>
              </div>
            </div>

            {/* Documents */}
            <div>
              <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>Verification documents</div>

              {(detail.documents || []).length ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {detail.documents.map((d) => {
                    const url = d.urlPath ? toApiAssetUrl(d.urlPath) : "";
                    const sizeKb = d.sizeBytes ? Math.round(d.sizeBytes / 1024) : 0;

                    return (
                      <div
                        key={d.id}
                        style={{
                          border: "1px solid rgba(15,23,42,0.10)",
                          borderRadius: 14,
                          padding: 12,
                          background: "#fff",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900, fontSize: 13 }}>
                              {d.type || "Document"}
                            </div>
                            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {d.fileName || "—"} {sizeKb ? `• ${sizeKb} KB` : ""}
                            </div>
                          </div>

                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="explore-btn explore-btn-hotOutline"
                              style={{ textDecoration: "none", display: "inline-flex", gap: 8, alignItems: "center" }}
                              title="Open document in new tab"
                            >
                              <Icon name="open" />
                              View
                            </a>
                          ) : (
                            <span style={{ opacity: 0.6 }}>No link</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ opacity: 0.75 }}>No documents uploaded yet.</div>
              )}
            </div>

            {/* Action Reason */}
            <div>
              <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                Admin decision note (optional)
              </div>
              <textarea
                className="explore-sidebarSearch"
                style={{ minHeight: 90 }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for reject/suspend (optional for now)…"
              />
              <div className="explore-hint">
                We’ll enforce required docs per country later in a service.
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                className="explore-btn explore-btn-hotOutline"
                onClick={() => doAction("verify")}
                disabled={actionBusy}
                type="button"
                style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
                title="Mark as Verified"
              >
                <Icon name="check" />
                Verify
              </button>

              <button
                className="explore-btn"
                onClick={() => doAction("reject")}
                disabled={actionBusy}
                type="button"
                style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
                title="Reject profile"
              >
                <Icon name="x" />
                Reject
              </button>

              <button
                className="explore-btn"
                onClick={() => doAction("suspend")}
                disabled={actionBusy}
                type="button"
                style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
                title="Suspend profile"
              >
                <Icon name="ban" />
                Suspend
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}