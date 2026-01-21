// src/pages/dashboard/admin/AdminInstitutions.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import AdminPageFooter from "../../../components/AdminPageFooter";
import { getAuthClaims } from "../../../auth/auth";

/* =========================
   Helpers
========================= */
function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if (v.message) return String(v.message);
    if (v.error) return String(v.error);
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

/** Friendly message for form validation / saves */
function friendlyApiError(e) {
  const status = e?.response?.status;
  const data = e?.response?.data;

  // ✅ Prefer clean API messages when backend returns { error } or { message }
  if (data && typeof data === "object") {
    if (typeof data.error === "string" && data.error.trim()) return data.error;
    if (typeof data.message === "string" && data.message.trim()) return data.message;
  }
  if (typeof data === "string" && data.trim()) return data;

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

/**
 * Friendly + consistent error object for all fetches/actions
 * (includes optional technical details for debugging).
 */
function toUiError(e, fallbackMessage = "Something went wrong.") {
  // Network / CORS / DNS: axios has no response
  if (e?.request && !e?.response) {
    return {
      title: "Connection problem",
      message: "We couldn’t reach the server. Check your internet connection and try again.",
      details: toText(e?.message || "No response from server."),
    };
  }

  const status = e?.response?.status;
  const data = e?.response?.data;

  // Auth
  if (status === 401) {
    return {
      title: "Session expired",
      message: "Please sign in again and retry.",
      details: toText(data || "401 Unauthorized"),
    };
  }
  if (status === 403) {
    return {
      title: "Not allowed",
      message: "You don’t have permission to perform this action.",
      details: toText(data || "403 Forbidden"),
    };
  }

  // Conflicts (e.g. duplicate domain/tax pin)
  if (status === 409) {
    return {
      title: "Already exists",
      message: friendlyApiError(e),
      details: toText(data),
    };
  }

  // Server error
  if (status >= 500) {
    return {
      title: "Server error",
      message:
        "The server ran into a problem while processing your request. Please try again shortly.",
      details: toText(data || e?.message || `HTTP ${status}`),
    };
  }

  // Validation / client error
  if (status === 400) {
    return {
      title: "Couldn’t save changes",
      message: friendlyApiError(e),
      details: toText(data),
    };
  }

  // Everything else
  return {
    title: "Something went wrong",
    message: toText(data || e?.message || fallbackMessage),
    details: toText(data || e?.message || fallbackMessage),
  };
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

/* =========================
   Tiny icons (no deps)
========================= */
function IconButton({ title, onClick, disabled, children, kind = "neutral" }) {
  const className = ["admin-action-btn", "neutral", "small", "admin-icon-btn"].join(" ");

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      data-kind={kind}
    >
      {children}
    </button>
  );
}

function IRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IPower() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6.38 6.38a9 9 0 1 0 11.24 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function ICopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 9h13v13H9V9z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M5 15H2V2h13v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* =========================
   Component
========================= */
export default function AdminInstitutions() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");

  // Rich error/info
  const [uiError, setUiError] = useState(null); // {title,message,details}
  const [info, setInfo] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [modalLoading, setModalLoading] = useState(false);

  const [countries, setCountries] = useState([]);
  const [policyBusy, setPolicyBusy] = useState(false);

  const canEditPolicy = isGlobalAdmin();

  async function loadAll() {
    setUiError(null);
    setInfo("");
    setLoading(true);
    try {
      const res = await api.get("/Institutions");
      const data = res.data?.data ?? res.data;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setUiError(toUiError(e, "Failed to load institutions."));
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
    setUiError(null);
    setInfo("");
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  async function openEdit(row) {
    setUiError(null);
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
      setInfo("Loaded basic institution data, but couldn’t fetch the full details.");
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
      maxStudentSeats: parseIntOrZero(form.maxStudentSeats),
      maxStaffSeats: parseIntOrZero(form.maxStaffSeats),
    };
  }

  async function save() {
    setUiError(null);
    setInfo("");

    if (!form.name.trim()) return setUiError({ title: "Missing information", message: "Name is required." });
    if (!form.emailDomain.trim()) return setUiError({ title: "Missing information", message: "Email domain is required." });
    if (!form.officialEmail.trim()) return setUiError({ title: "Missing information", message: "Official email is required." });

    setBusy(true);
    try {
      const payload = buildPayload();

      if (editing) {
        const id = editing.id ?? editing.Id;
        await api.put(`/Institutions/${id}`, payload);
        setInfo("Institution updated.");
      } else {
        await api.post("/Institutions", payload);
        setInfo("Institution created. A welcome email will be sent if email sending is enabled.");
      }

      closeModal();
      await loadAll();
    } catch (e) {
      setUiError(toUiError(e, "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row) {
    const id = row.id ?? row.Id;
    const isActive = row.isActive ?? row.IsActive ?? false;

    setUiError(null);
    setInfo("");
    setBusy(true);
    try {
      await api.post(`/Institutions/${id}/${isActive ? "deactivate" : "activate"}`);
      setInfo(isActive ? "Institution deactivated." : "Institution activated.");
      await loadAll();
    } catch (e) {
      setUiError(toUiError(e, "Failed to update status."));
    } finally {
      setBusy(false);
    }
  }

  async function copyToClipboard(text) {
    setUiError(null);
    try {
      await navigator.clipboard.writeText(String(text || ""));
      setInfo("Copied to clipboard.");
      setTimeout(() => setInfo(""), 1500);
    } catch {
      setUiError({
        title: "Copy failed",
        message: "Your browser blocked clipboard access. Please copy manually.",
      });
    }
  }

  async function savePurchasePolicy(nextValue) {
    if (!editing) return;
    if (!canEditPolicy) return;

    const id = editing.id ?? editing.Id;

    setUiError(null);
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
      setUiError(toUiError(e, "Failed to update purchase policy."));
    } finally {
      setPolicyBusy(false);
    }
  }

  const isCreate = !editing;

  return (
    <div className="admin-page admin-page-wide admin-institutions">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · Institutions</h1>
          <p className="admin-subtitle">Create, activate, and manage institutions (Global Admin only).</p>
        </div>

        {/* Compact header actions */}
        <div className="admin-actions">
          <IconButton title="Refresh list" onClick={loadAll} disabled={busy || loading}>
            <IRefresh />
          </IconButton>

          <button
            className="admin-btn primary compact admin-btn-icon"
            onClick={openCreate}
            disabled={busy}
            title="Create a new institution"
            type="button"
          >
            <IPlus /> <span>New</span>
          </button>
        </div>
      </div>

      {/* Clearer alert block */}
      {(uiError || info) && (
        <div className={`admin-alert ${uiError ? "error" : "ok"}`}>
          {uiError ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 900 }}>{uiError.title || "Error"}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{uiError.message}</div>

              {uiError.details && uiError.details !== uiError.message ? (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 800 }}>Show technical details</summary>
                  <pre
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 10,
                      background: "rgba(0,0,0,0.04)",
                      overflow: "auto",
                      maxHeight: 220,
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    {uiError.details}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : (
            info
          )}
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

          <div className="admin-pill muted">{loading ? "Loading…" : `${filtered.length} institution(s)`}</div>
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
                r.institutionType ?? r.InstitutionType ?? r.institutionTypeName ?? r.InstitutionTypeName ?? 1;

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
                    <span className={`admin-pill ${isActive ? "ok" : "muted"}`}>{isActive ? "Active" : "Inactive"}</span>
                  </td>

                  <td>
                      <div className="admin-row-actions actions-inline no-wrap">
                      <IconButton title="Edit institution" onClick={() => openEdit(r)} disabled={busy}>
                        <IEdit />
                      </IconButton>

                      <IconButton
                        title="View users"
                        onClick={() => navigate(`/dashboard/admin/institutions/${id}/users`)}
                        disabled={busy}
                      >
                        <IUsers />
                      </IconButton>

                      <IconButton
                        title={isActive ? "Deactivate institution" : "Activate institution"}
                        onClick={() => toggleActive(r)}
                        disabled={busy}
                        kind={isActive ? "danger" : "ok"}
                      >
                        <IPower />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AdminPageFooter right={<span className="admin-footer-muted">Tip: Use “New” to create a record quickly.</span>} />

      {/* MODAL */}
      {open && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">{editing ? "Edit Institution" : "Create Institution"}</h3>
                <div className="admin-modal-subtitle">
                  {modalLoading ? "Loading full record…" : "Update institution details."}
                </div>
              </div>

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

              {/* Policy section */}
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
                  <div style={{ fontWeight: 950, marginBottom: 6 }}>Access & Purchase Policy</div>
                  <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 12 }}>
                    Controls whether institution users can purchase documents individually when the institution is inactive
                    or subscription has expired.
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900 }}>Individual purchases when institution is inactive</div>

                      <div
                        className={`admin-pill ${form.allowIndividualPurchasesWhenInstitutionInactive ? "ok" : "warn"}`}
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
                        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>🔒 Only Global Admin can change this policy.</div>
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
                      title={!canEditPolicy ? "Only Global Admin can change" : policyBusy ? "Saving…" : ""}
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
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      value={form.institutionAccessCode || (isCreate ? "Auto-generated after save" : "")}
                      disabled
                      readOnly
                      style={{ opacity: 0.85, flex: 1 }}
                    />

                    <IconButton
                      title="Copy access code"
                      disabled={!form.institutionAccessCode}
                      onClick={() => copyToClipboard(form.institutionAccessCode)}
                    >
                      <ICopy />
                    </IconButton>
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
              <button className="admin-btn" onClick={closeModal} disabled={busy || policyBusy} type="button">
                Cancel
              </button>
              <button className="admin-btn primary" onClick={save} disabled={busy || modalLoading || policyBusy} type="button">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
