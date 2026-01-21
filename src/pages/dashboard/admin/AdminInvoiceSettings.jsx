import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { API_BASE_URL } from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/invoice.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function buildAssetUrl(path) {
  if (!path) return null;
  const origin = String(API_BASE_URL || "").replace(/\/api\/?$/i, "");
  const clean = String(path).replace(/^Storage\//i, "Storage/");
  return `${origin}/${clean}`;
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
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

  const logoUrl = useMemo(() => buildAssetUrl(form.logoPath), [form.logoPath]);

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
      if (path) set("logoPath", path);
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
          <Link className="iconBtn" to="/dashboard/admin/invoices" title="Back to invoices" aria-label="Back">
            ⬅️
          </Link>
          <button className="iconBtn" onClick={save} disabled={saving} title="Save" aria-label="Save">
            💾
          </button>
        </div>
      </div>

      {err ? <div className="alert alert--danger">{String(err)}</div> : null}
      {ok ? <div className="alert alert--ok">{ok}</div> : null}
      {loading ? <div className="alert alert--info">Loading settings…</div> : null}

      <div className="card">
        <div className="settingsGrid">
          <div className="settingsCol">
            <h3 className="sectionTitle">Company</h3>

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

            <h3 className="sectionTitle mt">Logo</h3>
            <div className="logoRow">
              <div className="logoPreview">
                {logoUrl ? <img src={logoUrl} alt="Invoice logo" /> : <div className="mutedSmall">No logo</div>}
              </div>
              <div className="logoActions">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => uploadLogo(e.target.files?.[0])}
                />
                <div className="mutedSmall">PNG/JPG/WEBP, max 5MB.</div>
              </div>
            </div>
          </div>

          <div className="settingsCol">
            <h3 className="sectionTitle">Payment Details</h3>

            <Field label="Paybill Number">
              <input value={form.paybillNumber || ""} onChange={(e) => set("paybillNumber", e.target.value)} />
            </Field>

            <Field label="Till Number">
              <input value={form.tillNumber || ""} onChange={(e) => set("tillNumber", e.target.value)} />
            </Field>

            <Field label="Account Reference" hint="e.g. Your company name or invoice number rule">
              <input value={form.accountReference || ""} onChange={(e) => set("accountReference", e.target.value)} />
            </Field>

            <h3 className="sectionTitle mt">Bank</h3>

            <Field label="Bank Name">
              <input value={form.bankName || ""} onChange={(e) => set("bankName", e.target.value)} />
            </Field>

            <Field label="Account Name">
              <input value={form.bankAccountName || ""} onChange={(e) => set("bankAccountName", e.target.value)} />
            </Field>

            <Field label="Account Number">
              <input value={form.bankAccountNumber || ""} onChange={(e) => set("bankAccountNumber", e.target.value)} />
            </Field>

            <h3 className="sectionTitle mt">Footer Notes</h3>
            <Field label="Footer Notes" hint="Printed at the bottom of the invoice">
              <textarea
                rows={5}
                value={form.footerNotes || ""}
                onChange={(e) => set("footerNotes", e.target.value)}
                placeholder="e.g. Thank you for your business. Payments are non-refundable..."
              />
            </Field>

            <div className="rowActions">
              <button className="btnPrimary" onClick={save} disabled={saving}>
                Save
              </button>
              <Link className="btnGhost" to="/dashboard/admin/invoices">
                Back
              </Link>
            </div>
          </div>
        </div>
      </div>

      <AdminPageFooter />
    </div>
  );
}
