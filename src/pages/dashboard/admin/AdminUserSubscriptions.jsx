import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/adminUsers.css";
import AdminPageFooter from "../../../components/AdminPageFooter";
import { isGlobalAdmin } from "../../../auth/auth";

/* =========================
   Helpers
========================= */
function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if (v.message) return String(v.message);
    if (v.title) return String(v.title);
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return "An unexpected error occurred.";
    }
  }
  return String(v);
}

function normalizeApiError(e) {
  const status = e?.response?.status;
  const payload = e?.response?.data;

  const serverMsg =
    (typeof payload === "string" && payload) ||
    payload?.message ||
    payload?.error ||
    payload?.title ||
    "";

  if (status === 401) return "Your session has expired. Please log in again.";
  if (status === 403) return serverMsg || "You don’t have permission to do that (Global Admin only).";
  return serverMsg || toText(e?.message || "Request failed.");
}

function parseStatus(v) {
  // Your backend returns SubscriptionStatus enum as string or number
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  const n = Number(s);
  if (!Number.isNaN(n)) return n;

  const lower = s.toLowerCase();
  if (lower === "pending") return 1;
  if (lower === "active") return 2;
  if (lower === "expired") return 3;
  if (lower === "suspended") return 4;

  return 0;
}

function statusLabel(v) {
  const n = parseStatus(v);
  if (n === 1) return "Pending";
  if (n === 2) return "Active";
  if (n === 3) return "Expired";
  if (n === 4) return "Suspended";
  return String(v ?? "—");
}

function statusTone(v) {
  const n = parseStatus(v);
  if (n === 2) return "success";
  if (n === 1) return "warn";
  if (n === 4) return "danger";
  if (n === 3) return "neutral";
  return "neutral";
}

