// src/pages/dashboard/admin/AdminDocumentCategories.jsx
import { useEffect, useMemo, useState } from "react";
import {
  adminListDocCategories,
  adminUpdateDocCategory,
} from "../../../api/legalDocumentTaxonomy";

function normalizeStr(v) {
  return String(v ?? "").trim();
}

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function AdminDocumentCategories() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // ✅ We’re only interested in Standard documents, not reports.
  // By default hide known report-related categories (LawReports=4, LLRServices=6).
  // You can toggle to show them if needed.
  const [showReportCategories, setShowReportCategories] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const res = await adminListDocCategories();
      const items = res?.items || [];
      setRows(items.map((x) => ({ ...x, _dirty: false })));
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to load categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visibleRows = useMemo(() => {
    const all = rows || [];
    if (showReportCategories) return all;

    // hide report-focused categories by id (enum mapping)
    const HIDE_IDS = new Set([4, 6]); // LawReports=4, LLRServices=6
    return all.filter((x) => !HIDE_IDS.has(Number(x.id)));
  }, [rows, showReportCategories]);

  function updateRow(id, patch) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return { ...r, ...patch, _dirty: true };
      })
    );
  }

  async function saveRow(row) {
    setError("");
    setInfo("");
    setSavingId(row.id);
    try {
      const payload = {
        code: normalizeStr(row.code),
        name: normalizeStr(row.name),
        description: normalizeStr(row.description) || null,
        sortOrder: toInt(row.sortOrder, 0),
        isActive: !!row.isActive,
      };

      await adminUpdateDocCategory(row.id, payload);

      // mark clean
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, ...payload, _dirty: false } : r))
      );

      setInfo(`Saved category #${row.id}.`);
      setTimeout(() => setInfo(""), 1500);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to save category.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <h1>Document Categories</h1>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Document Categories</h1>
          <div style={{ opacity: 0.8 }}>
            Edit Category Meta (safe; enum-backed). Default view hides report categories.
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

          <button type="button" className="btn" onClick={load} disabled={loading}>
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

      <div className="admin-card" style={{ marginTop: 14, overflowX: "auto" }}>
        <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={th}>Id</th>
              <th style={th}>Code</th>
              <th style={th}>Name</th>
              <th style={th}>Description</th>
              <th style={th}>Sort</th>
              <th style={th}>Active</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td style={td} colSpan={7}>
                  No categories found.
                </td>
              </tr>
            ) : (
              visibleRows.map((r) => {
                const busy = savingId === r.id;
                return (
                  <tr key={r.id}>
                    <td style={tdMono}>{r.id}</td>

                    <td style={td}>
                      <input
                        value={r.code ?? ""}
                        onChange={(e) => updateRow(r.id, { code: e.target.value })}
                        className="admin-input"
                        placeholder="e.g. statutes"
                        style={inp}
                      />
                    </td>

                    <td style={td}>
                      <input
                        value={r.name ?? ""}
                        onChange={(e) => updateRow(r.id, { name: e.target.value })}
                        className="admin-input"
                        placeholder="e.g. Statutes"
                        style={inp}
                      />
                    </td>

                    <td style={td}>
                      <input
                        value={r.description ?? ""}
                        onChange={(e) => updateRow(r.id, { description: e.target.value })}
                        className="admin-input"
                        placeholder="Optional"
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
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy || !r._dirty}
                        onClick={() => saveRow(r)}
                        title={!r._dirty ? "No changes" : "Save"}
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ opacity: 0.75, marginTop: 10, lineHeight: 1.4 }}>
        <b>Note:</b> Category Meta rows map 1:1 to your enum values. We only edit metadata (code/name/sort/active).
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