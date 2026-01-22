// src/pages/dashboard/admin/AdminInvoiceDetail.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import api, { API_BASE_URL } from "../../../api/client";
import "../../../styles/adminUsers.css"; // ✅ uniform Admin Console look (au-*)
import "../../../styles/invoice.css"; // ✅ keeps print styling + invoice paper styles

function fmtMoney(amount, currency = "KES") {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function fmtDateLong(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function fmtDateShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function isAbsoluteHttpUrl(u) {
  return /^https?:\/\//i.test(String(u || "").trim());
}

function getBestApiOrigin() {
  const candidates = [api?.defaults?.baseURL, API_BASE_URL].filter(Boolean).map(String);

  const abs = candidates.find((x) => isAbsoluteHttpUrl(x));
  if (abs) return abs.replace(/\/api\/?$/i, "").replace(/\/+$/g, "");

  return window.location.origin;
}

/**
 * Build a public asset URL for Storage paths.
 * - Backend serves: /storage/{**filePath} (lowercase)
 * - DB might store: Storage/... or storage/...
 * - Normalize to ALWAYS request via /storage/
 */
function buildAssetUrl(path) {
  if (!path) return null;

  const raw = String(path).trim();
  if (!raw) return null;

  if (isAbsoluteHttpUrl(raw)) return raw;

  let clean = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  clean = clean.replace(/^Storage\//i, "");
  clean = clean.replace(/^storage\//i, "");

  const origin = getBestApiOrigin();
  return `${origin}/storage/${clean}`;
}

async function safeCopy(text) {
  try {
    await navigator.clipboard.writeText(String(text || ""));
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = String(text || "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function Badge({ tone = "neutral", children }) {
  return <span className={`au-badge au-badge-${tone}`}>{children}</span>;
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
    case "back":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M15 18l-6-6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
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
          <path
            d="M6 14h12v8H6v-8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      );
    case "copy":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M9 9h11v13H9V9Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M4 15H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1"
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
  return "neutral"; // draft/unknown
}

export default function AdminInvoiceDetail() {
  const { id } = useParams();
  const location = useLocation();
  const printRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [inv, setInv] = useState(null);
  const [copied, setCopied] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);

  const shouldAutoPrint = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    return qs.get("print") === "1";
  }, [location.search]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await api.get(`/admin/invoices/${id}`);
      setInv(res.data);
      setLogoBroken(false);
    } catch (e) {
      const msg =
        e?.response?.data?.message || e?.response?.data || e?.message || "Failed to load invoice.";
      setErr(String(msg));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!inv) return;
    if (!shouldAutoPrint) return;
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, [inv, shouldAutoPrint]);

  async function copyInvoiceNumber() {
    if (!inv?.invoiceNumber) return;
    const ok = await safeCopy(inv.invoiceNumber);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1200);
  }

  const company = inv?.company || {};

  const balance = useMemo(() => {
    const total = Number(inv?.total || 0);
    const paid = Number(inv?.amountPaid || 0);
    return total - paid;
  }, [inv]);

  const isPaid = useMemo(() => String(inv?.status || "").toLowerCase() === "paid", [inv]);

  const logoUrl = useMemo(() => {
    if (logoBroken) return null;
    return buildAssetUrl(company.logoPath);
  }, [company.logoPath, logoBroken]);

  return (
    <div className="au-wrap">
      {/* ===== HERO (uniform) ===== */}
      <header className="au-hero noPrint">
        <div className="au-heroLeft">
          <div className="au-titleRow">
            <div className="au-titleStack">
              <div className="au-kicker">LawAfrica • Admin</div>
              <h1 className="au-title">
                Invoice{" "}
                <span className="au-mono" style={{ fontWeight: 800 }}>
                  {inv?.invoiceNumber || (loading ? "…" : "")}
                </span>
              </h1>
              <div className="au-subtitle">
                Print-ready preview. Use browser print to download PDF.
              </div>
            </div>

            <div className="au-heroRight">
              <Link
                className="au-iconBtn au-iconBtn-neutral"
                to="/dashboard/admin/finance/invoices"
                title="Back to invoices"
                aria-label="Back to invoices"
              >
                <Icon name="back" />
              </Link>

              <IconBtn
                tone="neutral"
                disabled={loading || !inv}
                title="Print / Download PDF"
                onClick={() => window.print()}
              >
                <Icon name="print" />
              </IconBtn>

              <IconBtn
                tone={copied ? "success" : "neutral"}
                disabled={!inv?.invoiceNumber}
                title={copied ? "Copied!" : "Copy invoice number"}
                onClick={copyInvoiceNumber}
              >
                <Icon name="copy" />
              </IconBtn>

              <Link
                className="au-iconBtn au-iconBtn-neutral"
                to="/dashboard/admin/finance/invoice-settings"
                title="Invoice Settings"
                aria-label="Invoice Settings"
              >
                <Icon name="gear" />
              </Link>
            </div>
          </div>

          {err ? <div className="au-error">{err}</div> : null}
        </div>
      </header>

      {/* ===== SUMMARY PANEL (uniform) ===== */}
      <section className="au-panel noPrint">
        <div className="au-panelTop">
          <div className="au-panelTitle">{loading ? "Loading…" : "Invoice summary"}</div>
          {inv ? <Badge tone={statusTone(inv.status)}>{String(inv.status || "Draft")}</Badge> : null}
        </div>

        {loading ? (
          <div className="au-muted" style={{ padding: "14px 18px" }}>
            Loading invoice…
          </div>
        ) : null}

        {inv ? (
          <div style={{ padding: "0 18px 18px" }}>
            {/* KPI-style summary row (matches AdminUsers feel) */}
            <div className="au-kpisInline" style={{ marginTop: 12 }}>
              <div className="au-kpiMini">
                <div className="au-kpiMiniLabel">Invoice No.</div>
                <div className="au-kpiMiniValue au-mono">{inv.invoiceNumber}</div>
              </div>

              <div className="au-kpiMini">
                <div className="au-kpiMiniLabel">Document Date</div>
                <div className="au-kpiMiniValue">{fmtDateShort(inv.issuedAt)}</div>
              </div>

              <div className="au-kpiMini">
                <div className="au-kpiMiniLabel">Currency</div>
                <div className="au-kpiMiniValue">{inv.currency || "KES"}</div>
              </div>

              <div className="au-kpiMini">
                <div className="au-kpiMiniLabel">Total</div>
                <div className="au-kpiMiniValue">{fmtMoney(inv.total, inv.currency)}</div>
              </div>

              <div className="au-kpiMini">
                <div className="au-kpiMiniLabel">Paid</div>
                <div className="au-kpiMiniValue">{fmtMoney(inv.amountPaid, inv.currency)}</div>
              </div>

              <div className="au-kpiMini">
                <div className="au-kpiMiniLabel">Balance</div>
                <div className="au-kpiMiniValue">{fmtMoney(balance, inv.currency)}</div>
              </div>
            </div>

            {/* compact meta row */}
            <div
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr",
                gap: 12,
              }}
            >
              <div className="au-muted" style={{ lineHeight: 1.5 }}>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ opacity: 0.8 }}>Customer:</span>{" "}
                  <span style={{ fontWeight: 700, opacity: 1 }}>{inv.customerName || "—"}</span>
                </div>
                {inv.customerEmail ? (
                  <div>
                    <span style={{ opacity: 0.8 }}>Email:</span>{" "}
                    <span className="au-mono">{inv.customerEmail}</span>
                  </div>
                ) : null}
                {inv.customerType ? (
                  <div>
                    <span style={{ opacity: 0.8 }}>Type:</span> {inv.customerType}
                  </div>
                ) : null}
              </div>

              <div className="au-muted" style={{ lineHeight: 1.5 }}>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ opacity: 0.8 }}>Purpose:</span>{" "}
                  <span style={{ fontWeight: 600 }}>{inv.purpose || "—"}</span>
                </div>
                {inv.externalInvoiceNumber ? (
                  <div>
                    <span style={{ opacity: 0.8 }}>External Ref:</span>{" "}
                    <span className="au-mono">{inv.externalInvoiceNumber}</span>
                  </div>
                ) : null}
                {inv.paidAt ? (
                  <div>
                    <span style={{ opacity: 0.8 }}>Paid At:</span> {fmtDateLong(inv.paidAt)}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="au-panelBottom">
          <div className="au-muted">Tip: use “Print” to download PDF from the browser print dialog.</div>
          <div className="au-muted">Invoice logo is served from /storage via backend origin.</div>
        </div>
      </section>

      {/* ===== PRINT AREA (keep your invoice.css untouched) ===== */}
      {inv ? (
        <div className="invoicePage">
          <div className="invoicePaperWrap">
            <div className="invoicePaper invoicePaper--wide" ref={printRef}>
              {/* Header */}
              <div className="invoiceHeader">
                <div className="brandBlock">
                  {logoUrl ? (
                    <img
                      className="brandLogo"
                      src={logoUrl}
                      alt="Company logo"
                      onError={() => setLogoBroken(true)}
                    />
                  ) : (
                    <div className="brandLogo brandLogo--placeholder">Company logo</div>
                  )}

                  <div className="brandText">
                    <div className="brandName">{company.companyName || "Company"}</div>

                    <div className="brandMeta">
                      {company.addressLine1 ? <div>{company.addressLine1}</div> : null}
                      {company.addressLine2 ? <div>{company.addressLine2}</div> : null}
                      {company.city || company.country ? (
                        <div>{[company.city, company.country].filter(Boolean).join(", ")}</div>
                      ) : null}

                      <div className="brandRow">
                        {company.vatOrPin ? <span>VAT/PIN: {company.vatOrPin}</span> : null}
                        {company.email ? <span>Email: {company.email}</span> : null}
                        {company.phone ? <span>Phone: {company.phone}</span> : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="invoiceMeta">
                  <div className="invoiceTitle">INVOICE</div>

                  <div className="metaTable">
                    <div className="metaRow">
                      <div className="k">Invoice No</div>
                      <div className="v">{inv.invoiceNumber}</div>
                    </div>

                    <div className="metaRow">
                      <div className="k">Status</div>
                      <div className="v">{inv.status}</div>
                    </div>

                    <div className="metaRow">
                      <div className="k">Issued</div>
                      <div className="v">{fmtDateShort(inv.issuedAt)}</div>
                    </div>

                    <div className="metaRow">
                      <div className="k">Due</div>
                      <div className="v">{inv.dueAt ? fmtDateShort(inv.dueAt) : "—"}</div>
                    </div>

                    <div className="metaRow">
                      <div className="k">Currency</div>
                      <div className="v">{inv.currency || "KES"}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bill to */}
              <div className="invoiceBillTo">
                <div>
                  <div className="sectionLabel">Bill To</div>
                  <div className="billName">{inv.customerName || "—"}</div>

                  <div className="billMeta">
                    {inv.customerType ? <div>{inv.customerType}</div> : null}
                    {inv.customerEmail ? <div>{inv.customerEmail}</div> : null}
                    {inv.customerPhone ? <div>{inv.customerPhone}</div> : null}
                    {inv.customerAddress ? <div>{inv.customerAddress}</div> : null}
                    {inv.customerVatOrPin ? <div>VAT/PIN: {inv.customerVatOrPin}</div> : null}
                  </div>
                </div>

                <div className="purposeBox">
                  <div className="sectionLabel">Purpose</div>
                  <div className="purposeText">{inv.purpose}</div>

                  {inv.externalInvoiceNumber ? (
                    <div className="mutedSmall">External Ref: {inv.externalInvoiceNumber}</div>
                  ) : null}

                  {inv.paidAt ? (
                    <div className="mutedSmall">Paid At: {fmtDateLong(inv.paidAt)}</div>
                  ) : null}
                </div>
              </div>

              {/* Lines */}
              <div className="invoiceLines">
                <div className="linesTableWrap">
                  <table className="linesTable">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th className="num">Qty</th>
                        <th className="num">Unit</th>
                        <th className="num">Subtotal</th>
                        <th className="num">Tax</th>
                        <th className="num">Discount</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>

                    <tbody>
                      {(inv.lines || []).map((l, idx) => (
                        <tr key={idx}>
                          <td>
                            <div className="strong">{l.description}</div>
                            {l.itemCode ? <div className="mutedSmall">Code: {l.itemCode}</div> : null}
                          </td>

                          <td className="num">{Number(l.quantity || 0).toFixed(2)}</td>
                          <td className="num">{fmtMoney(l.unitPrice, inv.currency)}</td>
                          <td className="num">{fmtMoney(l.lineSubtotal, inv.currency)}</td>
                          <td className="num">{fmtMoney(l.taxAmount, inv.currency)}</td>
                          <td className="num">{fmtMoney(l.discountAmount, inv.currency)}</td>
                          <td className="num">{fmtMoney(l.lineTotal, inv.currency)}</td>
                        </tr>
                      ))}

                      {(inv.lines || []).length === 0 ? (
                        <tr>
                          <td colSpan={7}>
                            <div className="mutedSmall">No invoice line items.</div>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="invoiceTotals">
                <div className="totalsBox">
                  <div className="tRow">
                    <div className="k">Subtotal</div>
                    <div className="v">{fmtMoney(inv.subtotal, inv.currency)}</div>
                  </div>

                  <div className="tRow">
                    <div className="k">Tax</div>
                    <div className="v">{fmtMoney(inv.taxTotal, inv.currency)}</div>
                  </div>

                  <div className="tRow">
                    <div className="k">Discount</div>
                    <div className="v">{fmtMoney(inv.discountTotal, inv.currency)}</div>
                  </div>

                  <div className="tRow tRow--grand">
                    <div className="k">Total</div>
                    <div className="v">{fmtMoney(inv.total, inv.currency)}</div>
                  </div>

                  <div className="tRow">
                    <div className="k">Amount Paid</div>
                    <div className="v">{fmtMoney(inv.amountPaid, inv.currency)}</div>
                  </div>

                  <div className="tRow tRow--due">
                    <div className="k">Balance</div>
                    <div className="v">{fmtMoney(balance, inv.currency)}</div>
                  </div>
                </div>

                <div className="payBox">
                  <div className="sectionLabel">Payment Details</div>

                  <div className="payGrid">
                    {company.paybillNumber ? (
                      <div>
                        <div className="mutedSmall">Paybill</div>
                        <div className="strong">{company.paybillNumber}</div>
                      </div>
                    ) : null}

                    {company.tillNumber ? (
                      <div>
                        <div className="mutedSmall">Till</div>
                        <div className="strong">{company.tillNumber}</div>
                      </div>
                    ) : null}

                    {company.accountReference ? (
                      <div>
                        <div className="mutedSmall">Account Ref</div>
                        <div className="strong">{company.accountReference}</div>
                      </div>
                    ) : null}

                    {company.bankName || company.bankAccountNumber ? (
                      <div className="payFull">
                        <div className="mutedSmall">Bank</div>
                        <div className="strong">
                          {[company.bankName, company.bankAccountName].filter(Boolean).join(" — ")}
                        </div>
                        {company.bankAccountNumber ? (
                          <div className="mutedSmall">A/C: {company.bankAccountNumber}</div>
                        ) : null}
                      </div>
                    ) : null}

                    {!company.paybillNumber &&
                    !company.tillNumber &&
                    !company.bankName &&
                    !company.bankAccountNumber ? (
                      <div className="mutedSmall">Set payment details in Invoice Settings.</div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Notes */}
              {inv.notes ? (
                <div className="invoiceNotes">
                  <div className="sectionLabel">Notes</div>
                  <div className="notesBox">{inv.notes}</div>
                </div>
              ) : null}

              {/* Footer */}
              <div className="invoiceFooter">
                {company.footerNotes ? <div className="footerNotes">{company.footerNotes}</div> : null}
                <div className="mutedSmall">Generated by LawAfrica Platform</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
