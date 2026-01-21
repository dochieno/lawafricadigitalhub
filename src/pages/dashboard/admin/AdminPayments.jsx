import { useEffect, useMemo, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/invoice.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
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

function StatusPill({ value }) {
  const tone = statusTone(value);
  const cls =
    tone === "success"
      ? "statusPill statusPill--success"
      : tone === "failed"
      ? "statusPill statusPill--failed"
      : tone === "pending"
      ? "statusPill statusPill--pending"
      : "statusPill statusPill--unknown";

  return <span className={cls}>{String(value || "Unknown")}</span>;
}

function Pager({ page, pageSize, totalCount, loading, onPage }) {
  const pageCount = Math.max(1, Math.ceil((totalCount || 0) / (pageSize || 25)));
  return (
    <div className="pager">
      <div className="muted">
        Page <b>{page}</b> of <b>{pageCount}</b> — total <b>{totalCount}</b>
      </div>
      <div className="pagerBtns">
        <button className="btnGhost" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </button>
        <button className="btnGhost" disabled={loading || page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export default function AdminPayments() {
  const [tab, setTab] = useState("intents"); // intents | transactions | webhooks

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
    // intents
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

  useEffect(() => {
    setPage(1);
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function apply() {
    load(1);
  }

  function clear() {
    setQ("");
    setProvider("");
    setStatus("");
    setFrom("");
    setTo("");
    setTimeout(() => load(1), 0);
  }

  return (
    <div className="adminCrud paymentsPage">
      <div className="adminCrud__header">
        <div>
          <h1 className="adminCrud__title">Payments</h1>
          <p className="adminCrud__sub">View payment intents, provider transactions and webhook events.</p>
        </div>

        <div className="adminCrud__actionsRow">
          <button className="iconBtn" title="Refresh" aria-label="Refresh" onClick={() => load(page)} disabled={loading}>
            🔄
          </button>
        </div>
      </div>

      <div className="card">
        {/* Tabs */}
        <div className="tabsRow">
          <button className={cn("tabBtn", tab === "intents" && "active")} onClick={() => setTab("intents")}>
            Payment Intents
          </button>
          <button className={cn("tabBtn", tab === "transactions" && "active")} onClick={() => setTab("transactions")}>
            Transactions
          </button>
          <button className={cn("tabBtn", tab === "webhooks" && "active")} onClick={() => setTab("webhooks")}>
            Webhooks
          </button>
        </div>

        {/* Toolbar (subscriptions-like layout) */}
        <div className="paymentsToolbar">
          {/* Row 1: Search left, pills + filters right */}
          <div className="paymentsToolbarRow">
            <div className="paymentsToolbarLeft">
              <div className="toolbarField toolbarField--search">
                <label>Search</label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Reference, txn id, invoice id…"
                />
              </div>
            </div>

            <div className="paymentsToolbarRight">
              <div className="pillsRow" aria-label="Summary">
                <span className="pill">
                  Total <b>{data.totalCount || 0}</b>
                </span>
                <span className={cn("pill", pageCounts.ok ? "pill--ok" : "")}>
                  Success <b>{pageCounts.ok}</b>
                </span>
                <span className={cn("pill", pageCounts.pend ? "pill--warn" : "")}>
                  Pending <b>{pageCounts.pend}</b>
                </span>
                <span className={cn("pill", pageCounts.bad ? "pill--bad" : "")}>
                  Failed <b>{pageCounts.bad}</b>
                </span>
              </div>

              <div className="toolbarField toolbarField--compact">
                <label>Provider</label>
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="">All</option>
                  <option value="Mpesa">Mpesa</option>
                  <option value="Paystack">Paystack</option>
                </select>
              </div>

              <div className="toolbarField toolbarField--compact">
                <label>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {statusOptions.map((o) => (
                    <option key={o.value || "all"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Row 2: Dates + actions right */}
          <div className="paymentsToolbarRow">
            <div className="paymentsToolbarLeft">
              <div className="toolbarField toolbarField--compact">
                <label>From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="toolbarField toolbarField--compact">
                <label>To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>

            <div className="paymentsToolbarRight">
              <div className="toolbarActions">
                <button className="btnPrimary" onClick={apply} disabled={loading}>
                  Apply
                </button>
                <button className="btnGhost" onClick={clear} disabled={loading}>
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>

        {err ? <div className="alert alert--danger">{String(err)}</div> : null}
        {loading ? <div className="alert alert--info">Loading…</div> : null}

        {/* Tables */}
        <div className="tableWrap">
          {tab === "intents" ? (
            <table className="adminTable">
              <thead>
                <tr>
                  <th className="col-id">ID</th>
                  <th className="col-provider">Provider</th>
                  <th className="col-purpose">Purpose</th>
                  <th className="col-ref">Reference</th>
                  <th className="col-status">Status</th>
                  <th className="col-date">Issued</th>
                  <th className="col-amount num">Amount</th>
                  <th className="col-invoice num">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((x) => (
                  <tr key={x.id}>
                    <td>{x.id}</td>
                    <td>{x.provider}</td>
                    <td className="purposeCell" title={x.purpose || ""}>
                      {x.purpose}
                    </td>
                    <td className="mutedSmall refCell" title={x.providerReference || x.providerTransactionId || ""}>
                      {x.providerReference || x.providerTransactionId || "-"}
                    </td>
                    <td>
                      <StatusPill value={x.status} />
                    </td>
                    <td>{fmtDate(x.createdAt)}</td>
                    <td className="num">{fmtMoney(x.amount, x.currency)}</td>
                    <td className="num">{x.invoiceId ?? "-"}</td>
                  </tr>
                ))}
                {!loading && (data.items || []).length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="emptyState">No records.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}

          {tab === "transactions" ? (
            <table className="adminTable">
              <thead>
                <tr>
                  <th className="col-id">ID</th>
                  <th className="col-provider">Provider</th>
                  <th className="col-ref">Txn ID</th>
                  <th className="col-ref">Reference</th>
                  <th className="col-date">Paid</th>
                  <th className="col-amount num">Amount</th>
                  <th className="col-provider">Channel</th>
                  <th className="col-date">Created</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((x) => (
                  <tr key={x.id}>
                    <td>{x.id}</td>
                    <td>{x.provider}</td>
                    <td className="mutedSmall refCell" title={x.providerTransactionId || ""}>
                      {x.providerTransactionId}
                    </td>
                    <td className="mutedSmall refCell" title={x.reference || ""}>
                      {x.reference || "-"}
                    </td>
                    <td>{x.paidAt ? fmtDate(x.paidAt) : "-"}</td>
                    <td className="num">{fmtMoney(x.amount, x.currency)}</td>
                    <td>{x.channel || "-"}</td>
                    <td>{fmtDate(x.createdAt)}</td>
                  </tr>
                ))}
                {!loading && (data.items || []).length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="emptyState">No records.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}

          {tab === "webhooks" ? (
            <table className="adminTable">
              <thead>
                <tr>
                  <th className="col-id">ID</th>
                  <th className="col-provider">Provider</th>
                  <th className="col-purpose">Type</th>
                  <th className="col-ref">Ref</th>
                  <th className="col-date">Received</th>
                  <th className="col-status">Processed</th>
                  <th className="col-purpose">Error</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((x) => (
                  <tr key={x.id}>
                    <td>{x.id}</td>
                    <td>{x.provider}</td>
                    <td className="mutedSmall purposeCell" title={x.eventType || ""}>
                      {x.eventType}
                    </td>
                    <td className="mutedSmall refCell" title={x.reference || ""}>
                      {x.reference || "-"}
                    </td>
                    <td>{fmtDate(x.receivedAt)}</td>
                    <td>
                      <StatusPill value={x.processed ? "Processed" : "Unprocessed"} />
                    </td>
                    <td className="mutedSmall purposeCell" title={x.processingError || ""}>
                      {x.processingError || "-"}
                    </td>
                  </tr>
                ))}
                {!loading && (data.items || []).length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="emptyState">No records.</div>
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
      </div>

      <AdminPageFooter />
    </div>
  );
}
