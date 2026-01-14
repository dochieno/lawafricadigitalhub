import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

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

/**
 * ✅ ProductAccessModel mapping (matches backend)
 * enum ProductAccessModel:
 * 0 = Unknown
 * 1 = OneTimePurchase
 * 2 = Subscription
 */
function parseAccessModel(v, fallback = 0) {
  if (v === 0) return 0;
  if (v == null || v === "") return fallback;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  const n = Number(s);
  if (!Number.isNaN(n)) return n;

  const lower = s.toLowerCase();
  if (lower.includes("onetime") || lower.includes("one_time") || lower.includes("one time")) return 1;
  if (lower.includes("subscription")) return 2;
  if (lower.includes("unknown")) return 0;

  return fallback;
}

function accessModelLabel(v) {
  const n = parseAccessModel(v, 0);
  if (n === 1) return "One-time purchase";
  if (n === 2) return "Subscription";
  if (n === 0) return "Unknown";
  return "—";
}

function bundleLabel(isIncluded, accessModel) {
  const model = parseAccessModel(accessModel, 0);
  if (model !== 2) return "—"; // only relevant for subscription
  return isIncluded ? "Included (Bundle)" : "Separate";
}

function bundlePillClass(isIncluded, accessModel) {
  const model = parseAccessModel(accessModel, 0);
  if (model !== 2) return "muted";
  return isIncluded ? "ok" : "warn";
}

const emptyForm = {
  name: "",
  description: "",

  // legacy (kept for backward compat; mirrors PublicAccessModel in backend)
  accessModel: 1,

  // ✅ audience-specific fields
  institutionAccessModel: 2, // default: Subscription
  publicAccessModel: 1, // default: OneTimePurchase
  includedInInstitutionBundle: true,
  includedInPublicBundle: false,

  availableToInstitutions: true,
  availableToPublic: true,
};

function mapRowToForm(row) {
  const r = row || {};

  const instModel = parseAccessModel(r.institutionAccessModel ?? r.InstitutionAccessModel, 2);
  const pubModel = parseAccessModel(
    r.publicAccessModel ?? r.PublicAccessModel ?? r.accessModel ?? r.AccessModel,
    1
  );

  return {
    name: r.name ?? r.Name ?? "",
    description: r.description ?? r.Description ?? "",

    // legacy mirrors public
    accessModel: parseAccessModel(r.accessModel ?? r.AccessModel ?? pubModel, pubModel),

    institutionAccessModel: instModel,
    publicAccessModel: pubModel,

    includedInInstitutionBundle: !!(r.includedInInstitutionBundle ?? r.IncludedInInstitutionBundle ?? true),
    includedInPublicBundle: !!(r.includedInPublicBundle ?? r.IncludedInPublicBundle ?? false),

    availableToInstitutions: !!(r.availableToInstitutions ?? r.AvailableToInstitutions ?? true),
    availableToPublic: !!(r.availableToPublic ?? r.AvailableToPublic ?? true),
  };
}

function safeBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  if (typeof v === "number") return v !== 0;
  return fallback;
}

