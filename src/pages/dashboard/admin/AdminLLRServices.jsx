import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";

function getApiErrorMessage(err, fallback = "Request failed.") {
  const data = err?.response?.data;

  if (data && typeof data === "object") {
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;

    if (data.errors && typeof data.errors === "object") {
      const k = Object.keys(data.errors)[0];
      const arr = data.errors[k];
      if (Array.isArray(arr) && arr[0]) return `${k}: ${arr[0]}`;
      return "Validation failed.";
    }
  }

  if (typeof data === "string") return data;
  if (typeof err?.message === "string") return err.message;
  return fallback;
}

const DECISION_OPTIONS = [
  { label: "Judgment", value: 1 },
  { label: "Ruling", value: 2 },
];

const CASETYPE_OPTIONS = [
  { label: "Criminal", value: 1 },
  { label: "Civil", value: 2 },
  { label: "Environmental", value: 3 },
  { label: "Family", value: 4 },
  { label: "Commercial", value: 5 },
  { label: "Constitutional", value: 6 },
];

// Service options (enum int values) — still used in Create/Edit, just not shown as a column
const SERVICE_OPTIONS = [
  { label: "LawAfrica Law Reports (LLR)", value: 1 },
  { label: "Odungas Digest", value: 2 },
  { label: "Uganda Law Reports (ULR)", value: 3 },
  { label: "Tanzania Law Reports (TLR)", value: 4 },
  { label: "Southern Sudan Law Reports & Journal (SSLRJ)", value: 5 },
  { label: "East Africa Law Reports (EALR)", value: 6 },
  { label: "East Africa Court of Appeal Reports (EACA)", value: 7 },
  { label: "East Africa General Reports (EAGR)", value: 8 },
  { label: "East Africa Protectorate Law Reports (EAPLR)", value: 9 },
  { label: "Zanzibar Protectorate Law Reports (ZPLR)", value: 10 },
  { label: "Company Registry Search", value: 11 },
  { label: "Uganda Law Society Reports (ULSR)", value: 12 },
  { label: "Kenya Industrial Property Institute", value: 13 },
];

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function toIntOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function isoOrNullFromDateInput(yyyyMmDd) {
  const s = String(yyyyMmDd || "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function dateInputFromIso(iso) {
  if (!iso) return "";
  try {
    return String(iso).slice(0, 10);
  } catch {
    return "";
  }
}

const emptyForm = {
  countryId: "",
  service: 1,
  citation: "",
  reportNumber: "",
  year: "",
  caseNumber: "",
  decisionType: 1,
  caseType: 2,
  court: "",
  parties: "",
  judges: "",
  decisionDate: "",
  contentText: "",
};

function badgeLabel(map, v) {
  const hit = map.find((x) => x.value === toInt(v));
  return hit?.label || "—";
}

export default function AdminLLRServices() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [countries, setCountries] = useState([]); // {id, name}
  const [countryMap, setCountryMap] = useState(new Map());

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });

  const firstLoadRef = useRef(true);

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function resetForm() {
    setEditing(null);
    setForm({ ...emptyForm });
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
  }

  async function fetchCountries() {
    try {
      const res = await api.get("/country"); // CountryController [Route("api/[controller]")]
      const list = Array.isArray(res.data) ? res.data : [];
      setCountries(list);
      const m = new Map();
      for (const c of list) m.set(Number(c.id), c.name);
      setCountryMap(m);
    } catch {
      // keep silent; we can still use numeric id
      setCountries([]);
      setCountryMap(new Map());
    }
  }

  async function fetchList() {
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const res = await api.get("/law-reports/admin");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setRows([]);
      const msg = getApiErrorMessage(e, "Failed to load law reports.");
      // friendlier for 500
      setError(msg === "Internal server error" ? "Server error while loading reports. Check API logs for /api/law-reports/admin." : msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await fetchCountries();
      await fetchList();
      firstLoadRef.current = false;
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const title = String(r.title ?? "").toLowerCase();
      const reportNumber = String(r.reportNumber ?? "").toLowerCase();
      const year = String(r.year ?? "").toLowerCase();
      const citation = String(r.citation ?? "").toLowerCase();
      const parties = String(r.parties ?? "").toLowerCase();
      const court = String(r.court ?? "").toLowerCase();
      const caseNo = String(r.caseNumber ?? "").toLowerCase();
      const judges = String(r.judges ?? "").toLowerCase();

      const countryName = (countryMap.get(Number(r.countryId)) || "").toLowerCase();
      const serviceLabel = (SERVICE_OPTIONS.find((x) => x.value === toInt(r.service))?.label || "").toLowerCase();

      const meta = `${reportNumber} ${year} ${citation} ${parties} ${court} ${caseNo} ${judges} ${countryName} ${serviceLabel}`;
      return title.includes(s) || meta.includes(s);
    });
  }, [rows, q, countryMap]);

  function openCreate() {
    setError("");
    setInfo("");
    resetForm();
    setForm((p) => ({
      ...p,
      decisionType: 1,
      caseType: 2,
      service: 1,
      year: String(new Date().getUTCFullYear()),
      // country stays empty so user must pick
    }));
    setOpen(true);
  }

  async function openEdit(row) {
    setError("");
    setInfo("");
    setBusy(true);
    setOpen(true);
    setEditing(row);

    try {
      const res = await api.get(`/law-reports/${row.id}`);
      const d = res.data;

      setEditing(d);
      setForm({
        countryId: d.countryId ?? "",
        service: toInt(d.service, 1),
        citation: d.citation ?? "",
        reportNumber: d.reportNumber ?? "",
        year: d.year ?? "",
        caseNumber: d.caseNumber ?? "",
        decisionType: toInt(d.decisionType, 1),
        caseType: toInt(d.caseType, 2),
        court: d.court ?? "",
        parties: d.parties ?? "",
        judges: d.judges ?? "",
        decisionDate: dateInputFromIso(d.decisionDate),
        // keep content optional in modal (use Report Content page)
        contentText: d.contentText ?? "",
      });
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load report details."));
      closeModal();
    } finally {
      setBusy(false);
    }
  }

  function buildPayload() {
    return {
      // backend should force Category=LLRServices; we still send it for clarity
      category: 6,
      countryId: toIntOrNull(form.countryId) ?? 0,
      service: toInt(form.service, 1),

      citation: form.citation?.trim() || null,
      reportNumber: String(form.reportNumber || "").trim(),
      year: toIntOrNull(form.year) ?? new Date().getUTCFullYear(),
      caseNumber: form.caseNumber?.trim() || null,

      decisionType: toInt(form.decisionType, 1),
      caseType: toInt(form.caseType, 2),

      court: form.court?.trim() || null,
      parties: form.parties?.trim() || null,
      judges: form.judges?.trim() || null,
      decisionDate: isoOrNullFromDateInput(form.decisionDate),

      // We keep a minimal content requirement on create if your backend requires it.
      // If you later change backend to allow empty content on create, remove this.
      contentText: String(form.contentText ?? ""),
    };
  }

  function validate() {
    const countryId = toIntOrNull(form.countryId);
    if (!countryId || countryId <= 0) return "Country is required.";

    const service = toInt(form.service, 0);
    if (!service || service <= 0) return "Service is required.";

    if (!String(form.reportNumber || "").trim()) return "Report number is required (e.g. CAR353).";

    const year = toIntOrNull(form.year);
    if (!year || year < 1900 || year > 2100) return "Year must be between 1900 and 2100.";

    // Only enforce content if creating a new report
    if (!editing?.id && !String(form.contentText ?? "").trim()) return "Content text is required on Create.";

    return "";
  }

  async function save() {
    const msg = validate();
    if (msg) return setError(msg);

    setBusy(true);
    setError("");
    setInfo("");

    try {
      const payload = buildPayload();

      if (editing?.id) {
        await api.put(`/law-reports/${editing.id}`, payload);
        setInfo("Law report updated.");
      } else {
        const res = await api.post("/law-reports", payload);
        const newId = res.data?.id ?? null;
        setInfo(newId ? `Law report created (#${newId}).` : "Law report created.");
      }

      await fetchList();
      closeModal();
    } catch (e) {
      setError(getApiErrorMessage(e, "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    if (!row?.id) return;
    const ok = window.confirm(`Delete this report?\n\n${row.title || row.reportNumber || ""}`);
    if (!ok) return;

    setBusy(true);
    setError("");
    setInfo("");

    try {
      await api.delete(`/law-reports/${row.id}`);
      setInfo("Deleted.");
      await fetchList();
    } catch (e) {
      setError(getApiErrorMessage(e, "Delete failed."));
    } finally {
      setBusy(false);
    }
  }

  function openContent(row) {
    navigate(`/dashboard/admin/llr-services/${row.id}/content`, {
      state: { title: row.title || "" },
    });
  }

  return (
    <div className="admin-page admin-page-wide">
      <style>{`
        .admin-card-fill { border-radius: 18px; overflow:hidden; }
        .admin-table-wrap { max-height: 72vh; overflow:auto; border-radius: 18px; }
        .admin-table { font-size: 13px; }
        .admin-table thead th { position: sticky; top: 0; z-index: 2; background: #fafafa; }
        .row-zebra { background: #fafafa; }
        .row-hover:hover td { background: #fbfbff; }
        .num-cell { text-align:right; font-variant-numeric: tabular-nums; }
        .tight { white-space: nowrap; }
        .hint { color:#6b7280; font-size:12px; font-weight:700; }
        .titleCell { display:flex; flex-direction:column; gap:6px; }
        .titleMain { font-weight: 950; line-height: 1.2; }
        .titleSub { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .chip { display:inline-flex; align-items:center; padding: 4px 10px; border-radius: 999px; border:1px solid #e5e7eb; background:#fff; font-weight: 900; font-size: 11px; color:#374151; }
        .chip.soft { background:#f9fafb; }
        .chip.good { background:#ecfdf5; border-color:#a7f3d0; color:#065f46; }
        .chip.warn { background:#fff7ed; border-color:#fed7aa; color:#9a3412; }
        .actionsWrap { display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; }
        .admin-subtitle { max-width: 840px; }
      `}</style>

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · LLR Services (Reports)</h1>
          <p className="admin-subtitle">
            Create and manage law reports. Category is fixed to <b>LLR Services</b>. Use <b>Report Content</b> to edit the full formatted body.
          </p>
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={fetchList} disabled={busy || loading}>
            Refresh
          </button>

          <button className="admin-btn primary compact" onClick={openCreate} disabled={busy}>
            + New Report
          </button>
        </div>
      </div>

      {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error || info}</div>}

      <div className="admin-card admin-card-fill">
        <div className="admin-toolbar">
          <input
            className="admin-search admin-search-wide"
            placeholder="Search by title, report number, year, country, parties, citation, court..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="admin-pill muted">{loading ? "Loading…" : `${filtered.length} report(s)`}</div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: "34%" }}>Title</th>
                <th style={{ width: "10%" }}>Country</th>
                <th style={{ width: "10%" }}>Report No.</th>
                <th style={{ width: "6%" }} className="num-cell">Year</th>
                <th style={{ width: "10%" }}>Decision</th>
                <th style={{ width: "10%" }}>Case Type</th>
                <th style={{ width: "16%" }}>Parties</th>
                <th style={{ width: "8%" }} className="tight">Date</th>
                <th style={{ width: "16%", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ color: "#6b7280", padding: 14 }}>
                    No reports found. Click “+ New Report”.
                  </td>
                </tr>
              )}

              {filtered.map((r, idx) => {
                const decisionLabel = badgeLabel(DECISION_OPTIONS, r.decisionType);
                const caseLabel = badgeLabel(CASETYPE_OPTIONS, r.caseType);
                const serviceLabel = badgeLabel(SERVICE_OPTIONS, r.service);
                const countryName = countryMap.get(Number(r.countryId)) || (r.countryId ? `#${r.countryId}` : "—");

                return (
                  <tr key={r.id} className={`${idx % 2 === 1 ? "row-zebra" : ""} row-hover`}>
                    <td>
                      <div className="titleCell">
                        <div className="titleMain">{r.title || "—"}</div>
                        <div className="titleSub">
                          {/* Service moved from columns -> shown as a chip for quick context */}
                          <span className="chip soft">{serviceLabel}</span>
                          {r.citation ? <span className="chip">Citation</span> : null}
                        </div>
                      </div>
                    </td>

                    <td className="tight">{countryName}</td>
                    <td className="tight">{r.reportNumber || "—"}</td>
                    <td className="num-cell">{r.year ?? "—"}</td>

                    <td>
                      <span className={`chip ${toInt(r.decisionType) === 1 ? "good" : "warn"}`}>{decisionLabel}</span>
                    </td>

                    <td><span className="chip">{caseLabel}</span></td>

                    <td>{r.parties || "—"}</td>
                    <td className="tight">{r.decisionDate ? String(r.decisionDate).slice(0, 10) : "—"}</td>

                    <td>
                      <div className="actionsWrap">
                        <button className="admin-action-btn neutral small" onClick={() => openEdit(r)} disabled={busy}>
                          Edit
                        </button>

                        <button className="admin-action-btn small" onClick={() => openContent(r)} disabled={busy}>
                          Report Content
                        </button>

                        <button className="admin-action-btn danger small" onClick={() => remove(r)} disabled={busy}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================== CREATE/EDIT MODAL ===================== */}
      {open && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">{editing ? `Edit Report #${editing.id}` : "Create Law Report"}</h3>
                <div className="admin-modal-subtitle">
                  Save creates/updates the <b>LawReport</b> and its linked <b>LegalDocument</b>. Use <b>Report Content</b> for full formatted editing.
                </div>
              </div>

              <button className="admin-btn" onClick={closeModal} disabled={busy}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              <div className="admin-grid">
                <div className="admin-field">
                  <label>Country *</label>

                  {/* Better UX: dropdown if countries loaded, fallback to numeric input */}
                  {countries.length > 0 ? (
                    <select
                      value={String(form.countryId || "")}
                      onChange={(e) => setField("countryId", e.target.value)}
                      disabled={busy}
                    >
                      <option value="">Select country…</option>
                      {countries.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="1"
                        value={form.countryId}
                        onChange={(e) => setField("countryId", e.target.value)}
                        placeholder="CountryId (e.g. 1 = Kenya)"
                        disabled={busy}
                      />
                      <div className="hint">Tip: if dropdown is empty, ensure GET /api/country is accessible.</div>
                    </>
                  )}
                </div>

                <div className="admin-field">
                  <label>Service *</label>
                  <select value={String(form.service)} onChange={(e) => setField("service", toInt(e.target.value, 1))} disabled={busy}>
                    {SERVICE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Report Number *</label>
                  <input value={form.reportNumber} onChange={(e) => setField("reportNumber", e.target.value)} placeholder="e.g. CAR353" disabled={busy} />
                </div>

                <div className="admin-field">
                  <label>Year *</label>
                  <input type="number" min="1900" max="2100" value={form.year} onChange={(e) => setField("year", e.target.value)} placeholder="e.g. 2020" disabled={busy} />
                </div>

                <div className="admin-field">
                  <label>Case Number</label>
                  <input value={form.caseNumber} onChange={(e) => setField("caseNumber", e.target.value)} placeholder="e.g. Petition 12 of 2020" disabled={busy} />
                </div>

                <div className="admin-field">
                  <label>Citation</label>
                  <input value={form.citation} onChange={(e) => setField("citation", e.target.value)} placeholder="Optional (preferred if available)" disabled={busy} />
                </div>

                <div className="admin-field">
                  <label>Decision Type *</label>
                  <select value={String(form.decisionType)} onChange={(e) => setField("decisionType", toInt(e.target.value, 1))} disabled={busy}>
                    {DECISION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Case Type *</label>
                  <select value={String(form.caseType)} onChange={(e) => setField("caseType", toInt(e.target.value, 2))} disabled={busy}>
                    {CASETYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Court</label>
                  <input value={form.court} onChange={(e) => setField("court", e.target.value)} placeholder="e.g. Court of Appeal" disabled={busy} />
                </div>

                <div className="admin-field admin-span2">
                  <label>Parties</label>
                  <input value={form.parties} onChange={(e) => setField("parties", e.target.value)} placeholder="e.g. A v B" disabled={busy} />
                </div>

                <div className="admin-field admin-span2">
                  <label>Judges</label>
                  <textarea rows={2} value={form.judges} onChange={(e) => setField("judges", e.target.value)} placeholder="Separate by newline or semicolon" disabled={busy} />
                </div>

                <div className="admin-field">
                  <label>Decision Date</label>
                  <input type="date" value={form.decisionDate} onChange={(e) => setField("decisionDate", e.target.value)} disabled={busy} />
                </div>

                <div className="admin-field admin-span2">
                  <label>Content Text {editing?.id ? "(optional here)" : "*"} </label>
                  <textarea
                    rows={10}
                    value={form.contentText}
                    onChange={(e) => setField("contentText", e.target.value)}
                    placeholder={editing?.id ? "Optional: use Report Content for formatted editing." : "Required on Create: paste report body here (you can format later in Report Content)."}
                    disabled={busy}
                  />
                  <div className="hint">
                    Tip: For formatted content (bold, headings, links), click <b>Report Content</b> after saving.
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeModal} disabled={busy}>
                Cancel
              </button>

              <button className="admin-btn primary" onClick={save} disabled={busy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
