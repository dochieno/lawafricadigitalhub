// src/pages/dashboard/admin/AdminInstitutions.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import AdminPageFooter from "../../../components/AdminPageFooter";
import { getAuthClaims } from "../../../auth/auth";

function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if (v.message) return String(v.message);
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return "An unexpected error occurred.";
    }
  }
  return String(v);
}

function parseIntOrZero(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (s === "") return 0;

  const n = Number(s);
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;

  return Math.max(0, Math.trunc(n));
}

function friendlyApiError(e) {
  const status = e?.response?.status;
  const data = e?.response?.data;

  // ASP.NET validation error shape
  if (status === 400 && data?.errors) {
    const errs = data.errors;

    const seatErr =
      (errs["$.maxStudentSeats"] && errs["$.maxStudentSeats"][0]) ||
      (errs["maxStudentSeats"] && errs["maxStudentSeats"][0]) ||
      (errs["$.maxStaffSeats"] && errs["$.maxStaffSeats"][0]) ||
      (errs["maxStaffSeats"] && errs["maxStaffSeats"][0]);

    if (seatErr) {
      return "Seat limits must be numbers. Please enter a valid value (or leave blank to default to 0).";
    }

    if (errs.request?.[0]) {
      return "Invalid request payload. Please refresh the page and try again.";
    }

    const firstKey = Object.keys(errs)[0];
    if (firstKey && errs[firstKey]?.length) {
      return errs[firstKey][0];
    }

    return "Please correct the highlighted fields and try again.";
  }

  return toText(data || e?.message || "Save failed.");
}

const emptyForm = {
  name: "",
  shortName: "",
  emailDomain: "",
  officialEmail: "",
  phoneNumber: "",
  alternatePhoneNumber: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  stateOrProvince: "",
  postalCode: "",
  countryId: "",
  registrationNumber: "",
  institutionAccessCode: "",
  taxPin: "",
  institutionType: 1,
  requiresUserApproval: false,
  maxStudentSeats: "",
  maxStaffSeats: "",
  allowIndividualPurchasesWhenInstitutionInactive: false,
};

function parseInstitutionType(v) {
  if (v == null || v === "") return 1;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  const n = Number(s);
  if (!Number.isNaN(n) && n > 0) return n;

  const lower = s.toLowerCase();
  if (lower === "academic") return 1;
  if (lower === "corporate") return 2;
  if (lower === "government") return 3;

  return 1;
}

function getInstitutionTypeLabel(typeVal) {
  const n = parseInstitutionType(typeVal);
  if (n === 1) return "Academic";
  if (n === 2) return "Corporate";
  if (n === 3) return "Government";
  return "—";
}

function toBool(v) {
  if (v === true || v === false) return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  if (typeof v === "number") return v !== 0;
  return false;
}

function mapInstitutionToForm(entity) {
  const x = entity || {};
  return {
    name: x.name ?? x.Name ?? "",
    shortName: x.shortName ?? x.ShortName ?? "",
    emailDomain: x.emailDomain ?? x.EmailDomain ?? "",
    officialEmail: x.officialEmail ?? x.OfficialEmail ?? "",
    phoneNumber: x.phoneNumber ?? x.PhoneNumber ?? "",
    alternatePhoneNumber: x.alternatePhoneNumber ?? x.AlternatePhoneNumber ?? "",
    addressLine1: x.addressLine1 ?? x.AddressLine1 ?? "",
    addressLine2: x.addressLine2 ?? x.AddressLine2 ?? "",
    city: x.city ?? x.City ?? "",
    stateOrProvince: x.stateOrProvince ?? x.StateOrProvince ?? "",
    postalCode: x.postalCode ?? x.PostalCode ?? "",
    countryId: (x.countryId ?? x.CountryId ?? "")?.toString?.() ?? "",
    registrationNumber: x.registrationNumber ?? x.RegistrationNumber ?? "",
    institutionAccessCode: x.institutionAccessCode ?? x.InstitutionAccessCode ?? "",
    taxPin: x.taxPin ?? x.TaxPin ?? "",
    institutionType: parseInstitutionType(
      x.institutionType ??
        x.InstitutionType ??
        x.institutionTypeName ??
        x.InstitutionTypeName
    ),
    requiresUserApproval: x.requiresUserApproval ?? x.RequiresUserApproval ?? false,
    maxStudentSeats: (x.maxStudentSeats ?? x.MaxStudentSeats ?? "")?.toString?.() ?? "",
    maxStaffSeats: (x.maxStaffSeats ?? x.MaxStaffSeats ?? "")?.toString?.() ?? "",
    allowIndividualPurchasesWhenInstitutionInactive: toBool(
      x.allowIndividualPurchasesWhenInstitutionInactive ??
        x.AllowIndividualPurchasesWhenInstitutionInactive
    ),
  };
}

