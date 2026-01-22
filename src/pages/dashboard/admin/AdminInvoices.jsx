// src/pages/dashboard/admin/AdminInvoices.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminUsers.css"; // ✅ reuse same styles as AdminUsers for uniformity
import "../../../styles/invoice.css"; // optional (kept)

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(amount, currency = "KES") {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function friendlyApiError(e) {
  if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return "";
  if (!e?.response) {
    return (
      e?.message ||
      "Network error. Check API base URL / CORS / server availability (no response received)."
    );
  }
  const status = e?.response?.status;
  const title = e?.response?.data?.title;
  const detail = e?.response?.data?.detail;

  if (title || detail) return `${title ?? "Request failed"}${detail ? ` — ${detail}` : ""}`;
  if (typeof e?.response?.data === "string" && e.response.data.trim()) return e.response.data;

  if (status === 401) return "You are not authorized. Please log in again.";
  if (status === 403) return "You don’t have permission to manage invoices.";
  if (status === 404) return "Endpoint not found. Check that the request is going to /api/admin/invoices.";
  if (status >= 500) return "Server error while loading invoices.";
  return "Request failed. Please try again.";
}

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

function Icon({ name }) {
  switch (name) {
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
    case "gear":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M19.4 15a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.5-2.3.6a7.7 7.7 0 0 0-1.7-1l-.3-2.4H9.8l-.3 2.4a7.7 7.7 0 0 0-1.7 1l-2.3-.6-2 3.5 2 1.2a7.8 7.8 0 0 0 .1 2l-2 1.2 2 3.5 2.3-.6a7.7 7.7 0 0 0 1.7 1l.3 2.4h4.4l.3-2.4a7.7 7.7 0 0 0 1.7-1l2.3.6 2-3.5-2-1.2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "refresh":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M21 12a9 9 0 1 1-2.64-6.36"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M21 3v6h-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "eye":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      );
    case "print":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M6 14h12v8H6v-8Z" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    default:
      return null;
  }
}

function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "paid") return "success";
  if (s === "issued") return "info";
  if (s === "partiallypaid" || s === "partially-paid") return "warn";
  if (s === "void") return "danger";
  return "neutral"; // draft / unknown
}

