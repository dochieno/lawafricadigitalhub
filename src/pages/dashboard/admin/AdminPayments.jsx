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

  async function load(p = 1) {
    setLoading(true);
    setErr("");
    try {
      const params = { page: p, pageSize };

      if (q.trim()) params.q = q.trim();
      if (provider) params.provider = provider;

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
    setFrom("");
    setTo("");
    setTimeout(() => load(1), 0);
  }

  return (
    <div className="adminCrud">
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
          <button
            className={cn("tabBtn", tab === "intents" && "active")}
            onClick={() => setTab("intents")}
          >
            Payment Intents
          </button>
          <button
            className={cn("tabBtn", tab === "transactions" && "active")}
            onClick={() => setTab("transactions")}
          >
            Transactions
          </button>
          <button
            className={cn("tabBtn", tab === "webhooks" && "active")}
            onClick={() => setTab("webhooks")}
          >
            Webhooks
          </button>
        </div>

        {/* Filters */}
        <div className="filtersGrid" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}>
          <div className="field">
            <label>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, txn id, invoice id..." />
          </div>

          <div className="field">
            <label>Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">All</option>
              <option value="Mpesa">Mpesa</option>
              <option value="Paystack">Paystack</option>
            </select>
          </div>

          <div className="field">
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>

          <div className="field">
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div className="field field--actions">
            <label>&nbsp;</label>
            <div className="rowActions">
              <button className="btnPrimary" onClick={apply} disabled={loading}>
                Apply
              </button>
              <button className="btnGhost" onClick={clear} disabled={loading}>
                Clear
              </button>
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
                  <th>ID</th>
                  <th>Provider</th>
                  <th>Purpose</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th className="num">Amount</th>
                  <th className="num">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((x) => (
                  <tr key={x.id}>
                    <td>{x.id}</td>
                    <td>{x.provider}</td>
                    <td>{x.purpose}</td>
                    <td className="mutedSmall">{x.providerReference || x.providerTransactionId || "-"}</td>
                    <td>{x.status}</td>
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
                  <th>ID</th>
                  <th>Provider</th>
                  <th>Txn ID</th>
                  <th>Reference</th>
                  <th>Paid</th>
                  <th className="num">Amount</th>
                  <th>Channel</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((x) => (
                  <tr key={x.id}>
                    <td>{x.id}</td>
                    <td>{x.provider}</td>
                    <td className="mutedSmall">{x.providerTransactionId}</td>
                    <td className="mutedSmall">{x.reference || "-"}</td>
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
                {(data.items || []).map((x) => (
                  <tr key={x.id}>
                    <td>{x.id}</td>
                    <td>{x.provider}</td>
                    <td className="mutedSmall">{x.eventType}</td>
                    <td className="mutedSmall">{x.reference || "-"}</td>
                    <td>{fmtDate(x.receivedAt)}</td>
                    <td>{x.processed ? "Yes" : "No"}</td>
                    <td className="mutedSmall">{x.processingError || "-"}</td>
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
