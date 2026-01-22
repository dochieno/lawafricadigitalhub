// src/pages/dashboard/admin/AdminInvoiceSettings.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { API_BASE_URL } from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/invoice.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

function isAbsoluteHttpUrl(u) {
  return /^https?:\/\//i.test(String(u || "").trim());
}

function getBestApiOrigin() {
  // Prefer an absolute API base so /storage is served from backend, not Vercel.
  const candidates = [api?.defaults?.baseURL, API_BASE_URL].filter(Boolean).map(String);

  const abs = candidates.find((x) => isAbsoluteHttpUrl(x));
  if (abs) return abs.replace(/\/api\/?$/i, "").replace(/\/+$/g, "");

  // If both are relative ("/api"), fall back to current origin (dev / same-origin only).
  return window.location.origin;
}

/**
 * Build a public asset URL for Storage paths.
 *
 * Backend serves: GET /storage/{**filePath}
 * DB may store:
 *  - "/storage/Invoice/invoice-logo.png"   ✅ (new backend)
 *  - "storage/Invoice/invoice-logo.png"
 *  - "Storage/Invoice/invoice-logo.png"
 *  - "Invoice/invoice-logo.png"
 *  - "invoice-logo.png"
 */
function buildAssetUrl(path) {
  if (!path) return null;

  const raw = String(path).trim();
  if (!raw) return null;

  // Already absolute
  if (isAbsoluteHttpUrl(raw)) return raw;

  const origin = getBestApiOrigin();

  // ✅ If backend stores canonical URL "/storage/..."
  if (raw.startsWith("/storage/", { 0: 0 }) || raw.toLowerCase().startsWith("/storage/")) {
    return `${origin}${raw}`;
  }

  // Normalize slashes and remove leading slash
  let clean = raw.replace(/\\/g, "/").replace(/^\/+/, "");

  // Remove any stored prefix "Storage/" or "storage/"
  clean = clean.replace(/^Storage\//i, "");
  clean = clean.replace(/^storage\//i, "");

  // If someone stored "Invoice/..." or filename only, it becomes "/storage/<clean>"
  return `${origin}/storage/${clean}`;
}

function Field({ label, hint, children }) {
  return (
    <label className="field field--nice" style={{ marginBottom: 14 }}>
      <div className="field__top" style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
        <span className="field__label" style={{ fontWeight: 800 }}>{label}</span>
        {hint ? <span className="field__hint" style={{ opacity: 0.8 }}>{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function inputStyle() {
  return {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,.35)",
    background: "rgba(2,6,23,.22)",
    color: "inherit",
    outline: "none",
  };
}

function textareaStyle() {
  return {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,.35)",
    background: "rgba(2,6,23,.22)",
    color: "inherit",
    outline: "none",
    resize: "vertical",
  };
}

export default function AdminInvoiceSettings() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [form, setForm] = useState({
    companyName: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    country: "",
    vatOrPin: "",
    email: "",
    phone: "",
    logoPath: "",

    bankName: "",
    bankAccountName: "",
    bankAccountNumber: "",
    paybillNumber: "",
    tillNumber: "",
    accountReference: "",
    footerNotes: "",
  });

  // If logo fails to load, don't keep retrying + don't show overlay
  const [logoBroken, setLogoBroken] = useState(false);

  // Cache-buster only after upload
  const [logoNonce, setLogoNonce] = useState(0);

  const rawLogoUrl = useMemo(() => buildAssetUrl(form.logoPath), [form.logoPath]);

  const logoUrl = useMemo(() => {
    if (!rawLogoUrl || logoBroken) return null;
    const sep = rawLogoUrl.includes("?") ? "&" : "?";
    return `${rawLogoUrl}${sep}v=${logoNonce}`;
  }, [rawLogoUrl, logoBroken, logoNonce]);

  useEffect(() => {
    // when path changes, try again
    setLogoBroken(false);
  }, [rawLogoUrl]);

  function set(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function load() {
    setLoading(true);
    setErr("");
    setOk("");
    try {
      const res = await api.get("/admin/invoice-settings");
      setForm((p) => ({ ...p, ...res.data }));
    } catch (e) {
      setErr(e?.response?.data?.message || e?.response?.data || e?.message || "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    setErr("");
    setOk("");
    try {
      const payload = { ...form, id: 1 };
      const res = await api.put("/admin/invoice-settings", payload);
      setForm((p) => ({ ...p, ...res.data }));
      setOk("Saved.");
    } catch (e) {
      setErr(e?.response?.data?.message || e?.response?.data || e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file) {
    setErr("");
    setOk("");
    if (!file) return;

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await api.post("/admin/invoice-settings/logo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const path = res?.data?.logoPath;
      if (path) {
        set("logoPath", path);
        setLogoBroken(false);
        setLogoNonce((n) => n + 1); // bust cache after upload
      }

      setOk("Logo uploaded.");
    } catch (e) {
      setErr(e?.response?.data?.message || e?.response?.data || e?.message || "Logo upload failed.");
    }
  }

  return (
    <div className="adminCrud">
      <div className="adminCrud__header">
        <div>
          <h1 className="adminCrud__title">Invoice Settings</h1>
          <p className="adminCrud__sub">These details appear on every invoice (print + PDF).</p>
        </div>

        <div className="adminCrud__actionsRow">
          <Link
            className="iconBtn iconBtn--sm"
            to="/dashboard/admin/finance/invoices"
            title="Back to invoices"
            aria-label="Back to invoices"
          >
            ⬅️
          </Link>

          <button
            className="iconBtn iconBtn--sm"
            onClick={save}
            disabled={saving}
            title={saving ? "Saving..." : "Save"}
            aria-label="Save"
          >
            💾
          </button>
        </div>
      </div>

      {err ? <div className="alert alert--danger">{String(err)}</div> : null}
      {ok ? <div className="alert alert--ok">{ok}</div> : null}
      {loading ? <div className="alert alert--info">Loading settings…</div> : null}

      <div className="card invoiceCard">
        {/* Brand strip (UI only) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            padding: "14px 16px",
            borderRadius: 16,
            border: "1px solid rgba(148,163,184,.18)",
            background: "linear-gradient(135deg, rgba(112,40,64,.16), rgba(2,6,23,.18))",
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Brand & Payments</div>
            <div className="mutedSmall" style={{ marginTop: 4 }}>
              Upload your logo, set header details, and define payment instructions.
            </div>
          </div>

          <button
            type="button"
            className="btnPrimary btnPrimary--sm"
            onClick={save}
            disabled={saving}
            title={saving ? "Saving..." : "Save changes"}
          >
            💾 {saving ? "Saving..." : "Save"}
          </button>
        </div>

        <div
          className="settingsGrid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gap: 16,
          }}
        >
          {/* LEFT */}
          <div
            className="settingsCol"
            style={{
              gridColumn: "span 6",
              minWidth: 0,
            }}
          >
            <div className="sectionHead">
              <h3 className="sectionTitle">Company</h3>
              <div className="sectionHint">Printed on invoice header.</div>
            </div>

            <Field label="Company Name" hint="Required">
              <input
                style={inputStyle()}
                value={form.companyName || ""}
                onChange={(e) => set("companyName", e.target.value)}
                placeholder="e.g. LawAfrica"
              />
            </Field>

            <Field label="Address Line 1">
              <input
                style={inputStyle()}
                value={form.addressLine1 || ""}
                onChange={(e) => set("addressLine1", e.target.value)}
                placeholder="Street / Building"
              />
            </Field>

            <Field label="Address Line 2" hint="Optional">
              <input
                style={inputStyle()}
                value={form.addressLine2 || ""}
                onChange={(e) => set("addressLine2", e.target.value)}
                placeholder="P.O. Box / Suite"
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="City">
                <input style={inputStyle()} value={form.city || ""} onChange={(e) => set("city", e.target.value)} />
              </Field>

              <Field label="Country">
                <input
                  style={inputStyle()}
                  value={form.country || ""}
                  onChange={(e) => set("country", e.target.value)}
                  placeholder="e.g. Kenya"
                />
              </Field>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="VAT/PIN">
                <input
                  style={inputStyle()}
                  value={form.vatOrPin || ""}
                  onChange={(e) => set("vatOrPin", e.target.value)}
                  placeholder="e.g. P051234567A"
                />
              </Field>

              <Field label="Phone">
                <input
                  style={inputStyle()}
                  value={form.phone || ""}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+254..."
                />
              </Field>
            </div>

            <Field label="Email">
              <input
                style={inputStyle()}
                value={form.email || ""}
                onChange={(e) => set("email", e.target.value)}
                placeholder="accounts@company.com"
              />
            </Field>

            <div className="sectionHead sectionHead--mt" style={{ marginTop: 6 }}>
              <h3 className="sectionTitle">Logo</h3>
              <div className="sectionHint">PNG/JPG/WEBP (recommended: transparent PNG).</div>
            </div>

            <div
              className="logoRow"
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr",
                gap: 12,
                alignItems: "stretch",
                padding: 12,
                borderRadius: 16,
                border: "1px solid rgba(148,163,184,.18)",
                background: "rgba(2,6,23,.18)",
              }}
            >
              <div
                className="logoPreview"
                style={{
                  borderRadius: 14,
                  border: "1px dashed rgba(148,163,184,.35)",
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                  background: "rgba(2,6,23,.18)",
                  minHeight: 96,
                }}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Invoice logo"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    style={{ maxWidth: "100%", maxHeight: 84, objectFit: "contain" }}
                    onError={(e) => {
                      e?.stopPropagation?.();
                      setLogoBroken(true);
                    }}
                  />
                ) : (
                  <div className="mutedSmall" style={{ padding: 8, textAlign: "center" }}>
                    No logo
                  </div>
                )}
              </div>

              <div className="logoActions" style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid rgba(148,163,184,.25)",
                      background: "rgba(112,40,64,.16)",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                    title="Upload logo"
                  >
                    ⬆️ Upload Logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => uploadLogo(e.target.files?.[0])}
                    />
                  </label>

                  <button
                    type="button"
                    className="btnGhost btnGhost--sm"
                    onClick={() => {
                      setLogoBroken(false);
                      setLogoNonce((n) => n + 1);
                    }}
                    title="Refresh preview"
                  >
                    🔄 Refresh
                  </button>
                </div>

                <div className="mutedSmall">
                  The backend stores logoPath like <span className="au-mono">/storage/Invoice/invoice-logo.png</span>.
                </div>

                {form.logoPath ? (
                  <div className="mutedSmall">
                    Saved path: <span className="au-mono">{form.logoPath}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div
            className="settingsCol"
            style={{
              gridColumn: "span 6",
              minWidth: 0,
            }}
          >
            <div className="sectionHead">
              <h3 className="sectionTitle">Payment Details</h3>
              <div className="sectionHint">Printed in the payment section.</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Paybill Number">
                <input
                  style={inputStyle()}
                  value={form.paybillNumber || ""}
                  onChange={(e) => set("paybillNumber", e.target.value)}
                  placeholder="e.g. 123456"
                />
              </Field>

              <Field label="Till Number">
                <input
                  style={inputStyle()}
                  value={form.tillNumber || ""}
                  onChange={(e) => set("tillNumber", e.target.value)}
                  placeholder="e.g. 987654"
                />
              </Field>
            </div>

            <Field label="Account Reference" hint="e.g. invoice number rule">
              <input
                style={inputStyle()}
                value={form.accountReference || ""}
                onChange={(e) => set("accountReference", e.target.value)}
                placeholder="e.g. INV-{number}"
              />
            </Field>

            <div className="sectionHead sectionHead--mt" style={{ marginTop: 8 }}>
              <h3 className="sectionTitle">Bank</h3>
              <div className="sectionHint">Fill only if you accept bank payments.</div>
            </div>

            <Field label="Bank Name">
              <input
                style={inputStyle()}
                value={form.bankName || ""}
                onChange={(e) => set("bankName", e.target.value)}
                placeholder="e.g. KCB"
              />
            </Field>

            <Field label="Account Name">
              <input
                style={inputStyle()}
                value={form.bankAccountName || ""}
                onChange={(e) => set("bankAccountName", e.target.value)}
                placeholder="Account holder name"
              />
            </Field>

            <Field label="Account Number">
              <input
                style={inputStyle()}
                value={form.bankAccountNumber || ""}
                onChange={(e) => set("bankAccountNumber", e.target.value)}
                placeholder="Account number"
              />
            </Field>

            <div className="sectionHead sectionHead--mt" style={{ marginTop: 8 }}>
              <h3 className="sectionTitle">Footer Notes</h3>
              <div className="sectionHint">Printed at the bottom of the invoice.</div>
            </div>

            <Field label="Footer Notes">
              <textarea
                rows={5}
                style={textareaStyle()}
                value={form.footerNotes || ""}
                onChange={(e) => set("footerNotes", e.target.value)}
                placeholder="e.g. Thank you for your business. Payments are non-refundable..."
              />
            </Field>

            <div className="rowActions rowActions--right" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btnPrimary btnPrimary--sm" onClick={save} disabled={saving}>
                💾 {saving ? "Saving..." : "Save"}
              </button>
              <Link className="btnGhost btnGhost--sm" to="/dashboard/admin/finance/invoices">
                ⬅ Back
              </Link>
            </div>
          </div>
        </div>

        {/* Responsive tweak without CSS file changes */}
        <style>{`
          @media (max-width: 980px){
            .settingsGrid { grid-template-columns: 1fr !important; }
            .settingsCol { grid-column: span 12 !important; }
          }
        `}</style>
      </div>

      <AdminPageFooter />
    </div>
  );
}