function isGlobalAdmin() {
  const c = getAuthClaims();
  if (c?.isGlobalAdmin === true) return true;
  if (String(c?.isGlobalAdmin || "").toLowerCase() === "true") return true;
  if (String(c?.globalAdmin || "").toLowerCase() === "true") return true;
  if (String(c?.IsGlobalAdmin || "").toLowerCase() === "true") return true;
  if (String(c?.role || c?.Role || "").toLowerCase() === "globaladmin") return true;
  return false;
}

export default function AdminInstitutions() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [modalLoading, setModalLoading] = useState(false);

  const [countries, setCountries] = useState([]);

  const [policyBusy, setPolicyBusy] = useState(false);

  const canEditPolicy = isGlobalAdmin();

  async function loadAll() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await api.get("/Institutions");
      const data = res.data?.data ?? res.data;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setError(toText(e?.response?.data || e?.message || "Failed to load institutions."));
    } finally {
      setLoading(false);
    }
  }

  async function loadCountries() {
    try {
      const res = await api.get("/Country");
      const data = res.data?.data ?? res.data;
      setCountries(Array.isArray(data) ? data : []);
    } catch {
      setCountries([]);
    }
  }

  useEffect(() => {
    loadAll();
    loadCountries();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const name = (r.name ?? r.Name ?? "").toLowerCase();
      const domain = (r.emailDomain ?? r.EmailDomain ?? "").toLowerCase();
      const email = (r.officialEmail ?? r.OfficialEmail ?? "").toLowerCase();
      return name.includes(s) || domain.includes(s) || email.includes(s);
    });
  }, [rows, q]);

  function openCreate() {
    setError("");
    setInfo("");
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  async function openEdit(row) {
    setError("");
    setInfo("");
    setEditing(row);
    setOpen(true);

    setForm({ ...emptyForm, ...mapInstitutionToForm(row) });

    setModalLoading(true);
    try {
      const id = row.id ?? row.Id;
      const res = await api.get(`/Institutions/${id}`);
      const data = res.data?.data ?? res.data;
      setForm({ ...emptyForm, ...mapInstitutionToForm(data) });
    } catch {
      setInfo("Loaded partial record (details endpoint failed).");
    } finally {
      setModalLoading(false);
    }
  }

  function closeModal() {
    if (busy || policyBusy) return;
    setOpen(false);
    setModalLoading(false);
    setPolicyBusy(false);
  }

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function buildPayload() {
    return {
      name: form.name.trim(),
      shortName: form.shortName.trim() || null,
      emailDomain: form.emailDomain.trim(),
      officialEmail: form.officialEmail.trim(),
      phoneNumber: form.phoneNumber.trim() || null,
      alternatePhoneNumber: form.alternatePhoneNumber.trim() || null,
      addressLine1: form.addressLine1.trim() || null,
      addressLine2: form.addressLine2.trim() || null,
      city: form.city.trim() || null,
      stateOrProvince: form.stateOrProvince.trim() || null,
      postalCode: form.postalCode.trim() || null,
      countryId: form.countryId ? Number(form.countryId) : null,
      taxPin: form.taxPin.trim() || null,
      institutionType: parseInstitutionType(form.institutionType),
      requiresUserApproval: !!form.requiresUserApproval,

      // ✅ If blank/null -> send 0 (backend expects int)
      maxStudentSeats: parseIntOrZero(form.maxStudentSeats),
      maxStaffSeats: parseIntOrZero(form.maxStaffSeats),
    };
  }

  async function save() {
    setError("");
    setInfo("");

    if (!form.name.trim()) return setError("Name is required.");
    if (!form.emailDomain.trim()) return setError("Email domain is required.");
    if (!form.officialEmail.trim()) return setError("Official email is required.");

    setBusy(true);
    try {
      const payload = buildPayload();

      if (editing) {
        const id = editing.id ?? editing.Id;
        await api.put(`/Institutions/${id}`, payload);
        setInfo("Institution updated.");
      } else {
        await api.post("/Institutions", payload);
        setInfo("Institution created.");
      }

      closeModal();
      await loadAll();
    } catch (e) {
      setError(friendlyApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row) {
    const id = row.id ?? row.Id;
    const isActive = row.isActive ?? row.IsActive ?? false;

    setError("");
    setInfo("");
    setBusy(true);
    try {
      await api.post(`/Institutions/${id}/${isActive ? "deactivate" : "activate"}`);
      setInfo(isActive ? "Institution deactivated." : "Institution activated.");
      await loadAll();
    } catch (e) {
      setError(toText(e?.response?.data || e?.message || "Failed to update status."));
    } finally {
      setBusy(false);
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      setInfo("Copied to clipboard.");
      setTimeout(() => setInfo(""), 1500);
    } catch {
      setError("Copy failed. Please copy manually.");
    }
  }

  async function savePurchasePolicy(nextValue) {
    if (!editing) return;
    if (!canEditPolicy) return;

    const id = editing.id ?? editing.Id;

    setError("");
    setInfo("");
    setPolicyBusy(true);

    setField("allowIndividualPurchasesWhenInstitutionInactive", !!nextValue);

    try {
      await api.post(`/Institutions/${id}/purchase-policy`, {
        allowIndividualPurchasesWhenInstitutionInactive: !!nextValue,
      });

      setInfo("Purchase policy updated.");
      await loadAll();
    } catch (e) {
      setField("allowIndividualPurchasesWhenInstitutionInactive", !nextValue);
      setError(
        toText(
          e?.response?.data || e?.message || "Failed to update purchase policy."
        )
      );
    } finally {
      setPolicyBusy(false);
    }
  }

  const isCreate = !editing;

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · Institutions</h1>
          <p className="admin-subtitle">
            Create, activate, and manage institutions (Global Admin only).
          </p>
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={loadAll} disabled={busy || loading}>
            Refresh
          </button>
          <button className="admin-btn primary compact" onClick={openCreate} disabled={busy}>
            + New
          </button>
        </div>
      </div>

      {(error || info) && (
        <div className={`admin-alert ${error ? "error" : "ok"}`}>
          {error ? error : info}
        </div>
      )}

      <div className="admin-card admin-card-fill">
        <div className="admin-toolbar">
          <input
            className="admin-search admin-search-wide"
            placeholder="Search by name, domain, or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <div className="admin-pill muted">
            {loading ? "Loading…" : `${filtered.length} institution(s)`}
          </div>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: "38%" }}>Name</th>
              <th style={{ width: "34%" }}>Official Email</th>
              <th style={{ width: "10%" }}>Type</th>
              <th style={{ width: "12%" }}>Approval</th>
              <th style={{ width: "10%" }}>Status</th>
              <th style={{ textAlign: "right", width: "16%" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "#6b7280", padding: "14px" }}>
                  No institutions found.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const id = r.id ?? r.Id;
              const name = r.name ?? r.Name;
              const email = r.officialEmail ?? r.OfficialEmail;

              const typeVal =
                r.institutionType ??
                r.InstitutionType ??
                r.institutionTypeName ??
                r.InstitutionTypeName ??
                1;

              const requires = r.requiresUserApproval ?? r.RequiresUserApproval ?? false;
              const isActive = r.isActive ?? r.IsActive ?? false;

              return (
                <tr key={id}>
                  <td style={{ fontWeight: 900 }}>{name}</td>
                  <td>{email}</td>

                  <td>
                    <span className="admin-pill">{getInstitutionTypeLabel(typeVal)}</span>
                  </td>

                  <td>
                    <span className={`admin-pill ${requires ? "warn" : "ok"}`}>
                      {requires ? "Manual approval" : "Auto approval"}
                    </span>
                  </td>

                  <td>
                    <span className={`admin-pill ${isActive ? "ok" : "muted"}`}>
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td>
                    <div className="admin-row-actions">
                      <button
                        className="admin-action-btn neutral small"
                        onClick={() => openEdit(r)}
                        disabled={busy}
                        title="Edit institution"
                      >
                        Edit
                      </button>

                      <button
                        className="admin-action-btn neutral small"
                        onClick={() => navigate(`/dashboard/admin/institutions/${id}/users`)}
                        disabled={busy}
                        title="View institution users"
                      >
                        Users
                      </button>

                      <button
                        className={`admin-action-btn small ${isActive ? "warn" : "ok"}`}
                        onClick={() => toggleActive(r)}
                        disabled={busy}
                        title={isActive ? "Deactivate institution" : "Activate institution"}
                      >
                        {isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AdminPageFooter
        right={
          <span className="admin-footer-muted">
            Tip: Use “+ New” to create a record quickly.
          </span>
        }
      />

      {/* MODAL */}
      {open && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">
                  {editing ? "Edit Institution" : "Create Institution"}
                </h3>
                <div className="admin-modal-subtitle">
                  {modalLoading ? "Loading full record…" : "Update institution details."}
                </div>
              </div>

              {/* ✅ ALWAYS-VISIBLE X */}
              <button
                type="button"
                className="admin-modal-xbtn"
                onClick={closeModal}
                disabled={busy || policyBusy}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              {modalLoading && <div className="admin-inline-loading">Fetching details…</div>}

              {/* ✅ Policy section (UNCHANGED) */}
              {!!editing && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                  }}
                >
                  <div style={{ fontWeight: 950, marginBottom: 6 }}>
                    Access & Purchase Policy
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 12 }}>
                    Controls whether institution users can purchase documents individually when the
                    institution is inactive or subscription has expired.
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900 }}>
                        Individual purchases when institution is inactive
                      </div>

                      <div
                        className={`admin-pill ${
                          form.allowIndividualPurchasesWhenInstitutionInactive ? "ok" : "warn"
                        }`}
                        style={{ display: "inline-block", marginTop: 6 }}
                      >
                        {form.allowIndividualPurchasesWhenInstitutionInactive ? "Enabled" : "Disabled"}
                      </div>

                      <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                        {form.allowIndividualPurchasesWhenInstitutionInactive
                          ? "Institution users may buy books individually if their subscription is inactive."
                          : "Institution users cannot buy books individually when their subscription is inactive."}
                      </div>

                      {!canEditPolicy && (
                        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
                          🔒 Only Global Admin can change this policy.
                        </div>
                      )}
                    </div>

                    <div
                      className={[
                        "toggle",
                        form.allowIndividualPurchasesWhenInstitutionInactive ? "on" : "",
                        !canEditPolicy || policyBusy || modalLoading || busy ? "disabled" : "",
                      ].join(" ")}
                      onClick={() => {
                        if (!canEditPolicy || policyBusy || modalLoading || busy) return;
                        savePurchasePolicy(!form.allowIndividualPurchasesWhenInstitutionInactive);
                      }}
                      role="switch"
                      aria-checked={form.allowIndividualPurchasesWhenInstitutionInactive}
                      aria-disabled={!canEditPolicy}
                      title={
                        !canEditPolicy
                          ? "Only Global Admin can change"
                          : policyBusy
                          ? "Saving…"
                          : ""
                      }
                    />
                  </div>
                </div>
              )}

              <div className="admin-grid">
                <div className="admin-field">
                  <label>Name *</label>
                  <input value={form.name} onChange={(e) => setField("name", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Short name</label>
                  <input value={form.shortName} onChange={(e) => setField("shortName", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Email domain *</label>
                  <input
                    placeholder="example.com"
                    value={form.emailDomain}
                    onChange={(e) => setField("emailDomain", e.target.value)}
                  />
                </div>

                <div className="admin-field">
                  <label>Official email *</label>
                  <input
                    placeholder="info@example.com"
                    value={form.officialEmail}
                    onChange={(e) => setField("officialEmail", e.target.value)}
                  />
                </div>

                <div className="admin-field">
                  <label>Phone</label>
                  <input value={form.phoneNumber} onChange={(e) => setField("phoneNumber", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Alternate phone</label>
                  <input
                    value={form.alternatePhoneNumber}
                    onChange={(e) => setField("alternatePhoneNumber", e.target.value)}
                  />
                </div>

                <div className="admin-field">
                  <label>Address line 1</label>
                  <input value={form.addressLine1} onChange={(e) => setField("addressLine1", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Address line 2</label>
                  <input value={form.addressLine2} onChange={(e) => setField("addressLine2", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>City</label>
                  <input value={form.city} onChange={(e) => setField("city", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>State/Province</label>
                  <input value={form.stateOrProvince} onChange={(e) => setField("stateOrProvince", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Postal code</label>
                  <input value={form.postalCode} onChange={(e) => setField("postalCode", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Country</label>
                  <select value={form.countryId} onChange={(e) => setField("countryId", e.target.value)}>
                    <option value="">Select country (optional)</option>
                    {countries.map((c) => (
                      <option key={c.id ?? c.Id} value={c.id ?? c.Id}>
                        {c.name ?? c.Name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Registration number (locked)</label>
                  <input
                    value={form.registrationNumber || (isCreate ? "Auto-generated after save" : "")}
                    disabled
                    readOnly
                    style={{ opacity: 0.85 }}
                  />
                  <div className="admin-hint" style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                    Generated by the system and cannot be edited.
                  </div>
                </div>

                <div className="admin-field">
                  <label>Institution access code (locked)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={form.institutionAccessCode || (isCreate ? "Auto-generated after save" : "")}
                      disabled
                      readOnly
                      style={{ opacity: 0.85, flex: 1 }}
                    />
                    <button
                      className="admin-btn"
                      type="button"
                      disabled={!form.institutionAccessCode}
                      onClick={() => copyToClipboard(form.institutionAccessCode)}
                      title="Copy access code"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="admin-hint" style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                    This code is used by institution users to join. Keep it secure.
                  </div>
                </div>

                <div className="admin-field">
                  <label>Tax PIN</label>
                  <input value={form.taxPin} onChange={(e) => setField("taxPin", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Institution type</label>
                  <select
                    value={String(parseInstitutionType(form.institutionType))}
                    onChange={(e) => setField("institutionType", Number(e.target.value))}
                  >
                    <option value={1}>Academic</option>
                    <option value={2}>Corporate</option>
                    <option value={3}>Government</option>
                  </select>
                </div>

                <div className="admin-field">
                  <label>Requires user approval?</label>
                  <select
                    value={String(form.requiresUserApproval)}
                    onChange={(e) => setField("requiresUserApproval", e.target.value === "true")}
                  >
                    <option value="false">No (auto approve)</option>
                    <option value="true">Yes (manual approval)</option>
                  </select>
                </div>

                <div className="admin-field">
                  <label>Max student seats</label>
                  <input value={form.maxStudentSeats} onChange={(e) => setField("maxStudentSeats", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Max staff seats</label>
                  <input value={form.maxStaffSeats} onChange={(e) => setField("maxStaffSeats", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeModal} disabled={busy || policyBusy}>
                Cancel
              </button>
              <button className="admin-btn primary" onClick={save} disabled={busy || modalLoading || policyBusy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
