// src/pages/dashboard/AdminInstitutions.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";

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
  taxPin: "",
  institutionType: 1,
  requiresUserApproval: false,
  maxStudentSeats: "",
  maxStaffSeats: "",
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
  };
}

export default function AdminInstitutions() {
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

  async function loadAll() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      // ✅ matches controller: GET /api/Institutions?q=
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
      const domain = (r.emailDomain ?? r.EmailDomain ?? "").toLowerCase(); // keep searchable
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

    // show partial immediately
    setForm(mapInstitutionToForm(row));

    // fetch full record
    setModalLoading(true);
    try {
      const id = row.id ?? row.Id;
      const res = await api.get(`/Institutions/${id}`);
      const data = res.data?.data ?? res.data;
      setForm(mapInstitutionToForm(data));
    } catch (e) {
      setInfo("Loaded partial record (details endpoint failed).");
    } finally {
      setModalLoading(false);
    }
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
    setModalLoading(false);
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
      registrationNumber: form.registrationNumber.trim() || null,
      taxPin: form.taxPin.trim() || null,
      institutionType: parseInstitutionType(form.institutionType),
      requiresUserApproval: !!form.requiresUserApproval,
      maxStudentSeats: form.maxStudentSeats ? Number(form.maxStudentSeats) : null,
      maxStaffSeats: form.maxStaffSeats ? Number(form.maxStaffSeats) : null,
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
        // ✅ controller expects UpdateInstitutionRequest directly (no wrapper)
        await api.put(`/Institutions/${id}`, payload);
        setInfo("Institution updated.");
      } else {
        // ✅ controller expects CreateInstitutionRequest directly (no wrapper)
        await api.post("/Institutions", payload);
        setInfo("Institution created.");
      }

      closeModal();
      await loadAll();
    } catch (e) {
      setError(toText(e?.response?.data || e?.message || "Save failed."));
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
      // ✅ matches controller: POST /api/Institutions/{id}/activate|deactivate
      await api.post(`/Institutions/${id}/${isActive ? "deactivate" : "activate"}`);
      setInfo(isActive ? "Institution deactivated." : "Institution activated.");
      await loadAll();
    } catch (e) {
      setError(toText(e?.response?.data || e?.message || "Failed to update status."));
    } finally {
      setBusy(false);
    }
  }

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
        <div className={`admin-alert ${error ? "error" : "ok"}`}>{error ? error : info}</div>
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

      {/* MODAL */}
      {open && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">
                  {editing ? "Edit Institution" : "Create Institution"}
                </h3>
                <div className="admin-modal-subtitle">
                  {modalLoading ? "Loading full record…" : "Update institution details."}
                </div>
              </div>

              <button className="admin-btn" onClick={closeModal} disabled={busy}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              {modalLoading && <div className="admin-inline-loading">Fetching details…</div>}

              <div className="admin-grid">
                <div className="admin-field">
                  <label>Name *</label>
                  <input value={form.name} onChange={(e) => setField("name", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Short name</label>
                  <input
                    value={form.shortName}
                    onChange={(e) => setField("shortName", e.target.value)}
                  />
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
                  <input
                    value={form.phoneNumber}
                    onChange={(e) => setField("phoneNumber", e.target.value)}
                  />
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
                  <input
                    value={form.addressLine1}
                    onChange={(e) => setField("addressLine1", e.target.value)}
                  />
                </div>

                <div className="admin-field">
                  <label>Address line 2</label>
                  <input
                    value={form.addressLine2}
                    onChange={(e) => setField("addressLine2", e.target.value)}
                  />
                </div>

                <div className="admin-field">
                  <label>City</label>
                  <input value={form.city} onChange={(e) => setField("city", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>State/Province</label>
                  <input
                    value={form.stateOrProvince}
                    onChange={(e) => setField("stateOrProvince", e.target.value)}
                  />
                </div>

                <div className="admin-field">
                  <label>Postal code</label>
                  <input
                    value={form.postalCode}
                    onChange={(e) => setField("postalCode", e.target.value)}
                  />
                </div>

                <div className="admin-field">
                  <label>Country</label>
                  <select
                    value={form.countryId}
                    onChange={(e) => setField("countryId", e.target.value)}
                  >
                    <option value="">Select country (optional)</option>
                    {countries.map((c) => (
                      <option key={c.id ?? c.Id} value={c.id ?? c.Id}>
                        {c.name ?? c.Name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Registration number</label>
                  <input
                    value={form.registrationNumber}
                    onChange={(e) => setField("registrationNumber", e.target.value)}
                  />
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
                  <input
                    value={form.maxStudentSeats}
                    onChange={(e) => setField("maxStudentSeats", e.target.value)}
                  />
                </div>

                <div className="admin-field">
                  <label>Max staff seats</label>
                  <input
                    value={form.maxStaffSeats}
                    onChange={(e) => setField("maxStaffSeats", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeModal} disabled={busy}>
                Cancel
              </button>
              <button className="admin-btn primary" onClick={save} disabled={busy || modalLoading}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
