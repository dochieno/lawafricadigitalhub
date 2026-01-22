// src/pages/dashboard/admin/AdminPayments.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminUsers.css"; // ✅ same look as invoices
import "../../../styles/invoice.css"; // (kept) existing pills/buttons/etc may still be used
import AdminPageFooter from "../../../components/AdminPageFooter";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function fmtMoney(amount, currency = "KES") {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function statusTone(v) {
  const s = String(v || "").toLowerCase();
  if (!s) return "unknown";

  if (s.includes("success") || s === "paid" || s.includes("processed")) return "success";
  if (s.includes("fail") || s.includes("error")) return "failed";
  if (s.includes("pending") || s.includes("unprocessed")) return "pending";

  return "unknown";
}

function badgeToneFromStatus(v) {
  const t = statusTone(v);
  if (t === "success") return "success";
  if (t === "failed") return "danger";
  if (t === "pending") return "warn";
  return "neutral";
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
    default:
      return null;
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function Pager({ page, pageSize, totalCount, loading, onPage }) {
  const pageCount = Math.max(1, Math.ceil((totalCount || 0) / (pageSize || 25)));
  const canPrev = !loading && page > 1;
  const canNext = !loading && page < pageCount;

  return (
    <div className="au-panelBottom" style={{ justifyContent: "space-between" }}>
      <div className="au-muted">
        Page <strong>{page}</strong> / <strong>{pageCount}</strong> • Total{" "}
        <strong>{totalCount || 0}</strong>
      </div>

      <div className="au-pager">
        <button
          type="button"
          className="au-pageBtn"
          onClick={() => onPage(page - 1)}
          disabled={!canPrev}
          title="Previous page"
        >
          ←
        </button>

        <div className="au-pageMeta">
          Page <strong>{page}</strong>
        </div>

        <button
          type="button"
          className="au-pageBtn"
          onClick={() => onPage(page + 1)}
          disabled={!canNext}
          title="Next page"
        >
          →
        </button>
      </div>
    </div>
  );
}

export default function AdminPayments() {
  const [tab, setTab] = useState("intents"); // intents | transactions | webhooks

  // Search is debounced: qUi updates immediately, q is committed after delay
  const [qUi, setQUi] = useState("");
  const [q, setQ] = useState("");

  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  const [data, setData] = useState({ items: [], page: 1, pageSize: 25, totalCount: 0 });

  const endpoint = useMemo(() => {
    if (tab === "transactions") return "/admin/payments/transactions";
    if (tab === "webhooks") return "/admin/payments/webhooks";
    return "/admin/payments/intents";
  }, [tab]);

  const statusOptions = useMemo(() => {
    if (tab === "transactions") {
      return [
        { value: "", label: "All" },
        { value: "Paid", label: "Paid" },
        { value: "Pending", label: "Pending" },
        { value: "Failed", label: "Failed" },
      ];
    }
    if (tab === "webhooks") {
      return [
        { value: "", label: "All" },
        { value: "Processed", label: "Processed" },
        { value: "Unprocessed", label: "Unprocessed" },
        { value: "Error", label: "Error" },
      ];
    }
    return [
      { value: "", label: "All" },
      { value: "Pending", label: "Pending" },
      { value: "Success", label: "Success" },
      { value: "Failed", label: "Failed" },
    ];
  }, [tab]);

  const pageCounts = useMemo(() => {
    const items = data.items || [];
    let ok = 0,
      bad = 0,
      pend = 0;
    for (const x of items) {
      const t = statusTone(tab === "webhooks" ? (x.processed ? "Processed" : "Unprocessed") : x.status);
      if (t === "success") ok++;
      else if (t === "failed") bad++;
      else if (t === "pending") pend++;
    }
    return { ok, bad, pend, total: items.length };
  }, [data.items, tab]);

  async function load(p = 1) {
    setLoading(true);
    setErr("");
    try {
      const params = { page: p, pageSize };

      if (q.trim()) params.q = q.trim();
      if (provider) params.provider = provider;

      // Safe: backend can ignore if unsupported
      if (status) params.status = status;

      if (from) params.from = new Date(from).toISOString();
      if (to) params.to = new Date(to).toISOString();

      const res = await api.get(endpoint, { params });
      setData(res.data);
      setPage(res.data.page || p);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.response?.data || e?.message || "Failed to load payments.");
    } finally {
      setLoading(false);
    }
  }

  // Reset + load on tab change (existing behavior)
  useEffect(() => {
    setPage(1);
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* =========================
     Debounced search
     - User types into qUi
     - After delay, commit q and trigger load(1)
  ========================= */
  const debounceRef = useRef(null);
  const lastCommittedRef = useRef("");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const next = qUi;
      if (next !== lastCommittedRef.current) {
        lastCommittedRef.current = next;
        setQ(next);
        load(1);
      }
    }, 450);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qUi]);

  function apply() {
    // Flush pending debounce immediately before applying
    if (debounceRef.current) clearTimeout(debounceRef.current);
    lastCommittedRef.current = qUi;
    setQ(qUi);
    load(1);
  }

  function clear() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    lastCommittedRef.current = "";
    setQUi("");
    setQ("");
    setProvider("");
    setStatus("");
    setFrom("");
    setTo("");
    setTimeout(() => load(1), 0);
  }

  // Enter key handler for search/date inputs
  function onEnterApply(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
    }
  }

  const tableTitle = useMemo(() => {
    if (tab === "transactions") return "Transactions";
    if (tab === "webhooks") return "Webhooks";
    return "Payment intents";
  }, [tab]);

  const safePage = clamp(data.page || page, 1, Math.max(1, Math.ceil((data.totalCount || 0) / (data.pageSize || pageSize))));

  return (
    <div className="au-wrap">
      {/* ===== HERO (same style as invoices) ===== */}
      <header className="au-hero">
        <div className="au-heroLeft">
          <div className="au-titleRow">
            <div className="au-titleStack">
              <div className="au-kicker">LawAfrica • Admin</div>
              <h1 className="au-title">Payments</h1>
              <div className="au-subtitle">View payment intents, provider transactions and webhook events.</div>
            </div>

            <div className="au-heroRight">
              <button
                className="au-refresh"
                type="button"
                onClick={() => load(safePage)}
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

          {err ? <div className="au-error">{String(err)}</div> : null}

          {/* ===== Search row ===== */}
          <div className="au-topbar">
            <div className="au-search">
              <span className="au-searchIcon" aria-hidden="true">
                <Icon name="search" />
              </span>
              <input
                value={qUi}
                onChange={(e) => setQUi(e.target.value)}
                onKeyDown={onEnterApply}
                placeholder="Reference, txn id, invoice id…"
                aria-label="Search payments"
              />
              {qUi ? (
                <button className="au-clear" type="button" onClick={() => setQUi("")} aria-label="Clear search">
                  ✕
                </button>
              ) : null}
            </div>

            <div className="au-topbarRight">
              <button className="au-refresh" type="button" onClick={apply} disabled={loading} title="Apply filters">
                Apply
              </button>
              <button className="au-refresh" type="button" onClick={clear} disabled={loading} title="Clear filters">
                Clear
              </button>
            </div>
          </div>

          {/* ===== KPIs ===== */}
          <div className="au-kpis">
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Total</div>
              <div className="au-kpiValue">{data.totalCount || 0}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Success</div>
              <div className="au-kpiValue">{pageCounts.ok}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Pending</div>
              <div className="au-kpiValue">{pageCounts.pend}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Failed</div>
              <div className="au-kpiValue">{pageCounts.bad}</div>
            </div>
          </div>

          {/* ===== Tabs + Filters ===== */}
          <div className="au-filters">
            <div className="au-filterGroup">
              <div className="au-filterLabel">View</div>
              <div className="au-chips">
                <Chip active={tab === "intents"} onClick={() => setTab("intents")}>
                  Payment intents
                </Chip>
                <Chip active={tab === "transactions"} onClick={() => setTab("transactions")}>
                  Transactions
                </Chip>
                <Chip active={tab === "webhooks"} onClick={() => setTab("webhooks")}>
                  Webhooks
                </Chip>
              </div>
            </div>

            <div className="au-filterGroup">
              <div className="au-filterLabel">Provider</div>
              <div className="au-chips" style={{ gap: 10, flexWrap: "wrap" }}>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  aria-label="Provider"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,.35)",
                    background: "rgba(2,6,23,.25)",
                    color: "inherit",
                    outline: "none",
                    minWidth: 180,
                  }}
                >
                  <option value="">All</option>
                  <option value="Mpesa">Mpesa</option>
                  <option value="Paystack">Paystack</option>
                </select>
              </div>
            </div>

            <div className="au-filterGroup">
              <div className="au-filterLabel">Status</div>
              <div className="au-chips" style={{ gap: 10, flexWrap: "wrap" }}>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  aria-label="Status"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,.35)",
                    background: "rgba(2,6,23,.25)",
                    color: "inherit",
                    outline: "none",
                    minWidth: 180,
                  }}
                >
                  {statusOptions.map((o) => (
                    <option key={o.value || "all"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="au-filterGroup">
              <div className="au-filterLabel">Dates</div>
              <div className="au-chips" style={{ gap: 10, flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  onKeyDown={onEnterApply}
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
                  onKeyDown={onEnterApply}
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
          <div className="au-panelTitle">{loading ? "Loading…" : tableTitle}</div>
        </div>

        <div className="au-tableWrap">
          {/* Intents */}
          {tab === "intents" ? (
            <table className="au-table au-tableModern">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Provider</th>
                  <th>Purpose</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th className="au-thRight">Amount</th>
                  <th className="au-thRight">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((x) => {
                  const tone = badgeToneFromStatus(x.status);
                  return (
                    <tr key={x.id}>
                      <td className="au-mono">{x.id}</td>
                      <td>{x.provider}</td>
                      <td title={x.purpose || ""} style={{ maxWidth: 340 }}>
                        <div className="au-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {x.purpose || "—"}
                        </div>
                      </td>
                      <td className="au-mono" title={x.providerReference || x.providerTransactionId || ""}>
                        {x.providerReference || x.providerTransactionId || "—"}
                      </td>
                      <td>
                        <Badge tone={tone}>{String(x.status || "Unknown")}</Badge>
                      </td>
                      <td>{fmtDate(x.createdAt)}</td>
                      <td className="au-tdRight au-mono">{fmtMoney(x.amount, x.currency)}</td>
                      <td className="au-tdRight au-mono">{x.invoiceId ?? "—"}</td>
                    </tr>
                  );
                })}

                {!loading && (data.items || []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="au-empty">
                      No records.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}

          {/* Transactions */}
          {tab === "transactions" ? (
            <table className="au-table au-tableModern">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Provider</th>
                  <th>Txn ID</th>
                  <th>Reference</th>
                  <th>Paid</th>
                  <th className="au-thRight">Amount</th>
                  <th>Channel</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((x) => {
                  const tone = badgeToneFromStatus(x.status);
                  return (
                    <tr key={x.id}>
                      <td className="au-mono">{x.id}</td>
                      <td>{x.provider}</td>
                      <td className="au-mono" title={x.providerTransactionId || ""}>
                        {x.providerTransactionId || "—"}
                      </td>
                      <td className="au-mono" title={x.reference || ""}>
                        {x.reference || "—"}
                      </td>
                      <td>{x.paidAt ? fmtDate(x.paidAt) : "—"}</td>
                      <td className="au-tdRight au-mono">{fmtMoney(x.amount, x.currency)}</td>
                      <td>{x.channel || "—"}</td>
                      <td>{fmtDate(x.createdAt)}</td>
                    </tr>
                  );
                })}

                {!loading && (data.items || []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="au-empty">
                      No records.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}

          {/* Webhooks */}
          {tab === "webhooks" ? (
            <table className="au-table au-tableModern">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Provider</th>
                  <th>Type</th>
                  <th>Ref</th>
                  <th>Received</th>
                  <th>Processed</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((x) => {
                  const statusText = x.processed ? "Processed" : "Unprocessed";
                  const tone = badgeToneFromStatus(statusText);
                  return (
                    <tr key={x.id}>
                      <td className="au-mono">{x.id}</td>
                      <td>{x.provider}</td>
                      <td title={x.eventType || ""} style={{ maxWidth: 320 }}>
                        <div className="au-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {x.eventType || "—"}
                        </div>
                      </td>
                      <td className="au-mono" title={x.reference || ""}>
                        {x.reference || "—"}
                      </td>
                      <td>{fmtDate(x.receivedAt)}</td>
                      <td>
                        <Badge tone={tone}>{statusText}</Badge>
                      </td>
                      <td title={x.processingError || ""} style={{ maxWidth: 360 }}>
                        <div className="au-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {x.processingError || "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!loading && (data.items || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="au-empty">
                      No records.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}
        </div>

        <Pager
          page={data.page || page}
          pageSize={data.pageSize || pageSize}
          totalCount={data.totalCount || 0}
          loading={loading}
          onPage={(p) => load(p)}
        />
      </section>

      <AdminPageFooter />
    </div>
  );
}