function fmtDate(d) {
  if (!d) return "—";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(d) {
  if (!d) return "—";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* =========================
   AU mini UI
========================= */
function Badge({ tone = "neutral", children, title }) {
  return (
    <span className={`au-badge au-badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

function Icon({ name }) {
  switch (name) {
    case "search":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M10.5 18a7.5 7.5 0 1 1 5.3-12.8A7.5 7.5 0 0 1 10.5 18Zm6.2-1.2L22 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "spinner":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="au-spin">
          <path
            d="M12 2a10 10 0 1 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "pause":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "play":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M8 5v14l11-7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "refresh":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M21 3v6h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

function IconBtn({ tone = "neutral", disabled, title, onClick, children }) {
  return (
    <button
      type="button"
      className={`au-iconBtn au-iconBtn-${tone}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

/* =========================
   Page
========================= */
export default function AdminUserSubscriptions() {
  const meIsGlobal = isGlobalAdmin();

  // data
  const [rows, setRows] = useState([]);

  // server meta
  const [nowUtc, setNowUtc] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);

  // filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("activeWindow"); // activeWindow | all | 1|2|3|4
  const [trialFilter, setTrialFilter] = useState("all"); // all | trial | paid

  // include expired windows (backend flag)
  const includeExpiredWindows = status !== "activeWindow";

  // ui
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null); // {type,text}

  // action modal
  const [openAction, setOpenAction] = useState(false);
  const [actionRow, setActionRow] = useState(null);
  const [actionMode, setActionMode] = useState(null); // "suspend" | "unsuspend"
  const [actionNotes, setActionNotes] = useState("");

  const qDebounce = useRef(null);

  function showToast(type, text) {
    setToast({ type, text });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2400);
  }

  function closeActionModal() {
    if (busy) return;
    setOpenAction(false);
    setActionRow(null);
    setActionMode(null);
    setActionNotes("");
  }

  function openActionModal(row, mode) {
    if (!meIsGlobal) {
      showToast("error", "Global Admin only.");
      return;
    }
    setActionRow(row);
    setActionMode(mode);
    setActionNotes("");
    setOpenAction(true);
  }

  async function loadAll(nextPage = page) {
    setError("");
    setLoading(true);

    try {
      const params = {
        page: nextPage,
        pageSize,
        includeExpiredWindows,
      };

      // status mapping to controller:
      // - status=null + includeExpiredWindows=false => backend returns active window only
      // - status=... => backend filters by status
      if (status === "1" || status === "2" || status === "3" || status === "4") {
        // backend expects enum; it can parse string names too, but number is safest
        const n = Number(status);
        // If your controller model-binds enum, it may accept numeric
        params.status = n;
      } else if (status === "all") {
        // no status filter, but includeExpiredWindows=true to show everything
        // keep params.status undefined
      } else if (status === "activeWindow") {
        // backend default window filter (includeExpiredWindows=false)
      }

      if (trialFilter === "trial") params.isTrial = true;
      if (trialFilter === "paid") params.isTrial = false;

      if (q.trim()) params.q = q.trim();

      const res = await api.get("/subscriptions/admin/list", { params });
      const data = res.data?.data ?? res.data;

      setNowUtc(data?.now ?? null);
      setPage(data?.page ?? nextPage);
      setPageSize(data?.pageSize ?? pageSize);
      setTotal(data?.total ?? 0);
      setRows(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(normalizeApiError(e) || "Failed to load subscriptions.");
    } finally {
      setLoading(false);
    }
  }

  // initial load
  useEffect(() => {
    loadAll(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reload when filters change (debounced for q)
  useEffect(() => {
    window.clearTimeout(qDebounce.current);

    qDebounce.current = window.setTimeout(() => {
      loadAll(1);
    }, q.trim() ? 280 : 0);

    return () => window.clearTimeout(qDebounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, trialFilter, pageSize]);

  const kpis = useMemo(() => {
    const totalShown = rows.length;
    let active = 0;
    let suspended = 0;
    let expired = 0;
    let pending = 0;
    let trials = 0;
    let paid = 0;
    let activeNow = 0;

    for (const r of rows) {
      const st = parseStatus(r.status ?? r.Status);
      if (st === 2) active += 1;
      if (st === 4) suspended += 1;
      if (st === 3) expired += 1;
      if (st === 1) pending += 1;

      const isTrial = !!(r.isTrial ?? r.IsTrial);
      if (isTrial) trials += 1;
      else paid += 1;

      const isActiveNow = !!(r.isActiveNow ?? r.isActiveNow);
      if (isActiveNow) activeNow += 1;
    }

    return { totalShown, active, activeNow, suspended, expired, pending, trials, paid };
  }, [rows]);

  const pageCount = useMemo(() => {
    if (!total || !pageSize) return 1;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  async function submitSuspendOrUnsuspend(e) {
    e?.preventDefault?.();
    if (!actionRow || !actionMode) return;

    const id = actionRow.id ?? actionRow.Id;
    const user = actionRow.user?.username || actionRow.user?.email || actionRow.user?.phoneNumber || "—";
    const product = actionRow.productName ?? actionRow.contentProductName ?? "—";

    const label = actionMode === "suspend" ? "Suspend" : "Unsuspend";
    const msg = `Confirm ${label}?\n\nUser: ${user}\nProduct: ${product}${actionNotes ? `\nNotes: ${actionNotes}` : ""}`;
    if (!window.confirm(msg)) return;

    setBusy(true);
    setError("");

    try {
      // ✅ Add these endpoints in backend (recommended):
      // POST /api/subscriptions/admin/{id}/suspend
      // POST /api/subscriptions/admin/{id}/unsuspend
      await api.post(`/subscriptions/admin/${id}/${actionMode}`, {
        notes: actionNotes?.trim() || null,
      });

      showToast("success", actionMode === "suspend" ? "Subscription suspended" : "Subscription unsuspended");
      closeActionModal();
      await loadAll(page);
    } catch (e2) {
      showToast("error", normalizeApiError(e2) || "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="au-wrap">
      {toast ? (
        <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>
          {toast.text}
        </div>
      ) : null}

      {/* HERO */}
      <header className="au-hero">
        <div className="au-heroLeft">
          <div className="au-titleRow">
            <div className="au-titleStack">
              <div className="au-kicker">LawAfrica • Admin</div>
              <h1 className="au-title">Public User Subscriptions</h1>
              <div className="au-subtitle">
                Monitor trials and paid subscriptions. Global Admin can suspend/unsuspend.
                {nowUtc ? (
                  <span className="au-muted" style={{ marginLeft: 8 }}>
                    Server time: {fmtDateTime(nowUtc)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="au-heroRight">
              <button
                className="au-refresh"
                type="button"
                onClick={() => loadAll(page)}
                disabled={busy || loading}
                title="Refresh"
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  {loading ? <Icon name="spinner" /> : <Icon name="refresh" />} {loading ? "Refreshing…" : "Refresh"}
                </span>
              </button>

              <div className="au-mePill" title="Permission gate" style={{ marginLeft: 10 }}>
                <span className={`au-meDot ${meIsGlobal ? "ga" : ""}`} />
                <span className="au-meText">{meIsGlobal ? "Global Admin session" : "Admin session"}</span>
              </div>
            </div>
          </div>

          {error ? <div className="au-error">{error}</div> : null}

          {/* TOPBAR */}
          <div className="au-topbar">
            <div className="au-search">
              <span className="au-searchIcon" aria-hidden="true">
                <Icon name="search" />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by username, email, phone, product…"
                aria-label="Search"
              />
              {q ? (
                <button className="au-clear" type="button" onClick={() => setQ("")} aria-label="Clear">
                  ✕
                </button>
              ) : null}
            </div>

            <div className="au-topbarRight" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="au-sort" title="Status filter">
                <span className="au-sortLabel">Scope</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={loading || busy}>
                  <option value="activeWindow">Active window (default)</option>
                  <option value="all">All (no status filter)</option>
                  <option value="2">Active</option>
                  <option value="1">Pending</option>
                  <option value="4">Suspended</option>
                  <option value="3">Expired</option>
                </select>
              </div>

              <div className="au-sort" title="Trial vs paid">
                <span className="au-sortLabel">Type</span>
                <select value={trialFilter} onChange={(e) => setTrialFilter(e.target.value)} disabled={loading || busy}>
                  <option value="all">All</option>
                  <option value="trial">Trials</option>
                  <option value="paid">Paid</option>
                </select>
              </div>

              <div className="au-sort" title="Rows per page">
                <span className="au-sortLabel">Page size</span>
                <select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))} disabled={loading || busy}>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                </select>
              </div>
            </div>
          </div>

          {/* KPI CARDS */}
          <div className="au-kpis">
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Shown</div>
              <div className="au-kpiValue">{loading ? "…" : kpis.totalShown}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Active now</div>
              <div className="au-kpiValue">{loading ? "…" : kpis.activeNow}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Trials</div>
              <div className="au-kpiValue">{loading ? "…" : kpis.trials}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Paid</div>
              <div className="au-kpiValue">{loading ? "…" : kpis.paid}</div>
            </div>
          </div>
        </div>
      </header>

      {/* TABLE PANEL */}
      <section className="au-panel">
        <div className="au-panelTop">
          <div className="au-panelTitle">{loading ? "Loading…" : "Subscription directory"}</div>
          <div className="au-muted">
            {loading ? "—" : `Total matching: ${total} • Page ${page} / ${pageCount}`}
          </div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table au-tableModern">
            <thead>
              <tr>
                <th style={{ width: "28%" }}>User</th>
                <th style={{ width: "18%" }}>Product</th>
                <th style={{ width: "10%" }}>Type</th>
                <th style={{ width: "10%" }}>Status</th>
                <th style={{ width: "14%" }}>Start</th>
                <th style={{ width: "14%" }}>End</th>
                <th style={{ width: "10%" }}>Active now?</th>
                <th className="au-thRight" style={{ width: "12%" }}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="au-empty">No subscriptions found for the current filters.</div>
                  </td>
                </tr>
              ) : null}

              {rows.map((r) => {
                const id = r.id ?? r.Id;
                const u = r.user ?? {};
                const user = r.user || {};
                const firstName = user.FirstName || "";
                const lastName = user.LastName || "";
                const fullName = `${firstName} ${lastName}`.trim();
                const displayName =
                fullName || user.Username || "—";

                const email = u.email ?? u.Email ?? "—";
                const phone = u.phoneNumber ?? u.PhoneNumber ?? "—";

                const productName = r.productName ?? r.contentProductName ?? "—";
                const isTrial = !!(r.isTrial ?? r.IsTrial);

                const st = r.status ?? r.Status;
                const stNum = parseStatus(st);

                const start = r.startDate ?? r.StartDate;
                const end = r.endDate ?? r.EndDate;

                const isActiveNow = !!(r.isActiveNow ?? r.isActiveNow);
                const isSuspended = stNum === 4;

                return (
                  <tr key={id}>
                    <td>
                      <div className="au-userCell">
                        <span className={`au-dot ${isActiveNow ? "on" : ""}`} />
                        <div className="au-userMeta">
                          <div className="au-userName">{displayName}</div>
                          <div className="au-userSub">
                            <span className="au-muted">{email}</span>
                            <span className="au-sep">•</span>
                            <span className="au-muted">{phone}</span>
                            <span className="au-sep">•</span>
                            <span className="au-muted au-mono">#{id}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>{productName}</td>

                    <td>
                      <Badge tone={isTrial ? "warn" : "info"} title={isTrial ? "Trial subscription" : "Paid subscription"}>
                        {isTrial ? "Trial" : "Paid"}
                      </Badge>
                    </td>

                    <td>
                      <Badge tone={statusTone(st)}>{statusLabel(st)}</Badge>
                    </td>

                    <td className="au-muted">{fmtDate(start)}</td>
                    <td className="au-muted">{fmtDate(end)}</td>

                    <td>
                      <Badge tone={isActiveNow ? "success" : "neutral"}>{isActiveNow ? "Yes" : "No"}</Badge>
                    </td>

                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        {!isSuspended ? (
                          <IconBtn
                            tone="danger"
                            disabled={busy || loading || !meIsGlobal}
                            title={meIsGlobal ? "Suspend subscription" : "Global Admin only"}
                            onClick={() => openActionModal(r, "suspend")}
                          >
                            <Icon name="pause" />
                          </IconBtn>
                        ) : (
                          <IconBtn
                            tone="success"
                            disabled={busy || loading || !meIsGlobal}
                            title={meIsGlobal ? "Unsuspend subscription" : "Global Admin only"}
                            onClick={() => openActionModal(r, "unsuspend")}
                          >
                            <Icon name="play" />
                          </IconBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="au-panelBottom" style={{ justifyContent: "space-between" }}>
          <div className="au-muted">
            Tip: “Active window” matches your backend default (Status=Active + Start/End window).
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              className="au-chip"
              type="button"
              disabled={loading || busy || page <= 1}
              onClick={() => {
                const next = Math.max(1, page - 1);
                setPage(next);
                loadAll(next);
              }}
            >
              Prev
            </button>

            <span className="au-muted" style={{ minWidth: 120, textAlign: "center" }}>
              Page <b>{page}</b> / {pageCount}
            </span>

            <button
              className="au-chip"
              type="button"
              disabled={loading || busy || page >= pageCount}
              onClick={() => {
                const next = Math.min(pageCount, page + 1);
                setPage(next);
                loadAll(next);
              }}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <AdminPageFooter right={<span className="admin-footer-muted">LawAfrica • Admin Console</span>} />

      {/* =========================
         ACTION MODAL (Suspend/Unsuspend)
      ========================= */}
      {openAction && actionRow && actionMode && (
        <div className="admin-modal-overlay" onClick={closeActionModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">{actionMode === "suspend" ? "Suspend Subscription" : "Unsuspend Subscription"}</h3>
                <div className="admin-modal-subtitle">
                  {actionRow?.user?.username || actionRow?.user?.email || "User"} — {actionRow?.productName || "Product"}
                </div>
              </div>

              <button
                type="button"
                className="admin-modal-xbtn"
                onClick={closeActionModal}
                disabled={busy}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <form className="admin-modal-body admin-modal-scroll" onSubmit={submitSuspendOrUnsuspend}>
              <div className="admin-field">
                <label>Notes (optional)</label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Short reason / context…"
                  rows={4}
                />
              </div>

              <div className="admin-modal-foot">
                <button className="admin-btn" type="button" onClick={closeActionModal} disabled={busy}>
                  Cancel
                </button>
                <button className="admin-btn primary" type="submit" disabled={busy}>
                  {busy ? "Saving…" : actionMode === "suspend" ? "Suspend" : "Unsuspend"}
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                Endpoint expected: <span className="au-mono">POST /api/subscriptions/admin/{"{id}"}/{actionMode}</span>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
