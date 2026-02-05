// =======================================================
// FILE: src/pages/dashboard/admin/AdminContentProductPrices.jsx
// =======================================================
import { useEffect, useMemo, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminContentProductPrices.css";

const AUDIENCE = [
  { value: 1, label: "Public" },
  { value: 2, label: "Institution" },
];

const BILLING = [
  { value: 1, label: "Monthly" },
  { value: 2, label: "Annual" },
];

function toIsoLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromLocalInputToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function moneyFmt(amount, currency) {
  if (amount == null || amount === "") return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "KES",
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${Number(amount).toFixed(2)} ${currency || ""}`.trim();
  }
}

export default function AdminContentProductPrices() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState("");

  const [prices, setPrices] = useState([]);
  const [query, setQuery] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [billingFilter, setBillingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | inactive

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mode, setMode] = useState("create"); // create | edit
  const [saving, setSaving] = useState(false);

  const emptyForm = useMemo(
    () => ({
      id: null,
      contentProductId: "",
      audience: 1,
      billingPeriod: 1,
      currency: "KES",
      amount: "",
      isActive: true,
      effectiveFromUtc: "",
      effectiveToUtc: "",
    }),
    []
  );

  const [form, setForm] = useState(emptyForm);

  function setField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  // -----------------------------
  // Load products
  // -----------------------------
  useEffect(() => {
    let mounted = true;
    (async () => {
      setErr("");
      setLoading(true);
      try {
        // ✅ matches controller: GET /api/admin/content-products
        const res = await api.get("/api/admin/content-products");
        const list = Array.isArray(res?.data) ? res.data : [];
        const normalized = list.map((p) => ({
          id: p.id ?? p.Id,
          name: p.name ?? p.Name ?? `Product #${p.id ?? p.Id}`,
        }));

        if (mounted) {
          setProducts(normalized);
          if (!selectedProductId && normalized.length) {
            setSelectedProductId(String(normalized[0].id));
          }
        }
      } catch (e) {
        if (mounted) setErr(e?.response?.data?.message || e?.message || "Failed to load products.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------
  // Load prices for selected product
  // -----------------------------
  useEffect(() => {
    if (!selectedProductId) return;
    let mounted = true;

    (async () => {
      setErr("");
      setLoading(true);
      try {
        // ✅ matches controller: GET /api/admin/content-products/{id}/prices
        const res = await api.get(`/api/admin/content-products/${Number(selectedProductId)}/prices`);
        const list = Array.isArray(res?.data) ? res.data : [];
        const normalized = list.map((x) => ({
          id: x.id ?? x.Id,
          contentProductId: x.contentProductId ?? x.ContentProductId,
          audience: x.audience ?? x.Audience,
          billingPeriod: x.billingPeriod ?? x.BillingPeriod,
          currency: x.currency ?? x.Currency,
          amount: x.amount ?? x.Amount,
          isActive: x.isActive ?? x.IsActive,
          effectiveFromUtc: x.effectiveFromUtc ?? x.EffectiveFromUtc,
          effectiveToUtc: x.effectiveToUtc ?? x.EffectiveToUtc,
          createdAtUtc: x.createdAtUtc ?? x.CreatedAtUtc,
        }));

        if (mounted) setPrices(normalized);
      } catch (e) {
        if (mounted) setErr(e?.response?.data?.message || e?.message || "Failed to load prices.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedProductId]);

  const selectedName = useMemo(() => {
    const p = products.find((x) => String(x.id) === String(selectedProductId));
    return p?.name || "";
  }, [products, selectedProductId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return prices
      .filter((p) => {
        if (statusFilter === "active") return !!p.isActive;
        if (statusFilter === "inactive") return !p.isActive;
        return true;
      })
      .filter((p) => {
        if (audienceFilter === "all") return true;
        return String(p.audience) === String(audienceFilter);
      })
      .filter((p) => {
        if (billingFilter === "all") return true;
        return String(p.billingPeriod) === String(billingFilter);
      })
      .filter((p) => {
        if (!q) return true;
        const a = AUDIENCE.find((x) => x.value === p.audience)?.label?.toLowerCase() ?? "";
        const b = BILLING.find((x) => x.value === p.billingPeriod)?.label?.toLowerCase() ?? "";
        const c = (p.currency || "").toLowerCase();
        const amt = String(p.amount ?? "").toLowerCase();
        return [a, b, c, amt].some((s) => s.includes(q));
      })
      .sort((a, b) => (b.id || 0) - (a.id || 0));
  }, [prices, query, audienceFilter, billingFilter, statusFilter]);

  function openCreate() {
    setMode("create");
    setForm({
      ...emptyForm,
      contentProductId: selectedProductId ? Number(selectedProductId) : "",
    });
    setDrawerOpen(true);
  }

  function openEdit(row) {
    setMode("edit");
    setForm({
      id: row.id,
      contentProductId: row.contentProductId,
      audience: row.audience,
      billingPeriod: row.billingPeriod,
      currency: row.currency || "KES",
      amount: row.amount ?? "",
      isActive: !!row.isActive,
      effectiveFromUtc: toIsoLocalInput(row.effectiveFromUtc),
      effectiveToUtc: toIsoLocalInput(row.effectiveToUtc),
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setErr("");
  }

  function validateForm() {
    if (!form.contentProductId) return "Select a ContentProduct.";
    if (!form.currency || String(form.currency).trim().length < 3) return "Currency is required (e.g. KES).";

    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) return "Amount must be a positive number.";

    const fromIso = fromLocalInputToIso(form.effectiveFromUtc);
    const toIso = fromLocalInputToIso(form.effectiveToUtc);

    if (fromIso && toIso) {
      const a = new Date(fromIso).getTime();
      const b = new Date(toIso).getTime();
      if (a > b) return "EffectiveFrom must be before EffectiveTo.";
    }

    return null;
  }

  async function save() {
    setErr("");
    const v = validateForm();
    if (v) {
      setErr(v);
      return;
    }

    setSaving(true);
    try {
      const productId = Number(form.contentProductId);

      const payload = {
        audience: Number(form.audience),
        billingPeriod: Number(form.billingPeriod),
        currency: String(form.currency).trim().toUpperCase(),
        amount: Number(form.amount),
        isActive: !!form.isActive,
        effectiveFromUtc: fromLocalInputToIso(form.effectiveFromUtc),
        effectiveToUtc: fromLocalInputToIso(form.effectiveToUtc),
      };

      if (mode === "create") {
        // ✅ matches controller: POST /api/admin/content-products/{id}/prices
        const res = await api.post(`/api/admin/content-products/${productId}/prices`, payload);
        const created = res?.data;

        const row = {
          id: created.id ?? created.Id,
          contentProductId: created.contentProductId ?? created.ContentProductId ?? productId,
          audience: created.audience ?? created.Audience ?? payload.audience,
          billingPeriod: created.billingPeriod ?? created.BillingPeriod ?? payload.billingPeriod,
          currency: created.currency ?? created.Currency ?? payload.currency,
          amount: created.amount ?? created.Amount ?? payload.amount,
          isActive: created.isActive ?? created.IsActive ?? payload.isActive,
          effectiveFromUtc: created.effectiveFromUtc ?? created.EffectiveFromUtc ?? payload.effectiveFromUtc,
          effectiveToUtc: created.effectiveToUtc ?? created.EffectiveToUtc ?? payload.effectiveToUtc,
          createdAtUtc: created.createdAtUtc ?? created.CreatedAtUtc ?? new Date().toISOString(),
        };

        setPrices((prev) => [row, ...prev]);
      } else {
        // ✅ matches controller: PUT /api/admin/content-products/{id}/prices/{priceId}
        const priceId = Number(form.id);
        const res = await api.put(`/api/admin/content-products/${productId}/prices/${priceId}`, payload);
        const updated = res?.data;

        const nextRow = {
          id: updated.id ?? updated.Id ?? priceId,
          contentProductId: updated.contentProductId ?? updated.ContentProductId ?? productId,
          audience: updated.audience ?? updated.Audience ?? payload.audience,
          billingPeriod: updated.billingPeriod ?? updated.BillingPeriod ?? payload.billingPeriod,
          currency: updated.currency ?? updated.Currency ?? payload.currency,
          amount: updated.amount ?? updated.Amount ?? payload.amount,
          isActive: updated.isActive ?? updated.IsActive ?? payload.isActive,
          effectiveFromUtc: updated.effectiveFromUtc ?? updated.EffectiveFromUtc ?? payload.effectiveFromUtc,
          effectiveToUtc: updated.effectiveToUtc ?? updated.EffectiveToUtc ?? payload.effectiveToUtc,
          createdAtUtc: updated.createdAtUtc ?? updated.CreatedAtUtc,
        };

        setPrices((prev) => prev.map((p) => (p.id === priceId ? nextRow : p)));
      }

      closeDrawer();
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.response?.data ||
        e?.message ||
        "Save failed.";
      setErr(String(msg));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    setErr("");
    const next = !row.isActive;

    try {
      // ✅ matches controller: PATCH /api/admin/content-products/{id}/prices/{priceId}/active
      await api.patch(
        `/api/admin/content-products/${Number(selectedProductId)}/prices/${row.id}/active`,
        { isActive: next }
      );

      setPrices((prev) => prev.map((p) => (p.id === row.id ? { ...p, isActive: next } : p)));
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Failed to update status.");
    }
  }

  function removeRow(row) {
    // ✅ You don't have a DELETE endpoint in the controller yet.
    // For now we keep “delete” as “make inactive”.
    toggleActive({ ...row, isActive: true });
  }

  return (
    <section className="laAdminPrices">
      <div className="laAdminPricesHeader">
        <div>
          <div className="laAdminPricesTitle">Content Product Prices</div>
          <div className="laAdminPricesSub">
            Define subscription prices per <b>Public</b> vs <b>Institution</b>, and <b>Monthly</b> vs <b>Annual</b>.
          </div>
        </div>

        <div className="laAdminPricesHeaderRight">
          <button className="laBtn primary" onClick={openCreate} disabled={!selectedProductId}>
            + New Price Plan
          </button>
        </div>
      </div>

      {err ? (
        <div className="laAdminPricesAlert" role="alert">
          {String(err)}
        </div>
      ) : null}

      <div className="laAdminPricesToolbar">
        <div className="laAdminPricesToolbarLeft">
          <label className="laField">
            <span>Content Product</span>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              disabled={loading || products.length === 0}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="laField">
            <span>Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </label>

          <label className="laField">
            <span>Audience</span>
            <select value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)}>
              <option value="all">All</option>
              {AUDIENCE.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          <label className="laField">
            <span>Billing</span>
            <select value={billingFilter} onChange={(e) => setBillingFilter(e.target.value)}>
              <option value="all">All</option>
              {BILLING.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="laAdminPricesToolbarRight">
          <label className="laField search">
            <span>Search</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="KES, Monthly, 1000..." />
          </label>
        </div>
      </div>

      <div className="laAdminPricesCard">
        <div className="laAdminPricesCardHead">
          <div className="laAdminPricesCardTitle">{selectedName ? selectedName : "Prices"}</div>
          <div className="laAdminPricesCardMeta">{loading ? "Loading..." : `${filtered.length} plan(s)`}</div>
        </div>

        <div className="laAdminPricesTableWrap">
          <table className="laAdminPricesTable">
            <thead>
              <tr>
                <th>Status</th>
                <th>Audience</th>
                <th>Billing</th>
                <th>Currency</th>
                <th>Amount</th>
                <th>Effective From</th>
                <th>Effective To</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!filtered.length ? (
                <tr>
                  <td colSpan={8} className="empty">
                    No pricing plans found for this product.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className={`pill ${p.isActive ? "ok" : "off"}`}>{p.isActive ? "Active" : "Inactive"}</span>
                    </td>
                    <td>{AUDIENCE.find((x) => x.value === p.audience)?.label ?? p.audience}</td>
                    <td>{BILLING.find((x) => x.value === p.billingPeriod)?.label ?? p.billingPeriod}</td>
                    <td className="mono">{p.currency}</td>
                    <td className="amount">{moneyFmt(p.amount, p.currency)}</td>
                    <td className="mono">{p.effectiveFromUtc ? new Date(p.effectiveFromUtc).toLocaleString() : "—"}</td>
                    <td className="mono">{p.effectiveToUtc ? new Date(p.effectiveToUtc).toLocaleString() : "—"}</td>
                    <td className="actions">
                      <button className="laBtn ghost" onClick={() => openEdit(p)}>
                        Edit
                      </button>
                      <button className="laBtn ghost" onClick={() => toggleActive(p)}>
                        {p.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button className="laBtn danger ghost" onClick={() => removeRow(p)} title="No delete endpoint yet">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      <div className={`laDrawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="laDrawerBackdrop" onClick={closeDrawer} />
        <div className="laDrawerPanel" role="dialog" aria-modal="true" aria-label="Pricing plan editor">
          <div className="laDrawerHead">
            <div>
              <div className="laDrawerTitle">{mode === "create" ? "New Price Plan" : "Edit Price Plan"}</div>
              <div className="laDrawerSub">
                Product: <b>{selectedName || "—"}</b>
              </div>
            </div>
            <button className="laBtn ghost" onClick={closeDrawer}>
              Close
            </button>
          </div>

          {err ? (
            <div className="laAdminPricesAlert" role="alert">
              {String(err)}
            </div>
          ) : null}

          <div className="laDrawerBody">
            <div className="grid2">
              <label className="laField">
                <span>Audience</span>
                <select value={form.audience} onChange={(e) => setField("audience", Number(e.target.value))}>
                  {AUDIENCE.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="laField">
                <span>Billing Period</span>
                <select value={form.billingPeriod} onChange={(e) => setField("billingPeriod", Number(e.target.value))}>
                  {BILLING.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="laField">
                <span>Currency</span>
                <input value={form.currency} onChange={(e) => setField("currency", e.target.value)} placeholder="KES" />
              </label>

              <label className="laField">
                <span>Amount (major units)</span>
                <input
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  placeholder="1000.00"
                  inputMode="decimal"
                />
              </label>

              <label className="laField">
                <span>Effective From (optional)</span>
                <input
                  type="datetime-local"
                  value={form.effectiveFromUtc}
                  onChange={(e) => setField("effectiveFromUtc", e.target.value)}
                />
              </label>

              <label className="laField">
                <span>Effective To (optional)</span>
                <input
                  type="datetime-local"
                  value={form.effectiveToUtc}
                  onChange={(e) => setField("effectiveToUtc", e.target.value)}
                />
              </label>
            </div>

            <label className="laCheck">
              <input
                type="checkbox"
                checked={!!form.isActive}
                onChange={(e) => setField("isActive", e.target.checked)}
              />
              <span>Active (selectable by users)</span>
            </label>

            <div className="laHint">
              Tip: Keep older plans <b>inactive</b> instead of deleting, for audit consistency.
            </div>
          </div>

          <div className="laDrawerFoot">
            <button className="laBtn ghost" onClick={closeDrawer} disabled={saving}>
              Cancel
            </button>
            <button className="laBtn primary" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
