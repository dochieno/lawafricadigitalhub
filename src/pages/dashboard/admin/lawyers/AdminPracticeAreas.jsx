import { useCallback, useEffect, useMemo, useState } from "react";
import "../../../../styles/explore.css";

import {
  adminListPracticeAreas,
  adminCreatePracticeArea,
  adminUpdatePracticeArea,
  adminDisablePracticeArea,
} from "../../../../api/adminLawyers";

function formatErr(e) {
  return e?.response?.data?.message || e?.message || "Something went wrong.";
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 760 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="modal-btn secondary" onClick={onClose}>Close</button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export default function AdminPracticeAreas() {
  const [q, setQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const filtered = useMemo(() => items, [items]);

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const list = await adminListPracticeAreas({
        q: q.trim(),
        includeInactive,
      });
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setErr(formatErr(e));
    } finally {
      setLoading(false);
    }
  }, [q, includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setSlug("");
    setIsActive(true);
    setSaveErr("");
    setOpen(true);
  }

  function openEdit(x) {
    setEditing(x);
    setName(x?.name || "");
    setSlug(x?.slug || "");
    setIsActive(!!x?.isActive);
    setSaveErr("");
    setOpen(true);
  }

  async function save() {
    setSaveErr("");
    const n = name.trim();
    if (!n) {
      setSaveErr("Name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = { name: n, slug: slug.trim() || null, isActive };
      if (editing?.id) {
        await adminUpdatePracticeArea(editing.id, payload);
      } else {
        await adminCreatePracticeArea(payload);
      }
      setOpen(false);
      await load();
    } catch (e) {
      setSaveErr(formatErr(e));
    } finally {
      setSaving(false);
    }
  }

  async function disable(id) {
    if (!window.confirm("Disable this practice area?")) return;
    try {
      await adminDisablePracticeArea(id);
      await load();
    } catch (e) {
      alert(formatErr(e));
    }
  }

  return (
    <div className="explore-container">
      <div className="explore-header">
        <div className="explore-titleRow">
          <div className="explore-brandTitle">
            <div className="explore-brandKicker">Admin</div>
            <h1 className="explore-title">
              Lawyer <span className="explore-titleAccent">Practice Areas</span>
            </h1>
            <p className="explore-subtitle">
              Curate the master list used by lawyers during profile setup and by clients during search.
            </p>
          </div>

<div className="explore-headerActions" style={{ gap: 10 }}>
  {/* Refresh: icon chip */}
  <button
    type="button"
    className="explore-btn explore-btn-hotOutline"
    onClick={load}
    disabled={loading}
    title="Refresh"
    aria-label="Refresh"
    style={{
      width: 44,
      height: 44,
      padding: 0,
      borderRadius: 14,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
      <IconRefresh />
        </button>

        {/* Add: icon chip (keeps maroon gradient) */}
        <button
            type="button"
            className="explore-cta-btn"
            onClick={openCreate}
            title="Add Practice Area"
            aria-label="Add Practice Area"
            style={{
            width: 56,
            height: 44,
            padding: 0,
            borderRadius: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 10px 26px rgba(15, 23, 42, 0.10)",
            }}
        >
            <IconPlus />
        </button>
        </div>
        </div>

        <div className="explore-chipsRow">
          <div className="explore-chips" style={{ alignItems: "center" }}>
            <input
              className="explore-sidebarSearch"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or slug..."
              style={{ width: 320 }}
            />
            <button className="explore-btn explore-btn-hotOutline" onClick={load} disabled={loading}>
              Search
            </button>

            <label className="explore-toggle" style={{ marginLeft: 10 }}>
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Include inactive
            </label>

            <span className="explore-resultsPill">{filtered.length} items</span>
          </div>
        </div>
      </div>

      {err ? <div className="explore-error" style={{ marginTop: 14 }}>{err}</div> : null}

      <div className="explore-empty" style={{ marginTop: 14 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(15,23,42,0.10)" }}>
                <th style={{ padding: 10 }}>Name</th>
                <th style={{ padding: 10 }}>Slug</th>
                <th style={{ padding: 10 }}>Status</th>
                <th style={{ padding: 10, width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ padding: 12, opacity: 0.7 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 12, opacity: 0.7 }}>No practice areas found.</td></tr>
              ) : (
                filtered.map((x) => (
                  <tr key={x.id} style={{ borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                    <td style={{ padding: 10, fontWeight: 800 }}>{x.name}</td>
                    <td style={{ padding: 10, opacity: 0.75 }}>{x.slug || "—"}</td>
                    <td style={{ padding: 10 }}>
                      {x.isActive ? <span className="badge premium">Active</span> : <span className="badge">Inactive</span>}
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button className="explore-btn explore-btn-hotOutline" onClick={() => openEdit(x)}>
                          Edit
                        </button>
                        {x.isActive ? (
                          <button className="explore-btn" onClick={() => disable(x.id)}>
                            Disable
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={open}
        title={editing ? "Edit Practice Area" : "Add Practice Area"}
        onClose={() => setOpen(false)}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div className="explore-filterSectionTitle">Name</div>
            <input className="explore-sidebarSearch" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div className="explore-filterSectionTitle">Slug (optional)</div>
            <input className="explore-sidebarSearch" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </label>

          <label className="explore-toggle">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>

          {saveErr ? <div style={{ color: "#b42318" }}>{saveErr}</div> : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button className="explore-btn" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
            <button className="explore-cta-btn" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}