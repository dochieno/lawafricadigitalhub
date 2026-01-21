import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { API_BASE_URL } from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/invoice.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
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
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  // dd-mm-yy
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

function buildLogoUrl(path) {
  if (!path) return null;
  const origin = String(API_BASE_URL || "").replace(/\/api\/?$/i, "");
  const clean = String(path).replace(/^Storage\//i, "Storage/");
  return `${origin}/${clean}`;
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
      const params = {
        page,
        pageSize: data.pageSize,
      };
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

  return (
    <div className="adminCrud">
      <div className="adminCrud__header">
        <div>
          <h1 className="adminCrud__title">Invoices</h1>
          <p className="adminCrud__sub">Search and filter invoices, then open to print/download.</p>
        </div>

        <div className="adminCrud__actionsRow">
          <Link
            className="iconBtn"
            to="/dashboard/admin/invoice-settings"
            title="Invoice Settings"
            aria-label="Invoice Settings"
          >
            ⚙️
          </Link>
          <button className="iconBtn" onClick={onApplyFilters} title="Refresh" aria-label="Refresh">
            🔄
          </button>
        </div>
      </div>

      <div className="card">
        <div className="filtersGrid">
          <div className="field">
            <label>Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Invoice number, external ref, customer..."
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

          <div className="field field--actions">
            <label>&nbsp;</label>
            <div className="rowActions">
              <button className="btnPrimary" onClick={onApplyFilters} disabled={loading}>
                Apply
              </button>
              <button className="btnGhost" onClick={onClear} disabled={loading}>
                Clear
              </button>
            </div>
          </div>
        </div>

        {err ? <div className="alert alert--danger">{err}</div> : null}
        {loading ? <div className="alert alert--info">Loading invoices…</div> : null}

        <div className="tableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Status</th>
                <th>Issued</th>
                <th>Customer</th>
                <th>Purpose</th>
                <th className="num">Total</th>
                <th className="num">Paid</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>

            <tbody>
              {(data?.items || []).map((x) => (
                <tr key={x.id}>
                  <td>
                    <div className="stack">
                      <div className="strong">{x.invoiceNumber}</div>
                      <div className="muted">{x.currency}</div>
                    </div>
                  </td>
                  <td>
                    <span className={statusPill(x.status)}>{x.status}</span>
                  </td>
                  <td>{fmtDate(x.issuedAt)}</td>
                  <td>
                    <div className="stack">
                      <div className="strong">{x.customerName || "-"}</div>
                      <div className="muted">{x.customerType || "-"}</div>
                    </div>
                  </td>
                  <td>{x.purpose}</td>
                  <td className="num">{fmtMoney(x.total, x.currency)}</td>
                  <td className="num">{fmtMoney(x.amountPaid, x.currency)}</td>
                  <td className="actions">
                    <div className="iconRow">
                      <Link
                        className="iconBtn"
                        to={`/dashboard/admin/invoices/${x.id}`}
                        title="Open invoice"
                        aria-label="Open invoice"
                      >
                        👁️
                      </Link>
                      <Link
                        className="iconBtn"
                        to={`/dashboard/admin/invoices/${x.id}?print=1`}
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
                  <td colSpan={8}>
                    <div className="emptyState">No invoices found.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <div className="muted">
            Showing page <b>{data.page}</b> of <b>{pageCount}</b> — total <b>{data.totalCount}</b>
          </div>

          <div className="pagerBtns">
            <button className="btnGhost" disabled={loading || data.page <= 1} onClick={() => load(data.page - 1)}>
              Prev
            </button>
            <button
              className="btnGhost"
              disabled={loading || data.page >= pageCount}
              onClick={() => load(data.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <AdminPageFooter />
    </div>
  );
}
