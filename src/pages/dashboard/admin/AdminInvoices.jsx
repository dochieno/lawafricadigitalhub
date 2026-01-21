// src/pages/dashboard/admin/AdminInvoices.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/invoice.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

function fmtMoney(amount, currency = "KES") {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
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

function statusPill(status) {
  const s = String(status || "").toLowerCase();
  const map = {
    draft: "pill pill--muted",
    issued: "pill pill--info",
    partiallypaid: "pill pill--warn",
    paid: "pill pill--ok",
    void: "pill pill--danger",
  };
  return map[s] || "pill pill--muted";
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export default function AdminInvoices() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState({ items: [], page: 1, pageSize: 20, totalCount: 0 });

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [customer, setCustomer] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const pageCount = useMemo(() => {
    const total = data?.totalCount || 0;
    const size = data?.pageSize || 20;
    return Math.max(1, Math.ceil(total / size));
  }, [data]);

  async function load(page = 1) {
    setLoading(true);
    setErr("");
    try {
      const params = { page, pageSize: data.pageSize };

      if (q.trim()) params.q = q.trim();
      if (status) params.status = status;
      if (customer.trim()) params.customer = customer.trim();
      if (from) params.from = new Date(from).toISOString();
      if (to) params.to = new Date(to).toISOString();

      const res = await api.get("/admin/invoices", { params });
      setData(res.data);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.response?.data || e?.message || "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onApplyFilters() {
    load(1);
  }

  function onClear() {
    setQ("");
    setStatus("");
    setCustomer("");
    setFrom("");
    setTo("");
    setTimeout(() => load(1), 0);
  }

  const canPrev = !loading && (data.page || 1) > 1;
  const canNext = !loading && (data.page || 1) < pageCount;

  const pageLabel = useMemo(() => {
    const p = data?.page || 1;
    const total = data?.totalCount || 0;
    const size = data?.pageSize || 20;
    const start = total === 0 ? 0 : (p - 1) * size + 1;
    const end = Math.min(p * size, total);
    return `Showing ${start}-${end} of ${total}`;
  }, [data]);

  function onKeyDownApply(e) {
    if (e.key === "Enter") onApplyFilters();
  }

  return (
    <div className="adminCrud">
      <div className="adminCrud__header">
        <div>
          <h1 className="adminCrud__title">Invoices</h1>
          <p className="adminCrud__sub">Search and filter invoices, then open to print/download.</p>
        </div>

        <div className="adminCrud__actionsRow">
          <Link
            className="iconBtn iconBtn--sm iconBtn--neutral"
            to="/dashboard/admin/finance/invoice-settings"
            title="Invoice Settings"
            aria-label="Invoice Settings"
          >
            ⚙️
          </Link>

          <button
            type="button"
            className="iconBtn iconBtn--sm iconBtn--neutral"
            onClick={() => load(data.page || 1)}
            title="Refresh"
            aria-label="Refresh"
            disabled={loading}
          >
            🔄
          </button>
        </div>
      </div>

      <div className="card invoiceCard">
        {/* ===== Filters (aligned) ===== */}
        <div className="invoiceFilters invoiceFilters--aligned">
          <div className="field">
            <label>Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDownApply}
              placeholder="Invoice number, external ref, purpose..."
            />
          </div>

          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="Draft">Draft</option>
              <option value="Issued">Issued</option>
              <option value="PartiallyPaid">PartiallyPaid</option>
              <option value="Paid">Paid</option>
              <option value="Void">Void</option>
            </select>
          </div>

          <div className="field">
            <label>Customer</label>
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              onKeyDown={onKeyDownApply}
              placeholder="Name/email fragment..."
            />
          </div>

          <div className="field">
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>

          <div className="field">
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div className="invoiceFilters__actions invoiceFilters__actions--flush">
            <button
              type="button"
              className="btnSm btnSm--primary"
              onClick={onApplyFilters}
              disabled={loading}
              title="Apply filters"
              aria-label="Apply filters"
            >
              ✅ Apply
            </button>

            <button
              type="button"
              className="btnSm"
              onClick={onClear}
              disabled={loading}
              title="Clear filters"
              aria-label="Clear filters"
            >
              🧹 Clear
            </button>
          </div>
        </div>

        {err ? <div className="alert alert--danger">{err}</div> : null}
        {loading ? <div className="alert alert--info">Loading invoices…</div> : null}

        {/* ===== Table ===== */}
        <div className="tableWrap tableWrap--full">
          <table className="adminTable adminTable--stickyHead">
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Document Date</th>
                <th>Customer Name</th>
                <th>Status</th>
                <th>Purpose</th>
                <th className="num">Currency</th>
                <th className="num">Invoice Amount</th>
                <th className="num">Paid Amount</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>

            <tbody>
              {(data?.items || []).map((x) => (
                <tr key={x.id}>
                  <td>
                    <div className="stack">
                      <div className="strong">{x.invoiceNumber}</div>
                    </div>
                  </td>

                  <td>{fmtDate(x.issuedAt)}</td>

                  <td>
                    <div className="stack">
                      <div className="strong">{x.customerName || "-"}</div>
                      <div className="muted">{x.customerType || "-"}</div>
                    </div>
                  </td>

                  <td>
                    <span className={statusPill(x.status)}>{x.status}</span>
                  </td>

                  <td className="cellClamp" title={x.purpose || ""}>
                    {x.purpose || "-"}
                  </td>

                  <td className="num">{x.currency || "KES"}</td>

                  <td className="num">{fmtMoney(x.total, x.currency)}</td>

                  <td className="num">{fmtMoney(x.amountPaid, x.currency)}</td>

                  <td className="actions">
                    <div className="iconRow">
                      <Link
                        className="iconBtn iconBtn--sm iconBtn--neutral"
                        to={`/dashboard/admin/finance/invoices/${x.id}`}
                        title="Open invoice"
                        aria-label="Open invoice"
                      >
                        👁️
                      </Link>

                      <Link
                        className="iconBtn iconBtn--sm iconBtn--neutral"
                        to={`/dashboard/admin/finance/invoices/${x.id}?print=1`}
                        title="Open & print"
                        aria-label="Open & print"
                      >
                        🖨️
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && (data?.items || []).length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="emptyState">No invoices found.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* ===== Pager ===== */}
        <div className="pager pager--compact">
          <div className="muted">{pageLabel}</div>

          <div className="pagerBtns pagerBtns--compact" role="navigation" aria-label="Invoices pagination">
            <button
              type="button"
              className="btnSm"
              disabled={!canPrev}
              onClick={() => load(1)}
              title="First page"
              aria-label="First page"
            >
              ⏮
            </button>

            <button
              type="button"
              className="btnSm"
              disabled={!canPrev}
              onClick={() => load((data.page || 1) - 1)}
              title="Previous page"
              aria-label="Previous page"
            >
              ◀
            </button>

            <div className="pagerMeta" aria-label="Current page">
              Page <b>{clamp(data.page || 1, 1, pageCount)}</b> of <b>{pageCount}</b>
            </div>

            <button
              type="button"
              className="btnSm"
              disabled={!canNext}
              onClick={() => load((data.page || 1) + 1)}
              title="Next page"
              aria-label="Next page"
            >
              ▶
            </button>

            <button
              type="button"
              className="btnSm"
              disabled={!canNext}
              onClick={() => load(pageCount)}
              title="Last page"
              aria-label="Last page"
            >
              ⏭
            </button>
          </div>
        </div>
      </div>

      <AdminPageFooter />
    </div>
  );
}
