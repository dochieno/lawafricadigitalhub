// src/pages/dashboard/admin/AdminInstitutionSubscriptions.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminCrud.css"; // keep modals/toggles
import "../../../styles/adminUsers.css"; // ✅ reuse the branded “au-*” system
import AdminPageFooter from "../../../components/AdminPageFooter";
import { isGlobalAdmin } from "../../../auth/auth";

/* =========================
   Helpers (kept)
========================= */
function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if (v.message) return String(v.message);
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
  if (status === 403)
    return (
      serverMsg ||
      "You don’t have permission to do that. This action requires Global Admin approval."
    );

  return serverMsg || toText(e?.message || "Request failed.");
}

function formatPrettyDate(d) {
  if (!d) return "—";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatPrettyDateTime(d) {
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

function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseStatus(v) {
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
  return "neutral";
}

function isValidNow(row) {
  const status = row.status ?? row.Status;
  const start = row.startDate ?? row.StartDate;
  const end = row.endDate ?? row.EndDate;

  const n = parseStatus(status);
  if (n !== 2) return false;

  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;

  const now = Date.now();
  return s.getTime() <= now && e.getTime() > now;
}

function parseAuditAction(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  return String(v);
}

// --------------------
// Pending request helpers (UX)
// --------------------
function getPendingRequestId(row) {
  return row.pendingRequestId ?? row.PendingRequestId ?? null;
}

function getPendingRequestType(row) {
  const t = row.pendingRequestType ?? row.PendingRequestType ?? null;

  if (t == null) return null;

  if (typeof t === "string") {
    const lower = t.toLowerCase();
    if (lower.includes("unsuspend")) return "Unsuspend";
    if (lower.includes("suspend")) return "Suspend";
    return t;
  }

  // If your enum maps: 1 = Suspend, 2 = Unsuspend
  if (typeof t === "number") {
    if (t === 1) return "Suspend";
    if (t === 2) return "Unsuspend";
    return String(t);
  }

  return String(t);
}

function getPendingRequestedAt(row) {
  return row.pendingRequestedAt ?? row.PendingRequestedAt ?? null;
}

function pendingLabel(row) {
  const type = getPendingRequestType(row);
  if (!type) return null;
  return `${type} pending`;
}

// --------------------
// Forms
// --------------------
const emptyCreateForm = {
  institutionId: "",
  contentProductId: "",
  durationInMonths: "12",
  startDate: "",
};

const emptyRenewForm = {
  durationInMonths: "12",
  startDate: "",
};

/* =========================
   AU mini UI (match AdminUsers)
========================= */
function Badge({ tone = "neutral", children }) {
  return <span className={`au-badge au-badge-${tone}`}>{children}</span>;
}

function Chip({ active, children, ...props }) {
  return (
    <button type="button" className={`au-chip ${active ? "active" : ""}`} {...props}>
      {children}
    </button>
  );
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
    case "refresh":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M21 3v6h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "history":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M3 3v6h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3.05 13a9 9 0 1 0 .93-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 7v6l4 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "file":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "repeat":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M17 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 23l-4-4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
    default:
      return null;
  }
}

export default function AdminInstitutionSubscriptions() {
  const [rows, setRows] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [products, setProducts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // ✅ unified UX: toast + rich error box (keep your strings too)
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [toast, setToast] = useState(null); // {type,text}

  // Create
  const [openCreate, setOpenCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyCreateForm, startDate: todayYmd() });

  // Renew
  const [openRenew, setOpenRenew] = useState(false);
  const [renewForm, setRenewForm] = useState({ ...emptyRenewForm });
  const [renewTarget, setRenewTarget] = useState(null);

  // Audit modal
  const [openAudit, setOpenAudit] = useState(false);
  const [auditTarget, setAuditTarget] = useState(null);
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Requests history modal
  const [openReqLog, setOpenReqLog] = useState(false);
  const [reqLogTarget, setReqLogTarget] = useState(null);
  const [reqLogRows, setReqLogRows] = useState([]);
  const [reqLogLoading, setReqLogLoading] = useState(false);

  // Request action modal (notes)
  const [openReqAction, setOpenReqAction] = useState(false);
  const [reqActionRow, setReqActionRow] = useState(null);
  const [reqActionMode, setReqActionMode] = useState(null); // "suspend" | "unsuspend"
  const [reqActionNotes, setReqActionNotes] = useState("");

  const meIsGlobal = isGlobalAdmin();

  function showToast(type, text) {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 2200);
  }

  async function loadAll() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await api.get("/institutions/subscriptions");
      const data = res.data?.data ?? res.data;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setError(normalizeApiError(e) || "Failed to load subscriptions.");
    } finally {
      setLoading(false);
    }
  }

  async function loadInstitutions() {
    try {
      const res = await api.get("/Institutions");
      const data = res.data?.data ?? res.data;
      setInstitutions(Array.isArray(data) ? data : []);
    } catch {
      setInstitutions([]);
    }
  }

  async function loadProducts() {
    try {
      const res = await api.get("/content-products");
      const data = res.data?.data ?? res.data;
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    }
  }

  useEffect(() => {
    loadAll();
    loadInstitutions();
    loadProducts();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return rows
      .filter((r) => {
        if (statusFilter === "all") return true;
        const n = parseStatus(r.status ?? r.Status);
        return n === Number(statusFilter);
      })
      .filter((r) => {
        if (!s) return true;
        const inst = (r.institutionName ?? r.InstitutionName ?? "").toLowerCase();
        const prod = (r.contentProductName ?? r.ContentProductName ?? "").toLowerCase();
        const st = statusLabel(r.status ?? r.Status).toLowerCase();
        const p = (pendingLabel(r) ?? "").toLowerCase();
        return inst.includes(s) || prod.includes(s) || st.includes(s) || p.includes(s);
      });
  }, [rows, q, statusFilter]);

  const summary = useMemo(() => {
    const total = filtered.length;
    let active = 0;
    let validNow = 0;
    let pending = 0;
    let suspended = 0;

    for (const r of filtered) {
      const st = parseStatus(r.status ?? r.Status);
      if (st === 2) active += 1;
      if (st === 1) pending += 1;
      if (st === 4) suspended += 1;
      if (isValidNow(r)) validNow += 1;
    }
    return { total, active, validNow, pending, suspended };
  }, [filtered]);

  // --------------------
  // Modal open/close
  // --------------------
  function closeCreateModal() {
    if (busy) return;
    setOpenCreate(false);
  }

  function closeRenewModal() {
    if (busy) return;
    setOpenRenew(false);
    setRenewTarget(null);
  }

  function openCreateModal() {
    setError("");
    setInfo("");
    setCreateForm({ ...emptyCreateForm, startDate: todayYmd() });
    setOpenCreate(true);
  }

  function openRenewModalFor(row) {
    setError("");
    setInfo("");

    const statusNum = parseStatus(row.status ?? row.Status);
    if (statusNum === 4) {
      setError("This subscription is suspended. Unsuspend it before renewing.");
      return;
    }

    setRenewTarget(row);
    setRenewForm({ ...emptyRenewForm, startDate: "" });
    setOpenRenew(true);
  }

  async function openAuditModalFor(row) {
    setError("");
    setInfo("");
    setAuditTarget(row);
    setAuditRows([]);
    setOpenAudit(true);

    const id = row.id ?? row.Id;
    setAuditLoading(true);
    try {
      const res = await api.get(`/institutions/subscriptions/${id}/audit`);
      const data = res.data?.data ?? res.data;
      setAuditRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setAuditRows([]);
      setError(normalizeApiError(e) || "Failed to load audit history.");
    } finally {
      setAuditLoading(false);
    }
  }

  function closeAuditModal() {
    if (busy || auditLoading) return;
    setOpenAudit(false);
    setAuditTarget(null);
    setAuditRows([]);
  }

  async function openReqLogModalFor(row) {
    setError("");
    setInfo("");
    setReqLogTarget(row);
    setReqLogRows([]);
    setOpenReqLog(true);

    const id = row.id ?? row.Id;
    setReqLogLoading(true);
    try {
      const res = await api.get(`/institutions/subscriptions/${id}/requests`);
      const data = res.data?.data ?? res.data;
      setReqLogRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setReqLogRows([]);
      setError(normalizeApiError(e) || "Failed to load request history.");
    } finally {
      setReqLogLoading(false);
    }
  }

  function closeReqLogModal() {
    if (busy || reqLogLoading) return;
    setOpenReqLog(false);
    setReqLogTarget(null);
    setReqLogRows([]);
  }

  function openRequestActionModal(row, mode) {
    if (busy) return;

    const pendingId = getPendingRequestId(row);
    if (pendingId) {
      setError("There’s already a pending request for this subscription. Please wait for review.");
      return;
    }

    setError("");
    setInfo("");
    setReqActionRow(row);
    setReqActionMode(mode);
    setReqActionNotes("");
    setOpenReqAction(true);
  }

  function closeRequestActionModal() {
    if (busy) return;
    setOpenReqAction(false);
    setReqActionRow(null);
    setReqActionMode(null);
    setReqActionNotes("");
  }

  async function submitRequestAction(e) {
    e?.preventDefault?.();
    if (!reqActionRow || !reqActionMode) return;

    const row = reqActionRow;
    const id = row.id ?? row.Id;

    const inst = (row.institutionName ?? row.InstitutionName) || "—";
    const prod = (row.contentProductName ?? row.ContentProductName) || "—";

    const mode = reqActionMode;
    const isSuspend = mode === "suspend";

    const actionLabel = meIsGlobal
      ? isSuspend
        ? "Suspend"
        : "Unsuspend"
      : isSuspend
      ? "Request suspension"
      : "Request unsuspension";

    const confirmMsg = `Confirm ${actionLabel}?\n\nInstitution: ${inst}\nProduct: ${prod}${
      reqActionNotes ? `\nNotes: ${reqActionNotes}` : ""
    }`;

    if (!window.confirm(confirmMsg)) return;

    setBusy(true);
    setError("");
    setInfo("");

    try {
      if (meIsGlobal) {
        await api.post(
          `/institutions/subscriptions/${id}/${isSuspend ? "suspend" : "unsuspend"}`,
          { notes: reqActionNotes || null }
        );
        showToast("success", isSuspend ? "Subscription suspended" : "Subscription updated");
      } else {
        const res = await api.post(
          `/institutions/subscriptions/${id}/${isSuspend ? "request-suspend" : "request-unsuspend"}`,
          { notes: reqActionNotes || null }
        );
        showToast("success", res.data?.message || "Request submitted for approval");
      }

      closeRequestActionModal();
      await loadAll();
    } catch (err) {
      setError(normalizeApiError(err) || "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  // Create / Extend
  async function createOrExtend(e) {
    e?.preventDefault?.();
    setError("");
    setInfo("");

    if (!createForm.institutionId) return setError("Please select an institution.");
    if (!createForm.contentProductId) return setError("Please select a product.");

    const months = Number(createForm.durationInMonths);
    if (!months || months <= 0) return setError("Duration must be greater than 0.");

    const startDateIso = createForm.startDate ? `${createForm.startDate}T00:00:00Z` : null;

    const payload = {
      institutionId: Number(createForm.institutionId),
      contentProductId: Number(createForm.contentProductId),
      durationInMonths: months,
      startDate: startDateIso,
    };

    setBusy(true);
    try {
      const res = await api.post("/institutions/subscriptions", payload);
      const endDate = res.data?.endDate ?? res.data?.EndDate ?? res.data?.subscription?.endDate;
      const status = res.data?.status ?? res.data?.Status;

      showToast(
        "success",
        `Saved • ${statusLabel(status)} • Ends ${endDate ? formatPrettyDate(endDate) : "—"}`
      );
      closeCreateModal();
      await loadAll();
    } catch (e2) {
      setError(normalizeApiError(e2) || "Create/extend failed.");
    } finally {
      setBusy(false);
    }
  }

  // Renew
  async function renew(e) {
    e?.preventDefault?.();
    setError("");
    setInfo("");

    if (!renewTarget) return setError("No subscription selected.");

    const statusNum = parseStatus(renewTarget.status ?? renewTarget.Status);
    if (statusNum === 4) return setError("This subscription is suspended. Unsuspend it before renewing.");

    const months = Number(renewForm.durationInMonths);
    if (!months || months <= 0) return setError("Duration must be greater than 0.");

    const startDateIso = renewForm.startDate ? `${renewForm.startDate}T00:00:00Z` : null;

    const inst = (renewTarget.institutionName ?? renewTarget.InstitutionName) || "—";
    const prod = (renewTarget.contentProductName ?? renewTarget.ContentProductName) || "—";
    const msg = `Confirm renewal?\n\nInstitution: ${inst}\nProduct: ${prod}\nMonths: ${months}${
      renewForm.startDate ? `\nStart: ${renewForm.startDate}` : "\nStart: automatic (Rule A)"
    }`;

    if (!window.confirm(msg)) return;

    setBusy(true);
    try {
      const id = renewTarget.id ?? renewTarget.Id;
      const res = await api.post(`/institutions/subscriptions/${id}/renew`, {
        durationInMonths: months,
        startDate: startDateIso,
      });

      const endDate = res.data?.endDate ?? res.data?.EndDate;
      const status = res.data?.status ?? res.data?.Status;

      showToast(
        "success",
        `Renewed • ${statusLabel(status)} • Ends ${endDate ? formatPrettyDate(endDate) : "—"}`
      );
      closeRenewModal();
      await loadAll();
    } catch (e2) {
      setError(normalizeApiError(e2) || "Renew failed.");
    } finally {
      setBusy(false);
    }
  }

  function suspend(row) {
    openRequestActionModal(row, "suspend");
  }

  function unsuspend(row) {
    openRequestActionModal(row, "unsuspend");
  }

  return (
    <div className="au-wrap">
      {toast ? (
        <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>
          {toast.text}
        </div>
      ) : null}

      <header className="au-hero">
        <div className="au-heroLeft">
          <div className="au-titleRow">
            <div className="au-titleStack">
              <div className="au-kicker">LawAfrica • Admin</div>
              <h1 className="au-title">Institution Subscriptions</h1>
              <div className="au-subtitle">
                Manage subscriptions — create, extend, renew, and review history.
                {!meIsGlobal ? (
                  <span className="au-muted" style={{ marginLeft: 8 }}>
                    Some actions require Global Admin approval.
                  </span>
                ) : null}
              </div>
            </div>

            <div className="au-heroRight">
              <button className="au-refresh" type="button" onClick={() => loadAll()} disabled={busy || loading}>
                {loading ? "Refreshing…" : "Refresh"}
              </button>

              <button className="au-refresh" type="button" onClick={openCreateModal} disabled={busy} style={{ marginLeft: 10 }}>
                + New
              </button>
            </div>
          </div>

          {error ? <div className="au-error">{error}</div> : null}

          <div className="au-topbar">
            <div className="au-search">
              <span className="au-searchIcon" aria-hidden="true">
                <Icon name="search" />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by institution, product, status…"
                aria-label="Search subscriptions"
              />
              {q ? (
                <button className="au-clear" type="button" onClick={() => setQ("")} aria-label="Clear search">
                  ✕
                </button>
              ) : null}
            </div>

            <div className="au-topbarRight" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="au-filterGroup" style={{ padding: 0 }}>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                  style={{
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.12)",
                    padding: "0 12px",
                    background: "transparent",
                    color: "inherit",
                    outline: "none",
                  }}
                >
                  <option value="all">All statuses</option>
                  <option value="1">Pending</option>
                  <option value="2">Active</option>
                  <option value="3">Expired</option>
                  <option value="4">Suspended</option>
                </select>
              </div>

              <div className="au-mePill" title="Permission gate">
                <span className={`au-meDot ${meIsGlobal ? "ga" : ""}`} />
                <span className="au-meText">{meIsGlobal ? "Global Admin session" : "Admin session"}</span>
              </div>
            </div>
          </div>

          <div className="au-kpis">
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Shown</div>
              <div className="au-kpiValue">{summary.total}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Active</div>
              <div className="au-kpiValue">{summary.active}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Valid now</div>
              <div className="au-kpiValue">{summary.validNow}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Pending</div>
              <div className="au-kpiValue">{summary.pending}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Suspended</div>
              <div className="au-kpiValue">{summary.suspended}</div>
            </div>
          </div>

          <div className="au-filters" style={{ marginTop: 12 }}>
            <div className="au-filterGroup">
              <div className="au-filterLabel">Status quick filters</div>
              <div className="au-chips">
                <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
                  All
                </Chip>
                <Chip active={statusFilter === "2"} onClick={() => setStatusFilter("2")}>
                  Active
                </Chip>
                <Chip active={statusFilter === "1"} onClick={() => setStatusFilter("1")}>
                  Pending
                </Chip>
                <Chip active={statusFilter === "4"} onClick={() => setStatusFilter("4")}>
                  Suspended
                </Chip>
                <Chip active={statusFilter === "3"} onClick={() => setStatusFilter("3")}>
                  Expired
                </Chip>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="au-panel">
        <div className="au-panelTop">
          <div className="au-panelTitle">{loading ? "Loading…" : "Subscription directory"}</div>
          <div className="au-muted">{loading ? "—" : `${filtered.length} record(s)`}</div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table au-tableModern">
            <thead>
              <tr>
                <th>Institution</th>
                <th>Product</th>
                <th>Status</th>
                <th>End</th>
                <th>Valid now?</th>
                <th className="au-thRight">Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="au-empty">
                    No subscriptions found for the current filters.
                  </td>
                </tr>
              ) : null}

              {filtered.map((r) => {
                const id = r.id ?? r.Id;
                const inst = r.institutionName ?? r.InstitutionName ?? "—";
                const prod = r.contentProductName ?? r.ContentProductName ?? "—";
                const statusVal = r.status ?? r.Status;
                const end = r.endDate ?? r.EndDate;

                const validNow = isValidNow(r);

                const statusNum = parseStatus(statusVal);
                const isSuspended = statusNum === 4;

                const pendingId = getPendingRequestId(r);
                const pendingText = pendingLabel(r);
                const pendingAt = getPendingRequestedAt(r);

                const actionDisabled = !!pendingId || busy;
                const pendingTitle = pendingText
                  ? `${pendingText}${pendingAt ? ` • requested ${formatPrettyDateTime(pendingAt)}` : ""}`
                  : "";

                return (
                  <tr key={id}>
                    <td style={{ fontWeight: 900 }}>
                      {inst}
                      {pendingText ? (
                        <div style={{ marginTop: 8 }}>
                          <Badge tone="warn">
                            <span title={pendingTitle}>{pendingText}</span>
                          </Badge>
                        </div>
                      ) : null}
                    </td>

                    <td>{prod}</td>

                    <td>
                      <Badge tone={statusTone(statusVal)}>{statusLabel(statusVal)}</Badge>
                    </td>

                    <td>{formatPrettyDate(end)}</td>

                    <td>
                      <Badge tone={validNow ? "success" : "neutral"}>{validNow ? "Yes" : "No"}</Badge>
                    </td>

                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        <IconBtn tone="neutral" disabled={busy} title="View audit history" onClick={() => openAuditModalFor(r)}>
                          {busy && auditTarget && (auditTarget.id ?? auditTarget.Id) === id && auditLoading ? (
                            <Icon name="spinner" />
                          ) : (
                            <Icon name="history" />
                          )}
                        </IconBtn>

                        <IconBtn
                          tone="neutral"
                          disabled={busy}
                          title="View request / approval logs"
                          onClick={() => openReqLogModalFor(r)}
                        >
                          {busy && reqLogTarget && (reqLogTarget.id ?? reqLogTarget.Id) === id && reqLogLoading ? (
                            <Icon name="spinner" />
                          ) : (
                            <Icon name="file" />
                          )}
                        </IconBtn>

                        <IconBtn
                          tone="neutral"
                          disabled={busy || isSuspended}
                          title={isSuspended ? "Unsuspend first" : "Renew subscription"}
                          onClick={() => openRenewModalFor(r)}
                        >
                          <Icon name="repeat" />
                        </IconBtn>

                        {!isSuspended ? (
                          <IconBtn
                            tone="danger"
                            disabled={actionDisabled}
                            title={
                              pendingId
                                ? `Disabled: ${pendingTitle}`
                                : meIsGlobal
                                ? "Suspend subscription"
                                : "Request suspension (needs approval)"
                            }
                            onClick={() => suspend(r)}
                          >
                            <Icon name="pause" />
                          </IconBtn>
                        ) : (
                          <IconBtn
                            tone="success"
                            disabled={actionDisabled}
                            title={
                              pendingId
                                ? `Disabled: ${pendingTitle}`
                                : meIsGlobal
                                ? "Unsuspend subscription"
                                : "Request unsuspension (needs approval)"
                            }
                            onClick={() => unsuspend(r)}
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

        <div className="au-panelBottom">
          <div className="au-muted">Suspended subscriptions must be unsuspended before renewing.</div>
          <div className="au-muted">{meIsGlobal ? "Global Admin can apply suspend/unsuspend immediately." : "Non-Global Admin submits requests for approval."}</div>
        </div>
      </section>

      <AdminPageFooter right={<span className="admin-footer-muted">LawAfrica • Admin Console</span>} />

      {/* ========================= */}
      {/* CREATE MODAL */}
      {/* ========================= */}
      {openCreate && (
        <div className="admin-modal-overlay" onClick={closeCreateModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">Create / Extend Subscription</h3>
                <div className="admin-modal-subtitle">Choose an institution, product, and duration.</div>
              </div>

              <button
                type="button"
                className="admin-modal-xbtn"
                onClick={closeCreateModal}
                disabled={busy}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <form className="admin-modal-body admin-modal-scroll" onSubmit={createOrExtend}>
              <div className="admin-grid">
                <div className="admin-field">
                  <label>Institution *</label>
                  <select
                    value={createForm.institutionId}
                    onChange={(e) => setCreateForm((p) => ({ ...p, institutionId: e.target.value }))}
                  >
                    <option value="">Select institution…</option>
                    {institutions.map((i) => (
                      <option key={i.id ?? i.Id} value={i.id ?? i.Id}>
                        {i.name ?? i.Name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Product *</label>
                  <select
                    value={createForm.contentProductId}
                    onChange={(e) => setCreateForm((p) => ({ ...p, contentProductId: e.target.value }))}
                  >
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p.id ?? p.Id} value={p.id ?? p.Id}>
                        {p.name ?? p.Name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Start date</label>
                  <input
                    type="date"
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm((p) => ({ ...p, startDate: e.target.value }))}
                  />
                  <div className="admin-help" style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>
                    Leave as today, or choose a future date to schedule activation.
                  </div>
                </div>

                <div className="admin-field">
                  <label>Duration (months) *</label>
                  <select
                    value={createForm.durationInMonths}
                    onChange={(e) => setCreateForm((p) => ({ ...p, durationInMonths: e.target.value }))}
                  >
                    <option value="1">1</option>
                    <option value="3">3</option>
                    <option value="6">6</option>
                    <option value="12">12</option>
                    <option value="24">24</option>
                  </select>
                </div>
              </div>

              <div className="admin-modal-foot">
                <button className="admin-btn" type="button" onClick={closeCreateModal} disabled={busy}>
                  Cancel
                </button>
                <button className="admin-btn primary" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Create / Extend"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================= */}
      {/* RENEW MODAL */}
      {/* ========================= */}
      {openRenew && renewTarget && (
        <div className="admin-modal-overlay" onClick={closeRenewModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">Renew Subscription</h3>
                <div className="admin-modal-subtitle">
                  If still active, renewal extends from the current end date.
                </div>
              </div>

              <button
                type="button"
                className="admin-modal-xbtn"
                onClick={closeRenewModal}
                disabled={busy}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <form className="admin-modal-body admin-modal-scroll" onSubmit={renew}>
              <div className="admin-grid">
                <div className="admin-field admin-span2">
                  <label>Target</label>
                  <div style={{ fontWeight: 800, paddingTop: 8 }}>
                    {(renewTarget.institutionName ?? renewTarget.InstitutionName) || "—"} —{" "}
                    {(renewTarget.contentProductName ?? renewTarget.ContentProductName) || "—"}
                  </div>
                </div>

                <div className="admin-field">
                  <label>Optional start date</label>
                  <input
                    type="date"
                    value={renewForm.startDate}
                    onChange={(e) => setRenewForm((p) => ({ ...p, startDate: e.target.value }))}
                  />
                  <div className="admin-help" style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>
                    Leave empty to renew automatically.
                  </div>
                </div>

                <div className="admin-field">
                  <label>Duration (months) *</label>
                  <select
                    value={renewForm.durationInMonths}
                    onChange={(e) => setRenewForm((p) => ({ ...p, durationInMonths: e.target.value }))}
                  >
                    <option value="1">1</option>
                    <option value="3">3</option>
                    <option value="6">6</option>
                    <option value="12">12</option>
                    <option value="24">24</option>
                  </select>
                </div>
              </div>

              <div className="admin-modal-foot">
                <button className="admin-btn" type="button" onClick={closeRenewModal} disabled={busy}>
                  Cancel
                </button>
                <button className="admin-btn primary" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Renew"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================= */}
      {/* AUDIT MODAL */}
      {/* ========================= */}
      {openAudit && auditTarget && (
        <div className="admin-modal-overlay" onClick={closeAuditModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1100 }}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">Audit History</h3>
                <div className="admin-modal-subtitle">
                  {(auditTarget.institutionName ?? auditTarget.InstitutionName) || "—"} —{" "}
                  {(auditTarget.contentProductName ?? auditTarget.ContentProductName) || "—"}
                </div>
              </div>

              <button
                type="button"
                className="admin-modal-xbtn"
                onClick={closeAuditModal}
                disabled={busy || auditLoading}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              {auditLoading && <div className="admin-inline-loading">Loading history…</div>}

              {!auditLoading && auditRows.length === 0 && (
                <div className="admin-alert" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
                  No audit entries found.
                </div>
              )}

              {!auditLoading && auditRows.length > 0 && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: "16%" }}>When</th>
                      <th style={{ width: "12%" }}>Action</th>
                      <th style={{ width: "10%" }}>UserId</th>
                      <th style={{ width: "12%" }}>Old Status</th>
                      <th style={{ width: "12%" }}>New Status</th>
                      <th style={{ width: "14%" }}>Old End</th>
                      <th style={{ width: "14%" }}>New End</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((a) => {
                      const aid = a.id ?? a.Id;
                      const when = a.createdAt ?? a.CreatedAt;
                      const action = a.action ?? a.Action;
                      const userId = a.performedByUserId ?? a.PerformedByUserId;

                      const oldStatus = a.oldStatus ?? a.OldStatus;
                      const newStatus = a.newStatus ?? a.NewStatus;

                      const oldEnd = a.oldEndDate ?? a.OldEndDate;
                      const newEnd = a.newEndDate ?? a.NewEndDate;

                      const notes = a.notes ?? a.Notes;

                      return (
                        <tr key={aid}>
                          <td>{formatPrettyDateTime(when)}</td>
                          <td>
                            <span className="admin-pill muted">{parseAuditAction(action)}</span>
                          </td>
                          <td>{userId ?? "—"}</td>
                          <td>
                            <Badge tone={statusTone(oldStatus)}>{statusLabel(oldStatus)}</Badge>
                          </td>
                          <td>
                            <Badge tone={statusTone(newStatus)}>{statusLabel(newStatus)}</Badge>
                          </td>
                          <td>{formatPrettyDate(oldEnd)}</td>
                          <td>{formatPrettyDate(newEnd)}</td>
                          <td style={{ color: "#374151" }}>{notes || <span style={{ color: "#9ca3af" }}>—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeAuditModal} disabled={busy || auditLoading}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================= */}
      {/* REQUEST / APPROVAL LOG MODAL */}
      {/* ========================= */}
      {openReqLog && reqLogTarget && (
        <div className="admin-modal-overlay" onClick={closeReqLogModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1100 }}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">Request / Approval Logs</h3>
                <div className="admin-modal-subtitle">
                  {(reqLogTarget.institutionName ?? reqLogTarget.InstitutionName) || "—"} —{" "}
                  {(reqLogTarget.contentProductName ?? reqLogTarget.ContentProductName) || "—"}
                </div>
              </div>

              <button
                type="button"
                className="admin-modal-xbtn"
                onClick={closeReqLogModal}
                disabled={busy || reqLogLoading}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              {reqLogLoading && <div className="admin-inline-loading">Loading request logs…</div>}

              {!reqLogLoading && reqLogRows.length === 0 && (
                <div className="admin-alert" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
                  No request logs found for this subscription.
                </div>
              )}

              {!reqLogLoading && reqLogRows.length > 0 && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: "10%" }}>Req #</th>
                      <th style={{ width: "12%" }}>Type</th>
                      <th style={{ width: "12%" }}>Status</th>
                      <th style={{ width: "18%" }}>Requested By</th>
                      <th style={{ width: "18%" }}>Created</th>
                      <th style={{ width: "18%" }}>Reviewed</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reqLogRows.map((x) => {
                      const rid = x.id ?? x.Id;
                      const type = x.requestType ?? x.RequestType;
                      const status = x.status ?? x.Status;

                      const requestedBy = x.requestedByUsername ?? x.RequestedByUsername ?? "—";
                      const created = x.createdAt ?? x.CreatedAt;

                      const reviewedBy = x.reviewedByUsername ?? x.ReviewedByUsername ?? null;
                      const reviewedAt = x.reviewedAt ?? x.ReviewedAt ?? null;

                      const reqNotes = x.requestNotes ?? x.RequestNotes ?? "";
                      const revNotes = x.reviewNotes ?? x.ReviewNotes ?? "";

                      const typeText =
                        typeof type === "string"
                          ? type
                          : Number(type) === 1
                          ? "Suspend"
                          : Number(type) === 2
                          ? "Unsuspend"
                          : String(type ?? "—");

                      const statusText =
                        typeof status === "string"
                          ? status
                          : Number(status) === 1
                          ? "Pending"
                          : Number(status) === 2
                          ? "Approved"
                          : Number(status) === 3
                          ? "Rejected"
                          : String(status ?? "—");

                      const statusTone2 =
                        String(statusText).toLowerCase().includes("approved")
                          ? "success"
                          : String(statusText).toLowerCase().includes("rejected")
                          ? "danger"
                          : "neutral";

                      return (
                        <tr key={rid}>
                          <td>{rid}</td>
                          <td>
                            <Badge tone="neutral">{typeText}</Badge>
                          </td>
                          <td>
                            <Badge tone={statusTone2}>{statusText}</Badge>
                          </td>
                          <td>{requestedBy}</td>
                          <td>{formatPrettyDateTime(created)}</td>
                          <td>
                            {reviewedBy || reviewedAt ? (
                              <div>
                                <div style={{ fontWeight: 800 }}>{reviewedBy || "—"}</div>
                                <div style={{ color: "#6b7280", fontSize: 12 }}>
                                  {reviewedAt ? formatPrettyDateTime(reviewedAt) : "—"}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: "#9ca3af" }}>—</span>
                            )}
                          </td>
                          <td style={{ color: "#374151" }}>
                            {reqNotes || revNotes ? (
                              <div style={{ display: "grid", gap: 6 }}>
                                {reqNotes ? (
                                  <div>
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>Request</div>
                                    <div>{reqNotes}</div>
                                  </div>
                                ) : null}
                                {revNotes ? (
                                  <div>
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>Review</div>
                                    <div>{revNotes}</div>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <span style={{ color: "#9ca3af" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeReqLogModal} disabled={busy || reqLogLoading}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================= */}
      {/* REQUEST ACTION MODAL */}
      {/* ========================= */}
      {openReqAction && reqActionRow && reqActionMode && (
        <div className="admin-modal-overlay" onClick={closeRequestActionModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">
                  {meIsGlobal
                    ? reqActionMode === "suspend"
                      ? "Suspend Subscription"
                      : "Unsuspend Subscription"
                    : reqActionMode === "suspend"
                    ? "Request Suspension"
                    : "Request Unsuspension"}
                </h3>
                <div className="admin-modal-subtitle">
                  {(reqActionRow.institutionName ?? reqActionRow.InstitutionName) || "—"} —{" "}
                  {(reqActionRow.contentProductName ?? reqActionRow.ContentProductName) || "—"}
                </div>
              </div>

              <button
                type="button"
                className="admin-modal-xbtn"
                onClick={closeRequestActionModal}
                disabled={busy}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <form className="admin-modal-body admin-modal-scroll" onSubmit={submitRequestAction}>
              <div className="admin-field">
                <label>Notes (optional)</label>
                <textarea
                  value={reqActionNotes}
                  onChange={(e) => setReqActionNotes(e.target.value)}
                  placeholder="Add a short reason or context…"
                  rows={4}
                />
              </div>

              <div className="admin-modal-foot">
                <button className="admin-btn" type="button" onClick={closeRequestActionModal} disabled={busy}>
                  Cancel
                </button>
                <button className="admin-btn primary" type="submit" disabled={busy}>
                  {busy
                    ? "Submitting…"
                    : meIsGlobal
                    ? reqActionMode === "suspend"
                      ? "Suspend"
                      : "Unsuspend"
                    : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
