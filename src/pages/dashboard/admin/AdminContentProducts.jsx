// src/pages/dashboard/admin/AdminContentProducts.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css"; // keep for modal styles (adminUsers.css doesn’t define modals)
import "../../../styles/adminUsers.css"; // ✅ branded au-* UI
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
  if (model !== 2) return "au-badge-neutral";
  return isIncluded ? "au-badge-success" : "au-badge-warn";
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
  const pubModel = parseAccessModel(r.publicAccessModel ?? r.PublicAccessModel ?? r.accessModel ?? r.AccessModel, 1);

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

/* =========================
   Tiny icons (no deps)
========================= */
function ISearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 21l-4.3-4.3m1.3-5.4a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IRefresh({ spin = false } = {}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={spin ? "au-spin" : undefined}
    >
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

function Badge({ children, kind = "neutral", title }) {
  const cls =
    kind === "success"
      ? "au-badge au-badge-success"
      : kind === "warn"
      ? "au-badge au-badge-warn"
      : kind === "info"
      ? "au-badge au-badge-info"
      : kind === "danger"
      ? "au-badge au-badge-danger"
      : "au-badge au-badge-neutral";

  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

export default function AdminContentProducts() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");

  // au-toast feedback
  const [toast, setToast] = useState(null); // {type:"success"|"error", text:string}

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [modalLoading, setModalLoading] = useState(false);

  // document counts per productId
  // value can be: number | null (loading) | undefined (not requested yet) | "err" (failed)
  const [docCounts, setDocCounts] = useState({});

  // filters (UI only)
  const [audienceFilter, setAudienceFilter] = useState("all"); // all | institutions | public
  const [instModelFilter, setInstModelFilter] = useState("all"); // all | 1 | 2 | 0
  const [pubModelFilter, setPubModelFilter] = useState("all"); // all | 1 | 2 | 0

  function showError(msg) {
    setToast({ type: "error", text: msg });
    window.clearTimeout(showError._t);
    showError._t = window.setTimeout(() => setToast(null), 4500);
  }
  function showSuccess(msg) {
    setToast({ type: "success", text: msg });
    window.clearTimeout(showSuccess._t);
    showSuccess._t = window.setTimeout(() => setToast(null), 3200);
  }

  async function loadAll() {
    setToast(null);
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
      showError(toText(e?.response?.data || e?.message || "Failed to load content products."));
    } finally {
      setLoading(false);
    }
  }

  // background count fetcher (does not block main table)
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

    // ✅ FIX: map failures to the correct product id by index
    setDocCounts((prev) => {
      const next = { ...prev };
      settled.forEach((s, idx) => {
        const pid = productIds[idx];
        if (s.status === "fulfilled") next[s.value.id] = s.value.count;
        else if (pid != null) next[pid] = "err";
      });
      return next;
    });
  }

  // when rows change, fetch counts for visible products in background
  useEffect(() => {
    const ids = rows.map((r) => r.id ?? r.Id).filter((id) => id != null);
    const needs = ids.filter((id) => docCounts[id] == null);
    if (needs.length) loadDocCountsForProducts(needs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return rows
      .filter((r) => {
        const toInst = !!(r.availableToInstitutions ?? r.AvailableToInstitutions ?? false);
        const toPub = !!(r.availableToPublic ?? r.AvailableToPublic ?? false);

        if (audienceFilter === "institutions") return toInst;
        if (audienceFilter === "public") return toPub;
        return true;
      })
      .filter((r) => {
        const instModel = parseAccessModel(r.institutionAccessModel ?? r.InstitutionAccessModel, 2);
        const pubModel = parseAccessModel(r.publicAccessModel ?? r.PublicAccessModel ?? r.accessModel ?? r.AccessModel, 1);

        if (instModelFilter !== "all" && String(instModel) !== String(instModelFilter)) return false;
        if (pubModelFilter !== "all" && String(pubModel) !== String(pubModelFilter)) return false;
        return true;
      })
      .filter((r) => {
        if (!s) return true;

        const id = r.id ?? r.Id;
        const name = (r.name ?? r.Name ?? "").toLowerCase();
        const desc = (r.description ?? r.Description ?? "").toLowerCase();

        const instModel = accessModelLabel(r.institutionAccessModel ?? r.InstitutionAccessModel);
        const pubModel = accessModelLabel(r.publicAccessModel ?? r.PublicAccessModel ?? r.accessModel ?? r.AccessModel);

        const instBundle = bundleLabel(
          safeBool(r.includedInInstitutionBundle ?? r.IncludedInInstitutionBundle, true),
          r.institutionAccessModel ?? r.InstitutionAccessModel
        );

        const pubBundle = bundleLabel(
          safeBool(r.includedInPublicBundle ?? r.IncludedInPublicBundle, false),
          r.publicAccessModel ?? r.PublicAccessModel ?? r.accessModel ?? r.AccessModel
        );

        const docsCount = docCounts[id];
        const docsText = typeof docsCount === "number" ? String(docsCount) : "";

        const meta = `${instModel} ${pubModel} ${instBundle} ${pubBundle} ${docsText}`.toLowerCase();
        return name.includes(s) || desc.includes(s) || meta.includes(s);
      });
  }, [rows, q, docCounts, audienceFilter, instModelFilter, pubModelFilter]);

  const kpis = useMemo(() => {
    const total = filtered.length;

    let toInst = 0;
    let toPub = 0;
    let instSub = 0;
    let pubSub = 0;
    let instBundle = 0;
    let pubBundle = 0;

    let docsKnown = 0;
    let docsTotal = 0;

    for (const r of filtered) {
      const id = r.id ?? r.Id;

      const aInst = !!(r.availableToInstitutions ?? r.AvailableToInstitutions ?? false);
      const aPub = !!(r.availableToPublic ?? r.AvailableToPublic ?? false);

      if (aInst) toInst += 1;
      if (aPub) toPub += 1;

      const instModel = parseAccessModel(r.institutionAccessModel ?? r.InstitutionAccessModel, 2);
      const pubModel = parseAccessModel(r.publicAccessModel ?? r.PublicAccessModel ?? r.accessModel ?? r.AccessModel, 1);

      if (aInst && instModel === 2) instSub += 1;
      if (aPub && pubModel === 2) pubSub += 1;

      const instB = safeBool(r.includedInInstitutionBundle ?? r.IncludedInInstitutionBundle, true);
      const pubB = safeBool(r.includedInPublicBundle ?? r.IncludedInPublicBundle, false);

      if (aInst && instModel === 2 && instB) instBundle += 1;
      if (aPub && pubModel === 2 && pubB) pubBundle += 1;

      const c = docCounts[id];
      if (typeof c === "number") {
        docsKnown += 1;
        docsTotal += c;
      }
    }

    return {
      total,
      toInst,
      toPub,
      instSub,
      pubSub,
      instBundle,
      pubBundle,
      docsKnown,
      docsTotal,
    };
  }, [filtered, docCounts]);

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function openCreate() {
    setToast(null);
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  async function openEdit(row) {
    setToast(null);
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
      showError("Loaded partial record (details endpoint failed).");
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
    if (!form.name.trim()) return showError("Name is required.");

    setBusy(true);
    try {
      const payload = buildPayload();

      if (editing) {
        const id = editing.id ?? editing.Id;
        await api.put(`/content-products/${id}`, payload);
        showSuccess("Content product updated.");
      } else {
        await api.post("/content-products", payload);
        showSuccess("Content product created.");
      }

      closeModal();
      await loadAll();
    } catch (e) {
      showError(toText(e?.response?.data || e?.message || "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="au-wrap">
      {/* Toast */}
      {toast?.text ? (
        <div className={`toast ${toast.type === "error" ? "toast-error" : "toast-success"}`}>{toast.text}</div>
      ) : null}

      {/* HERO */}
      <div className="au-hero">
        <div className="au-titleRow">
          <div>
            <div className="au-kicker">LAWFRAICA • ADMIN</div>
            <h1 className="au-title">Content Products</h1>
            <p className="au-subtitle">
              Configure products for institutions vs public. Supports bundle vs separate subscriptions (Global Admin only).
            </p>
          </div>

          <div className="au-heroRight" style={{ gap: 10 }}>
            <button className="au-refresh" onClick={loadAll} disabled={busy || loading} title="Refresh">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IRefresh spin={loading} /> Refresh
              </span>
            </button>

            <button
              className="au-refresh"
              style={{
                background: "linear-gradient(180deg, rgba(139, 28, 28, 0.95) 0%, rgba(161, 31, 31, 0.95) 100%)",
                borderColor: "rgba(139, 28, 28, 0.35)",
              }}
              onClick={openCreate}
              disabled={busy}
              title="Create new product"
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IPlus /> New
              </span>
            </button>
          </div>
        </div>

        {/* TOPBAR */}
        <div className="au-topbar">
          <div className="au-search">
            <span className="au-searchIcon" aria-hidden="true">
              <ISearch />
            </span>
            <input
              placeholder="Search by name, description, model, bundle/separate…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={loading}
            />
            {q ? (
              <button className="au-clear" onClick={() => setQ("")} title="Clear">
                Clear
              </button>
            ) : null}
          </div>

          <div className="au-topbarRight">
            <div className="au-sort" title="These filters only affect the table UI">
              <span className="au-sortLabel">Audience</span>
              <select value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)} disabled={loading}>
                <option value="all">All</option>
                <option value="institutions">Institutions</option>
                <option value="public">Public</option>
              </select>
            </div>

            <div className="au-sort" title="Institution access model filter">
              <span className="au-sortLabel">Inst model</span>
              <select value={instModelFilter} onChange={(e) => setInstModelFilter(e.target.value)} disabled={loading}>
                <option value="all">All</option>
                <option value="2">Subscription</option>
                <option value="1">One-time</option>
                <option value="0">Unknown</option>
              </select>
            </div>

            <div className="au-sort" title="Public access model filter">
              <span className="au-sortLabel">Public model</span>
              <select value={pubModelFilter} onChange={(e) => setPubModelFilter(e.target.value)} disabled={loading}>
                <option value="all">All</option>
                <option value="2">Subscription</option>
                <option value="1">One-time</option>
                <option value="0">Unknown</option>
              </select>
            </div>
          </div>
        </div>

        {/* KPI CARDS */}
        <div className="au-kpis">
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Shown</div>
            <div className="au-kpiValue">{loading ? "…" : kpis.total}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">To institutions</div>
            <div className="au-kpiValue">{loading ? "…" : kpis.toInst}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">To public</div>
            <div className="au-kpiValue">{loading ? "…" : kpis.toPub}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Docs total (known)</div>
            <div className="au-kpiValue">{loading ? "…" : kpis.docsKnown ? kpis.docsTotal : "—"}</div>
          </div>
        </div>

        {/* CHIP FILTERS (quick presets) */}
        <div className="au-filters">
          <div className="au-filterGroup">
            <span className="au-filterLabel">Quick filters</span>
            <div className="au-chips">
              <button
                type="button"
                className={`au-chip ${audienceFilter === "all" ? "active" : ""}`}
                onClick={() => setAudienceFilter("all")}
                disabled={loading}
              >
                All
              </button>
              <button
                type="button"
                className={`au-chip ${audienceFilter === "institutions" ? "active" : ""}`}
                onClick={() => setAudienceFilter("institutions")}
                disabled={loading}
              >
                Institutions
              </button>
              <button
                type="button"
                className={`au-chip ${audienceFilter === "public" ? "active" : ""}`}
                onClick={() => setAudienceFilter("public")}
                disabled={loading}
              >
                Public
              </button>
            </div>
          </div>

          <div className="au-filterGroup">
            <span className="au-filterLabel">Reset</span>
            <div className="au-chips">
              <button
                type="button"
                className="au-chip"
                onClick={() => {
                  setQ("");
                  setAudienceFilter("all");
                  setInstModelFilter("all");
                  setPubModelFilter("all");
                }}
                disabled={loading}
              >
                Clear filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL + TABLE */}
      <div className="au-panel">
        <div className="au-panelTop">
          <div className="au-panelTitle">Product directory</div>
          <div className="au-pageMeta">{loading ? "Loading…" : `${filtered.length} record(s)`}</div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table">
            <thead>
              <tr>
                <th style={{ width: "22%" }}>Name</th>
                <th style={{ width: "26%" }}>Description</th>
                <th style={{ width: "7%" }}>Docs</th>
                <th style={{ width: "12%" }}>Institution</th>
                <th style={{ width: "12%" }}>Inst. Subscription</th>
                <th style={{ width: "12%" }}>Public</th>
                <th style={{ width: "12%" }}>Public Subscription</th>
                <th className="au-thRight" style={{ width: "17%" }}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="au-empty">No content products found for the current filters.</div>
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

                const c = docCounts[id];
                const countText = typeof c === "number" ? String(c) : c === "err" ? "—" : "…";

                return (
                  <tr key={id}>
                    <td>
                      <div className="au-userCell">
                        <span className={`au-dot ${toInst || toPub ? "on" : ""}`} />
                        <div className="au-userMeta">
                          <div className="au-userName">{name || "—"}</div>
                          <div className="au-userSub">
                            <span className="au-muted au-mono">#{id}</span>
                            <span className="au-sep">•</span>
                            <span className="au-muted">{toInst ? "Institutions" : "No institutions"}</span>
                            <span className="au-sep">•</span>
                            <span className="au-muted">{toPub ? "Public" : "No public"}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="au-muted">{desc || <span style={{ opacity: 0.6 }}>—</span>}</td>

                    <td>
                      <Badge kind={typeof c === "number" ? "info" : "neutral"} title="Assigned documents">
                        {countText}
                      </Badge>
                    </td>

                    <td>
                      {toInst ? (
                        <Badge kind={parseAccessModel(instModel, 2) === 2 ? "info" : "neutral"}>
                          {accessModelLabel(instModel)}
                        </Badge>
                      ) : (
                        <Badge> N/A </Badge>
                      )}
                    </td>

                    <td>
                      {toInst ? (
                        <span className={bundlePillClass(instBundle, instModel)} style={{ display: "inline-flex" }}>
                          <span className="au-badge" style={{ border: "none", background: "transparent", padding: 0 }}>
                            {bundleLabel(instBundle, instModel)}
                          </span>
                        </span>
                      ) : (
                        <Badge>—</Badge>
                      )}
                    </td>

                    <td>
                      {toPub ? (
                        <Badge kind={parseAccessModel(pubModel, 1) === 2 ? "info" : "neutral"}>
                          {accessModelLabel(pubModel)}
                        </Badge>
                      ) : (
                        <Badge> N/A </Badge>
                      )}
                    </td>

                    <td>
                      {toPub ? (
                        <span className={bundlePillClass(pubBundle, pubModel)} style={{ display: "inline-flex" }}>
                          <span className="au-badge" style={{ border: "none", background: "transparent", padding: 0 }}>
                            {bundleLabel(pubBundle, pubModel)}
                          </span>
                        </span>
                      ) : (
                        <Badge>—</Badge>
                      )}
                    </td>

                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        <button className="au-iconBtn au-iconBtn-neutral" onClick={() => openEdit(r)} disabled={busy}>
                          Edit
                        </button>

                        <button
                          className="au-iconBtn au-iconBtn-info"
                          onClick={() => navigate(`/dashboard/admin/content-products/${id}/documents`)}
                          disabled={busy}
                          title="Manage documents attached to this product"
                        >
                          Docs
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="au-panelBottom">
          <span className="au-pageMeta">
            Tip: “Included (Bundle)” means it’s covered by the institution’s all-access subscription. “Separate” means it
            needs its own subscription (e.g., Law Reports).
          </span>

          <span className="au-pageMeta">
            Docs counts load in the background (non-blocking).
          </span>
        </div>
      </div>

      <AdminPageFooter />

      {/* MODAL (kept adminCrud modal styles; just content stays the same) */}
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
                  <select value={String(!!form.availableToPublic)} onChange={(e) => setField("availableToPublic", e.target.value === "true")}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>

                <div className="admin-form-section">
                  <div className="admin-form-section-title">Institution rules</div>
                  <div className="admin-form-section-sub">Applies when the product is used under an institution account.</div>
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