function normStatusKey(s) {
  const x = String(s || "").toLowerCase();
  if (x === "partiallypaid" || x === "partially-paid") return "partiallypaid";
  return x;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export default function AdminInvoices() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [data, setData] = useState({
    items: [],
    page: 1,
    pageSize: 20,
    totalCount: 0,
  });

  // Filters (kept same semantics)
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all"); // ✅ chips like AdminUsers
  const [customer, setCustomer] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [page, setPage] = useState(1);
  const pageSize = data.pageSize || 20;

  const pageCount = useMemo(() => {
    const total = num(data?.totalCount);
    return Math.max(1, Math.ceil(total / num(pageSize)));
  }, [data?.totalCount, pageSize]);

  const pageLabel = useMemo(() => {
    const p = clamp(page, 1, pageCount);
    const total = num(data?.totalCount);
    const size = num(pageSize);
    const start = total === 0 ? 0 : (p - 1) * size + 1;
    const end = Math.min(p * size, total);
    return `Showing ${start}-${end} of ${total}`;
  }, [page, pageCount, data?.totalCount, pageSize]);

  // ✅ Build params (stable)
  const params = useMemo(() => {
    const out = { page, pageSize };

    const qq = q.trim();
    if (qq) out.q = qq;

    if (status && status !== "all") out.status = status;

    const cc = customer.trim();
    if (cc) out.customer = cc;

    if (from) out.from = new Date(from).toISOString();
    if (to) out.to = new Date(to).toISOString();

    return out;
  }, [page, pageSize, q, status, customer, from, to]);

  // ✅ Prevent storms: debounce + cancel + dedupe (same as AdminUsers)
  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const lastKeyRef = useRef("");
  const lastStartedAtRef = useRef(0);

  async function loadInvoices(force = false) {
    const key = JSON.stringify(params);
    const now = Date.now();
    if (!force && key === lastKeyRef.current && now - lastStartedAtRef.current < 400) return;

    lastKeyRef.current = key;
    lastStartedAtRef.current = now;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setErr("");
    setLoading(true);

    try {
      const res = await api.get("/admin/invoices", { params, signal: controller.signal });
      setData(res.data);
    } catch (e) {
      const msg = friendlyApiError(e);
      if (msg) setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  const paramsKey = useMemo(() => JSON.stringify(params), [params]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(() => {
      loadInvoices(false);
    }, 260);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  // Reset page when filters change (like AdminUsers)
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, customer, from, to]);

  function onClear() {
    setQ("");
    setStatus("all");
    setCustomer("");
    setFrom("");
    setTo("");
    setTimeout(() => setPage(1), 0);
  }

  const items = useMemo(() => (Array.isArray(data?.items) ? data.items : []), [data?.items]);

  // KPI summary from current page
  const pageSummary = useMemo(() => {
    const out = { total: items.length, paid: 0, issued: 0, partiallypaid: 0, draft: 0, void: 0 };
    for (const it of items) {
      const k = normStatusKey(it.status);
      if (k in out) out[k] += 1;
    }
    return out;
  }, [items]);

  return (
    <div className="au-wrap">
      {/* ===== HERO (same as AdminUsers) ===== */}
      <header className="au-hero">
        <div className="au-heroLeft">
          <div className="au-titleRow">
            <div className="au-titleStack">
              <div className="au-kicker">LawAfrica • Admin</div>
              <h1 className="au-title">Invoices</h1>
              <div className="au-subtitle">
                Search, filter and open invoices — then print/download from the invoice view.
              </div>
            </div>

            <div className="au-heroRight">
              <Link
                className="au-refresh"
                to="/dashboard/admin/finance/invoice-settings"
                title="Invoice Settings"
                aria-label="Invoice Settings"
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Icon name="gear" />
                  Settings
                </span>
              </Link>

              <button
                className="au-refresh"
                type="button"
                onClick={() => loadInvoices(true)}
                disabled={loading}
                title="Refresh"
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {loading ? <Icon name="spinner" /> : <Icon name="refresh" />}
                  Refresh
                </span>
              </button>
            </div>
          </div>

          {err ? <div className="au-error">{err}</div> : null}

          {/* ===== Search row (same as AdminUsers) ===== */}
          <div className="au-topbar">
            <div className="au-search">
              <span className="au-searchIcon" aria-hidden="true">
                <Icon name="search" />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Invoice number, external ref, purpose…"
                aria-label="Search invoices"
              />
              {q ? (
                <button className="au-clear" type="button" onClick={() => setQ("")} aria-label="Clear search">
                  ✕
                </button>
              ) : null}
            </div>

            <div className="au-topbarRight">
              <button className="au-refresh" type="button" onClick={onClear} disabled={loading} title="Clear filters">
                Clear
              </button>
            </div>
          </div>

          {/* ===== KPIs ===== */}
          <div className="au-kpis">
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Shown</div>
              <div className="au-kpiValue">{pageSummary.total}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Paid</div>
              <div className="au-kpiValue">{pageSummary.paid}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Issued</div>
              <div className="au-kpiValue">{pageSummary.issued}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Partially Paid</div>
              <div className="au-kpiValue">{pageSummary.partiallypaid}</div>
            </div>
          </div>

          {/* ===== Filters ===== */}
          <div className="au-filters">
            <div className="au-filterGroup">
              <div className="au-filterLabel">Status</div>
              <div className="au-chips">
                <Chip active={status === "all"} onClick={() => setStatus("all")}>
                  All
                </Chip>
                <Chip active={status === "Draft"} onClick={() => setStatus("Draft")}>
                  Draft
                </Chip>
                <Chip active={status === "Issued"} onClick={() => setStatus("Issued")}>
                  Issued
                </Chip>
                <Chip active={status === "PartiallyPaid"} onClick={() => setStatus("PartiallyPaid")}>
                  PartiallyPaid
                </Chip>
                <Chip active={status === "Paid"} onClick={() => setStatus("Paid")}>
                  Paid
                </Chip>
                <Chip active={status === "Void"} onClick={() => setStatus("Void")}>
                  Void
                </Chip>
              </div>
            </div>

            <div className="au-filterGroup">
              <div className="au-filterLabel">Customer</div>
              <div className="au-chips" style={{ gap: 10, flexWrap: "wrap" }}>
                <input
                  className="au-inlineInput"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Name / email fragment…"
                  aria-label="Customer filter"
                  style={{
                    width: 320,
                    maxWidth: "100%",
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,.35)",
                    background: "rgba(2,6,23,.25)",
                    color: "inherit",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <div className="au-filterGroup">
              <div className="au-filterLabel">Dates</div>
              <div className="au-chips" style={{ gap: 10, flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="From date"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,.35)",
                    background: "rgba(2,6,23,.25)",
                    color: "inherit",
                    outline: "none",
                  }}
                />
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="To date"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,.35)",
                    background: "rgba(2,6,23,.25)",
                    color: "inherit",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ===== PANEL ===== */}
      <section className="au-panel">
        <div className="au-panelTop">
          <div className="au-panelTitle">{loading ? "Loading…" : "Invoice directory"}</div>

          <div className="au-pager">
            <button
              type="button"
              className="au-pageBtn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || page <= 1}
              title="Previous page"
            >
              ←
            </button>

            <div className="au-pageMeta">
              Page <strong>{clamp(page, 1, pageCount)}</strong> / <strong>{pageCount}</strong>
            </div>

            <button
              type="button"
              className="au-pageBtn"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={loading || page >= pageCount}
              title="Next page"
            >
              →
            </button>
          </div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table au-tableModern">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Purpose</th>
                <th className="au-thRight">Currency</th>
                <th className="au-thRight">Amount</th>
                <th className="au-thRight">Paid</th>
                <th className="au-thRight">Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="au-empty">
                    No invoices found for the current filters.
                  </td>
                </tr>
              ) : null}

              {items.map((x) => {
                const tone = statusTone(x.status);
                const ccy = x.currency || "KES";

                return (
                  <tr key={x.id}>
                    {/* Invoice: remove Invoice ID */}
                    <td>
                      <div className="au-userMeta">
                        <div className="au-userName">
                          <span className="au-mono">{x.invoiceNumber || "—"}</span>
                        </div>
                        {x.externalInvoiceNumber ? (
                          <div className="au-userSub">
                            <span className="au-muted">External Ref:</span>{" "}
                            <span className="au-mono">{x.externalInvoiceNumber}</span>
                          </div>
                        ) : null}
                      </div>
                    </td>

                    <td>{fmtDate(x.issuedAt)}</td>

                    {/* Customer: do not show customerType */}
                    <td>
                      <div className="au-userMeta">
                        <div className="au-userName">{x.customerName || "—"}</div>
                        {x.customerEmail ? <div className="au-userSub au-mono">{x.customerEmail}</div> : null}
                      </div>
                    </td>

                    <td>
                      <Badge tone={tone}>{String(x.status || "Draft")}</Badge>
                    </td>

                    <td title={x.purpose || ""} style={{ maxWidth: 360 }}>
                      <div
                        className="au-muted"
                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {x.purpose || "—"}
                      </div>
                    </td>

                    {/* Currency column (own column before amount) */}
                    <td className="au-tdRight">
                      <span className="au-mono">{ccy}</span>
                    </td>

                    {/* Amount column */}
                    <td className="au-tdRight">
                      <span className="au-mono">{fmtMoney(x.total, ccy)}</span>
                    </td>

                    {/* Paid column */}
                    <td className="au-tdRight">
                      <span className="au-mono">{fmtMoney(x.amountPaid, ccy)}</span>
                    </td>

                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        <Link
                          className="au-iconBtn au-iconBtn-neutral"
                          to={`/dashboard/admin/finance/invoices/${x.id}`}
                          title="Open invoice"
                          aria-label="Open invoice"
                        >
                          <Icon name="eye" />
                        </Link>

                        <Link
                          className="au-iconBtn au-iconBtn-neutral"
                          to={`/dashboard/admin/finance/invoices/${x.id}?print=1`}
                          title="Open & print"
                          aria-label="Open & print"
                        >
                          <Icon name="print" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="au-panelBottom">
          <div className="au-muted">{pageLabel}</div>
          <div className="au-muted">Tip: Use search + status chips for quickest filtering.</div>
        </div>
      </section>
    </div>
  );
}