export default function AdminContentProducts() {
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

  // ✅ NEW: document counts per productId
  // value can be: number | null (loading) | undefined (not requested yet) | "err" (failed)
  const [docCounts, setDocCounts] = useState({});

  async function loadAll() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await api.get("/content-products");
      const data = res.data?.data ?? res.data;
      const list = Array.isArray(data) ? data : [];
      setRows(list);

      // reset counts for current list (keeps UI predictable)
      const nextCounts = {};
      for (const r of list) {
        const id = r.id ?? r.Id;
        if (id != null) nextCounts[id] = null; // null = "loading"
      }
      setDocCounts(nextCounts);
    } catch (e) {
      setRows([]);
      setDocCounts({});
      setError(toText(e?.response?.data || e?.message || "Failed to load content products."));
    } finally {
      setLoading(false);
    }
  }

  // ✅ NEW: background count fetcher (does not block main table)
  async function loadDocCountsForProducts(productIds) {
    if (!productIds?.length) return;

    const settled = await Promise.allSettled(
      productIds.map(async (id) => {
        const res = await api.get(`/content-products/${id}/documents`);
        const data = res.data?.data ?? res.data;
        const count = Array.isArray(data) ? data.length : 0;
        return { id, count };
      })
    );

    setDocCounts((prev) => {
      const next = { ...prev };
      for (const s of settled) {
        if (s.status === "fulfilled") {
          next[s.value.id] = s.value.count;
        } else {
          // don't crash; show dash
          const idGuess = productIds[settled.indexOf(s)];
          if (idGuess != null) next[idGuess] = "err";
        }
      }
      return next;
    });
  }

  useEffect(() => {
    loadAll();
  }, []);

  // ✅ When rows change, fetch counts for visible products in background
  useEffect(() => {
    const ids = rows.map((r) => r.id ?? r.Id).filter((id) => id != null);
    const needs = ids.filter((id) => docCounts[id] == null);
    if (needs.length) loadDocCountsForProducts(needs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const id = r.id ?? r.Id;
      const name = (r.name ?? r.Name ?? "").toLowerCase();
      const desc = (r.description ?? r.Description ?? "").toLowerCase();

      const instModel = accessModelLabel(r.institutionAccessModel ?? r.InstitutionAccessModel);
      const pubModel = accessModelLabel(
        r.publicAccessModel ?? r.PublicAccessModel ?? r.accessModel ?? r.AccessModel
      );

      const instBundle = bundleLabel(
        safeBool(r.includedInInstitutionBundle ?? r.IncludedInInstitutionBundle, true),
        r.institutionAccessModel ?? r.InstitutionAccessModel
      );

      const pubBundle = bundleLabel(
        safeBool(r.includedInPublicBundle ?? r.IncludedInPublicBundle, false),
        r.publicAccessModel ?? r.PublicAccessModel ?? r.accessModel ?? r.AccessModel
      );

      const docsCount = docCounts[id];
      const docsText = typeof docsCount === "number" ? String(docsCount) : docsCount === "err" ? "" : "";

      const meta = `${instModel} ${pubModel} ${instBundle} ${pubBundle} ${docsText}`.toLowerCase();

      return name.includes(s) || desc.includes(s) || meta.includes(s);
    });
  }, [rows, q, docCounts]);

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

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

    setForm(mapRowToForm(row));

    setModalLoading(true);
    try {
      const id = row.id ?? row.Id;
      const res = await api.get(`/content-products/${id}`);
      const data = res.data?.data ?? res.data;
      setForm(mapRowToForm(data));
    } catch {
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

  function buildPayload() {
    const instModel = parseAccessModel(form.institutionAccessModel, 2);
    const pubModel = parseAccessModel(form.publicAccessModel, 1);

    return {
      name: form.name.trim(),
      description: form.description?.trim() || null,

      // legacy for older clients; backend treats as public model
      accessModel: pubModel,

      institutionAccessModel: instModel,
      publicAccessModel: pubModel,

      // Only meaningful if Subscription
      includedInInstitutionBundle: instModel === 2 ? !!form.includedInInstitutionBundle : false,
      includedInPublicBundle: pubModel === 2 ? !!form.includedInPublicBundle : false,

      availableToInstitutions: !!form.availableToInstitutions,
      availableToPublic: !!form.availableToPublic,
    };
  }

  async function save() {
    setError("");
    setInfo("");

    if (!form.name.trim()) return setError("Name is required.");

    setBusy(true);
    try {
      const payload = buildPayload();

      if (editing) {
        const id = editing.id ?? editing.Id;
        await api.put(`/content-products/${id}`, payload);
        setInfo("Content product updated.");
      } else {
        await api.post("/content-products", payload);
        setInfo("Content product created.");
      }

      closeModal();
      await loadAll();
    } catch (e) {
      setError(toText(e?.response?.data || e?.message || "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · Content Products</h1>
          <p className="admin-subtitle">
            Configure products for institutions vs public. Supports bundle vs separate subscriptions (Global Admin only).
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

      {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error ? error : info}</div>}

      <div className="admin-card admin-card-fill">
        <div className="admin-toolbar">
          <input
            className="admin-search admin-search-wide"
            placeholder="Search by name, description, model, bundle/separate…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <div className="admin-pill muted">{loading ? "Loading…" : `${filtered.length} product(s)`}</div>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>Name</th>
              <th style={{ width: "26%" }}>Description</th>
              <th style={{ width: "7%" }}>Docs</th>
              <th style={{ width: "12%" }}>Institution</th>
              <th style={{ width: "12%" }}>Inst. Subscription</th>
              <th style={{ width: "12%" }}>Public</th>
              <th style={{ width: "12%" }}>Public Subscription</th>
              <th style={{ textAlign: "right", width: "15%" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: "#6b7280", padding: "14px" }}>
                  No content products found.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const id = r.id ?? r.Id;
              const name = r.name ?? r.Name;
              const desc = r.description ?? r.Description;

              const instModel = r.institutionAccessModel ?? r.InstitutionAccessModel ?? 2;
              const pubModel = r.publicAccessModel ?? r.PublicAccessModel ?? r.accessModel ?? r.AccessModel ?? 1;

              const instBundle = safeBool(r.includedInInstitutionBundle ?? r.IncludedInInstitutionBundle, true);
              const pubBundle = safeBool(r.includedInPublicBundle ?? r.IncludedInPublicBundle, false);

              const toInst = r.availableToInstitutions ?? r.AvailableToInstitutions ?? false;
              const toPub = r.availableToPublic ?? r.AvailableToPublic ?? false;

              // docs count UI
              const c = docCounts[id];
              const countText = typeof c === "number" ? String(c) : c === "err" ? "—" : "…";

              return (
                <tr key={id}>
                  <td style={{ fontWeight: 900 }}>{name}</td>

                  <td style={{ color: "#374151" }}>{desc || <span style={{ color: "#9ca3af" }}>—</span>}</td>

                  <td>
                    <span className={`admin-pill ${typeof c === "number" ? "" : "muted"}`}>{countText}</span>
                  </td>

                  <td>
                    <span className={`admin-pill ${toInst ? "" : "muted"}`}>
                      {toInst ? accessModelLabel(instModel) : "N/A"}
                    </span>
                  </td>

                  <td>
                    <span className={`admin-pill ${toInst ? bundlePillClass(instBundle, instModel) : "muted"}`}>
                      {toInst ? bundleLabel(instBundle, instModel) : "—"}
                    </span>
                  </td>

                  <td>
                    <span className={`admin-pill ${toPub ? "" : "muted"}`}>{toPub ? accessModelLabel(pubModel) : "N/A"}</span>
                  </td>

                  <td>
                    <span className={`admin-pill ${toPub ? bundlePillClass(pubBundle, pubModel) : "muted"}`}>
                      {toPub ? bundleLabel(pubBundle, pubModel) : "—"}
                    </span>
                  </td>

                  <td>
                    <div className="admin-row-actions actions-inline" style={{ justifyContent: "flex-end", gap: 10 }}>
                      <button className="admin-action-btn neutral small" onClick={() => openEdit(r)} disabled={busy}>
                        Edit
                      </button>

                      <button
                        className="admin-action-btn neutral small"
                        onClick={() => navigate(`/dashboard/admin/content-products/${id}/documents`)}
                        disabled={busy}
                      >
                        Documents
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
            Tip: “Included (Bundle)” means it’s covered by the institution’s all-access subscription. “Separate” means it
            needs its own subscription (e.g., Law Reports).
          </span>
        }
      />

      {open && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">{editing ? "Edit Content Product" : "Create Content Product"}</h3>
                <div className="admin-modal-subtitle">
                  {modalLoading ? "Loading full record…" : "Set different access rules for institutions vs public."}
                </div>
              </div>

              {/* X close button */}
              <button className="admin-modal-xbtn" onClick={closeModal} disabled={busy} aria-label="Close">
                ×
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              {modalLoading && <div className="admin-inline-loading">Fetching details…</div>}

              <div className="admin-grid">
                <div className="admin-field admin-span2">
                  <label>Name *</label>
                  <input value={form.name} onChange={(e) => setField("name", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Available to institutions?</label>
                  <select
                    value={String(!!form.availableToInstitutions)}
                    onChange={(e) => setField("availableToInstitutions", e.target.value === "true")}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>

                <div className="admin-field">
                  <label>Available to public?</label>
                  <select
                    value={String(!!form.availableToPublic)}
                    onChange={(e) => setField("availableToPublic", e.target.value === "true")}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>

                {/* ✅ Section header: Institution rules */}
                <div className="admin-form-section">
                  <div className="admin-form-section-title">Institution rules</div>
                  <div className="admin-form-section-sub">
                    Applies when the product is used under an institution account.
                  </div>
                </div>

                <div className="admin-field">
                  <label>Institution access model</label>
                  <select
                    value={String(parseAccessModel(form.institutionAccessModel, 2))}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setField("institutionAccessModel", next);
                      if (next !== 2) setField("includedInInstitutionBundle", false);
                    }}
                    disabled={!form.availableToInstitutions}
                  >
                    <option value={0}>Unknown</option>
                    <option value={1}>One-time purchase</option>
                    <option value={2}>Subscription</option>
                  </select>
                </div>

                <div className="admin-field">
                  <label>Institution subscription mode</label>
                  <select
                    value={String(!!form.includedInInstitutionBundle)}
                    onChange={(e) => setField("includedInInstitutionBundle", e.target.value === "true")}
                    disabled={!form.availableToInstitutions || parseAccessModel(form.institutionAccessModel, 2) !== 2}
                    title="Only applies if Institution access model is Subscription"
                  >
                    <option value="true">Included (Bundle)</option>
                    <option value="false">Separate subscription</option>
                  </select>
                </div>

                {/* ✅ Section header: Public rules */}
                <div className="admin-form-section">
                  <div className="admin-form-section-title">Public rules</div>
                  <div className="admin-form-section-sub">
                    Applies when the product is used by individual/public users (non-institution).
                  </div>
                </div>

                <div className="admin-field">
                  <label>Public access model</label>
                  <select
                    value={String(parseAccessModel(form.publicAccessModel, 1))}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setField("publicAccessModel", next);
                      setField("accessModel", next);
                      if (next !== 2) setField("includedInPublicBundle", false);
                    }}
                    disabled={!form.availableToPublic}
                  >
                    <option value={0}>Unknown</option>
                    <option value={1}>One-time purchase</option>
                    <option value={2}>Subscription</option>
                  </select>
                </div>

                <div className="admin-field">
                  <label>Public subscription mode</label>
                  <select
                    value={String(!!form.includedInPublicBundle)}
                    onChange={(e) => setField("includedInPublicBundle", e.target.value === "true")}
                    disabled={!form.availableToPublic || parseAccessModel(form.publicAccessModel, 1) !== 2}
                    title="Only applies if Public access model is Subscription"
                  >
                    <option value="true">Included (Bundle)</option>
                    <option value="false">Separate subscription</option>
                  </select>
                </div>

                <div className="admin-field admin-span2">
                  <label>Description</label>
                  <textarea rows={4} value={form.description} onChange={(e) => setField("description", e.target.value)} />
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
