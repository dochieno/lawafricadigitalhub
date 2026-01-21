import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { API_BASE_URL } from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/invoice.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

/**
 * Build a public asset URL for Storage paths.
 *
 * IMPORTANT:
 * - Backend serves: /storage/{**filePath}   (lowercase!)
 * - DB might store: Storage/Invoice/... or storage/Invoice/...
 * - We normalize and ALWAYS request via /storage/ to avoid Linux case issues (Render).
 *
 * API_BASE_URL should be absolute in production: https://lawfricaapi.onrender.com/api
 */
function buildAssetUrl(path) {
  if (!path) return null;

  // Normalize slashes + trim leading slash
  let p = String(path).trim().replace(/\\/g, "/").replace(/^\/+/, "");

  // Strip any leading Storage/ or storage/
  p = p.replace(/^Storage\//i, "");
  p = p.replace(/^storage\//i, "");

  const base = String(API_BASE_URL || "").trim();

  // If API base is relative (e.g. "/api"), we cannot infer backend origin reliably.
  // Fall back to same-origin but still use /storage route.
  if (!base || base.startsWith("/")) {
    return `/storage/${p}`;
  }

  // Convert ".../api" to origin
  const origin = base.replace(/\/api\/?$/i, "");

  // ALWAYS use lowercase route that matches your backend mapping
  return `${origin}/storage/${p}`;
}

function Field({ label, hint, children }) {
  return (
    <label className="field field--nice">
      <div className="field__top">
        <span className="field__label">{label}</span>
        {hint ? <span className="field__hint">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
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

  // If logo fails to load, don't let it trip global error overlay
  const [logoBroken, setLogoBroken] = useState(false);

  // Cache-buster when re-uploading
  const [logoNonce, setLogoNonce] = useState(0);

  const rawLogoUrl = useMemo(() => buildAssetUrl(form.logoPath), [form.logoPath]);
  const logoUrl = useMemo(() => {
    if (!rawLogoUrl) return null;
    const sep = rawLogoUrl.includes("?") ? "&" : "?";
    return `${rawLogoUrl}${sep}v=${logoNonce}`;
  }, [rawLogoUrl, logoNonce]);

  useEffect(() => {
    // Whenever the path changes, try loading again
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
          <p className="adminCrud__sub">These details are printed on every invoice.</p>
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
        <div className="settingsGrid">
          <div className="settingsCol">
            <div className="sectionHead">
              <h3 className="sectionTitle">Company</h3>
              <div className="sectionHint">Shown on every invoice header.</div>
            </div>

            <Field label="Company Name">
              <input value={form.companyName || ""} onChange={(e) => set("companyName", e.target.value)} />
            </Field>

            <Field label="Address Line 1">
              <input value={form.addressLine1 || ""} onChange={(e) => set("addressLine1", e.target.value)} />
            </Field>

            <Field label="Address Line 2">
              <input value={form.addressLine2 || ""} onChange={(e) => set("addressLine2", e.target.value)} />
            </Field>

            <div className="twoCols">
              <Field label="City">
                <input value={form.city || ""} onChange={(e) => set("city", e.target.value)} />
              </Field>

              <Field label="Country">
                <input value={form.country || ""} onChange={(e) => set("country", e.target.value)} />
              </Field>
            </div>

            <div className="twoCols">
              <Field label="VAT/PIN">
                <input value={form.vatOrPin || ""} onChange={(e) => set("vatOrPin", e.target.value)} />
              </Field>

              <Field label="Phone">
                <input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
              </Field>
            </div>

            <Field label="Email">
              <input value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
            </Field>

            <div className="sectionHead sectionHead--mt">
              <h3 className="sectionTitle">Logo</h3>
              <div className="sectionHint">Optional (PNG/JPG/WEBP).</div>
            </div>

            <div className="logoRow">
              <div className="logoPreview">
                {logoUrl && !logoBroken ? (
                  <img
                    src={logoUrl}
                    alt="Invoice logo"
                    onError={() => setLogoBroken(true)}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="mutedSmall">No logo</div>
                )}
              </div>

              <div className="logoActions">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => uploadLogo(e.target.files?.[0])}
                />
                <div className="mutedSmall">Tip: use a transparent PNG for best results.</div>
                {form.logoPath ? (
                  <div className="mutedSmall" style={{ marginTop: 6 }}>
                    Path: <span className="mutedSmall">{form.logoPath}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="settingsCol">
            <div className="sectionHead">
              <h3 className="sectionTitle">Payment Details</h3>
              <div className="sectionHint">Printed in the payment section.</div>
            </div>

            <div className="twoCols">
              <Field label="Paybill Number">
                <input value={form.paybillNumber || ""} onChange={(e) => set("paybillNumber", e.target.value)} />
              </Field>

              <Field label="Till Number">
                <input value={form.tillNumber || ""} onChange={(e) => set("tillNumber", e.target.value)} />
              </Field>
            </div>

            <Field label="Account Reference" hint="e.g. Company name or invoice number rule">
              <input value={form.accountReference || ""} onChange={(e) => set("accountReference", e.target.value)} />
            </Field>

            <div className="sectionHead sectionHead--mt">
              <h3 className="sectionTitle">Bank</h3>
              <div className="sectionHint">Only if you accept bank payments.</div>
            </div>

            <Field label="Bank Name">
              <input value={form.bankName || ""} onChange={(e) => set("bankName", e.target.value)} />
            </Field>

            <Field label="Account Name">
              <input value={form.bankAccountName || ""} onChange={(e) => set("bankAccountName", e.target.value)} />
            </Field>

            <Field label="Account Number">
              <input value={form.bankAccountNumber || ""} onChange={(e) => set("bankAccountNumber", e.target.value)} />
            </Field>

            <div className="sectionHead sectionHead--mt">
              <h3 className="sectionTitle">Footer Notes</h3>
              <div className="sectionHint">Printed at the bottom of the invoice.</div>
            </div>

            <Field label="Footer Notes">
              <textarea
                rows={5}
                value={form.footerNotes || ""}
                onChange={(e) => set("footerNotes", e.target.value)}
                placeholder="e.g. Thank you for your business. Payments are non-refundable..."
              />
            </Field>

            <div className="rowActions rowActions--right">
              <button className="btnPrimary btnPrimary--sm" onClick={save} disabled={saving}>
                💾 Save
              </button>
              <Link className="btnGhost btnGhost--sm" to="/dashboard/admin/finance/invoices">
                ⬅ Back
              </Link>
            </div>
          </div>
        </div>
      </div>

      <AdminPageFooter />
    </div>
  );
}
