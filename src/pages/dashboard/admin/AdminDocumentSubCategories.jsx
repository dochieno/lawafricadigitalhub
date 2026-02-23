// src/pages/dashboard/admin/AdminDocumentSubCategories.jsx
import { useEffect, useMemo, useState } from "react";
import {
  adminListDocCategories,
  adminListDocSubCategories,
  adminCreateDocSubCategory,
  adminUpdateDocSubCategory,
  adminDisableDocSubCategory,
} from "../../../api/legalDocumentTaxonomy";

function normalizeStr(v) {
  return String(v ?? "").trim();
}

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function AdminDocumentSubCategories() {
  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [categoryId, setCategoryId] = useState(5); // default Statutes (enum id 5)
  const [savingId, setSavingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [disablingId, setDisablingId] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // ✅ Only interested in Standard docs: hide report categories in selector by default.
  const [showReportCategories, setShowReportCategories] = useState(false);

  const [form, setForm] = useState({
    code: "",
    name: "",
    sortOrder: 0,
    isActive: true,
    countryId: "",
  });

  async function loadAll() {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const [catRes, subRes] = await Promise.all([
        adminListDocCategories(),
        adminListDocSubCategories({ categoryId }),
      ]);

      const items = (catRes?.items || []).map((x) => ({ ...x }));
      setCats(items);

      const subItems = (subRes?.items || []).map((x) => ({ ...x, _dirty: false }));
      setRows(subItems);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to load subcategories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  const visibleCats = useMemo(() => {
    if (showReportCategories) return cats;

    // hide report-focused categories by id (enum mapping)
    const HIDE_IDS = new Set([4, 6]); // LawReports=4, LLRServices=6
    return (cats || []).filter((x) => !HIDE_IDS.has(Number(x.id)));
  }, [cats, showReportCategories]);

  const selectedCategoryName = useMemo(() => {
    const c = (cats || []).find((x) => Number(x.id) === Number(categoryId));
    return c?.name || `Category #${categoryId}`;
  }, [cats, categoryId]);

  function updateRow(id, patch) {
    setRows((prev) =>
      prev.map((r) => (r.id !== id ? r : { ...r, ...patch, _dirty: true }))
    );
  }

  async function saveRow(r) {
    setError("");
    setInfo("");
    setSavingId(r.id);
    try {
      const payload = {
        categoryId: toInt(r.categoryId, categoryId),
        code: normalizeStr(r.code),
        name: normalizeStr(r.name),
        sortOrder: toInt(r.sortOrder, 0),
        isActive: !!r.isActive,
        countryId: r.countryId == null || r.countryId === "" ? null : toInt(r.countryId, null),
      };

      await adminUpdateDocSubCategory(r.id, payload);

      setRows((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, ...payload, _dirty: false } : x))
      );

      setInfo(`Saved subcategory #${r.id}.`);
      setTimeout(() => setInfo(""), 1500);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to save subcategory.");
    } finally {
      setSavingId(null);
    }
  }

  async function disableRow(id) {
    const ok = window.confirm("Disable this subcategory? It will remain in DB but become inactive.");
    if (!ok) return;

    setError("");
    setInfo("");
    setDisablingId(id);
    try {
      await adminDisableDocSubCategory(id);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isActive: false, _dirty: false } : r)));
      setInfo(`Disabled subcategory #${id}.`);
      setTimeout(() => setInfo(""), 1500);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to disable subcategory.");
    } finally {
      setDisablingId(null);
    }
  }

  async function create() {
    setError("");
    setInfo("");

    const payload = {
      categoryId: toInt(categoryId, 0),
      code: normalizeStr(form.code),
      name: normalizeStr(form.name),
      sortOrder: toInt(form.sortOrder, 0),
      isActive: !!form.isActive,
      countryId: normalizeStr(form.countryId) ? toInt(form.countryId, null) : null,
    };

    if (!payload.code || !payload.name) {
      setError("Code and Name are required.");
      return;
    }

    setCreating(true);
    try {
      await adminCreateDocSubCategory(payload);
      setForm({ code: "", name: "", sortOrder: 0, isActive: true, countryId: "" });
      await loadAll();
      setInfo("Subcategory created.");
      setTimeout(() => setInfo(""), 1500);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to create subcategory.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <h1>Document Subcategories</h1>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Document Subcategories</h1>
          <div style={{ opacity: 0.8 }}>
            Manage subcategories (primarily for Statutes). Default selector hides report categories.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={showReportCategories}
              onChange={(e) => setShowReportCategories(e.target.checked)}
            />
            <span>Show report categories</span>
          </label>

          <button type="button" className="btn" onClick={loadAll}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert-error" style={{ marginTop: 12 }}>
          {String(error)}
        </div>
      )}
      {info && (
        <div className="admin-alert admin-alert-info" style={{ marginTop: 12 }}>
          {String(info)}
        </div>
      )}

      {/* Category filter */}
      <div className="admin-card" style={{ marginTop: 14, padding: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ minWidth: 240 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Category</div>
            <select
              className="admin-select"
              value={String(categoryId)}
              onChange={(e) => setCategoryId(toInt(e.target.value, 5))}
              style={{ padding: "10px 12px", minWidth: 280 }}
            >
              {visibleCats.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} (#{c.id})
                </option>
              ))}
            </select>
          </div>

          <div style={{ opacity: 0.75 }}>
            Showing subcategories under: <b>{selectedCategoryName}</b>
          </div>
        </div>
      </div>

      {/* Create form */}
      <div className="admin-card" style={{ marginTop: 14, padding: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Create Subcategory</div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={lbl}>Code</div>
            <input
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              className="admin-input"
              placeholder="e.g. constitutional"
              style={inp}
            />
          </div>

          <div>
            <div style={lbl}>Name</div>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="admin-input"
              placeholder="e.g. Constitutional Statutes"
              style={inpWide}
            />
          </div>

          <div>
            <div style={lbl}>Sort</div>
            <input
              value={String(form.sortOrder)}
              onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
              className="admin-input"
              inputMode="numeric"
              style={inpSmall}
            />
          </div>

          <div>
            <div style={lbl}>CountryId (optional)</div>
            <input
              value={form.countryId}
              onChange={(e) => setForm((p) => ({ ...p, countryId: e.target.value }))}
              className="admin-input"
              inputMode="numeric"
              placeholder="e.g. 1"
              style={inpSmall}
            />
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={!!form.isActive}
              onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
            />
            <span>Active</span>
          </label>

          <button
            type="button"
            className="btn btn-primary"
            onClick={create}
            disabled={creating}
            style={{ minWidth: 140 }}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="admin-card" style={{ marginTop: 14, overflowX: "auto" }}>
        <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr>
              <th style={th}>Id</th>
              <th style={th}>Code</th>
              <th style={th}>Name</th>
              <th style={th}>Sort</th>
              <th style={th}>Active</th>
              <th style={th}>CountryId</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td style={td} colSpan={7}>
                  No subcategories for this category.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const busySave = savingId === r.id;
                const busyDisable = disablingId === r.id;

                return (
                  <tr key={r.id}>
                    <td style={tdMono}>{r.id}</td>

                    <td style={td}>
                      <input
                        value={r.code ?? ""}
                        onChange={(e) => updateRow(r.id, { code: e.target.value })}
                        className="admin-input"
                        style={inp}
                      />
                    </td>

                    <td style={td}>
                      <input
                        value={r.name ?? ""}
                        onChange={(e) => updateRow(r.id, { name: e.target.value })}
                        className="admin-input"
                        style={inpWide}
                      />
                    </td>

                    <td style={td}>
                      <input
                        value={String(r.sortOrder ?? 0)}
                        onChange={(e) => updateRow(r.id, { sortOrder: e.target.value })}
                        className="admin-input"
                        inputMode="numeric"
                        style={inpSmall}
                      />
                    </td>

                    <td style={tdCenter}>
                      <input
                        type="checkbox"
                        checked={!!r.isActive}
                        onChange={(e) => updateRow(r.id, { isActive: e.target.checked })}
                      />
                    </td>

                    <td style={td}>
                      <input
                        value={r.countryId == null ? "" : String(r.countryId)}
                        onChange={(e) => updateRow(r.id, { countryId: e.target.value })}
                        className="admin-input"
                        inputMode="numeric"
                        placeholder="(none)"
                        style={inpSmall}
                      />
                    </td>

                    <td style={td}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busySave || !r._dirty}
                          onClick={() => saveRow({ ...r, categoryId })}
                          title={!r._dirty ? "No changes" : "Save"}
                        >
                          {busySave ? "Saving…" : "Save"}
                        </button>

                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busyDisable || !r.isActive}
                          onClick={() => disableRow(r.id)}
                          title={!r.isActive ? "Already inactive" : "Disable"}
                        >
                          {busyDisable ? "Disabling…" : "Disable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ opacity: 0.75, marginTop: 10, lineHeight: 1.4 }}>
        <b>Note:</b> Disabling subcategories is safer than deleting because documents may already reference them.
      </div>
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "nowrap",
};

const td = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  verticalAlign: "middle",
};

const tdMono = {
  ...td,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

const tdCenter = {
  ...td,
  textAlign: "center",
};

const lbl = {
  fontSize: 12,
  opacity: 0.8,
  marginBottom: 6,
};

const inp = {
  width: "220px",
  padding: "8px 10px",
};

const inpWide = {
  width: "360px",
  padding: "8px 10px",
};

const inpSmall = {
  width: "90px",
  padding: "8px 10px",
};