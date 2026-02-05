// src/pages/dashboard/LawReportsSubscribe.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api/client";
import "../../styles/lawReportsSubscribe.css";
import { getToken } from "../../auth/auth";

/* =========================
   Formatting helpers
   ========================= */

function formatMoney(amount, currency = "KES") {
  const v = Number(amount || 0);
  if (!Number.isFinite(v)) return `${currency} 0`;
  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: currency || "KES",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${currency} ${Math.round(v)}`;
  }
}

/** ---------- Paystack context snapshot (for return page token restore) ---------- */
function ctxKey(ref) {
  return `la_paystack_ctx_${ref}`;
}

function writeCtx(ref, ctx) {
  try {
    if (!ref) return;
    localStorage.setItem(ctxKey(ref), JSON.stringify(ctx));
  } catch {
    // ignore
  }
}

function billingLabel(period) {
  const s = String(period || "").toLowerCase();
  if (s.includes("month") || s === "1") return "Monthly";
  if (s.includes("annual") || s.includes("year") || s === "2") return "Annual";
  return period || "Plan";
}

function normalizeBilling(period) {
  const s = String(period || "").toLowerCase();
  if (s.includes("month") || s === "1") return "monthly";
  if (s.includes("annual") || s.includes("year") || s === "2") return "annual";
  return "other";
}

function formatDateShort(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  // 31 Jan 2026
  const day = String(dt.getDate()).padStart(2, "0");
  const mon = dt.toLocaleString("en-GB", { month: "short" });
  const yr = dt.getFullYear();
  return `${day} ${mon} ${yr}`;
}

function isActiveNow(sub, nowUtcMs) {
  if (!sub) return false;
  const status = String(sub.status || sub.Status || "").toLowerCase();
  if (status !== "active") return false;
  const start = new Date(sub.startDate || sub.StartDate).getTime();
  const end = new Date(sub.endDate || sub.EndDate).getTime();
  return start <= nowUtcMs && end >= nowUtcMs;
}

function daysRemaining(sub, nowUtcMs) {
  if (!sub) return 0;
  const end = new Date(sub.endDate || sub.EndDate).getTime();
  if (!Number.isFinite(end)) return 0;
  if (end <= nowUtcMs) return 0;
  return Math.max(0, Math.ceil((end - nowUtcMs) / (1000 * 60 * 60 * 24)));
}

/* =========================
   Tiny SVG icons (no deps)
   ========================= */
function IconRefresh(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.45 5H17.3A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L14 10h6V4l-2.35 2.35z"
      />
    </svg>
  );
}

function IconBack(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
      />
    </svg>
  );
}

function IconPhone(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M17 1H7C5.9 1 5 1.9 5 3v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm0 18H7V5h10v14z"
      />
    </svg>
  );
}

function IconCard(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4H4V6h16v2z"
      />
    </svg>
  );
}

function IconSpark(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z"
      />
    </svg>
  );
}

function IconCheck(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"
      />
    </svg>
  );
}

export default function LawReportsSubscribe() {
  const nav = useNavigate();
  const loc = useLocation();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [audience, setAudience] = useState("Public");
  const [nowUtc, setNowUtc] = useState(null);

  const [mySubs, setMySubs] = useState([]);
  const [phone, setPhone] = useState("");
  const [busyKey, setBusyKey] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const productIdFocus = useMemo(() => {
    const sp = new URLSearchParams(loc.search);
    const v = sp.get("productId");
    const n = v ? Number(v) : null;
    return Number.isFinite(n) ? n : null;
  }, [loc.search]);

  async function loadAll() {
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const [prodRes, meRes] = await Promise.all([
        api.get("/subscriptions/products"),
        api.get("/subscriptions/me"),
      ]);

      const prod = prodRes?.data || {};
      setAudience(prod.audience || prod.Audience || "Public");
      setNowUtc(prod.nowUtc || prod.NowUtc || new Date().toISOString());
      setProducts(prod.products || prod.Products || []);

      const me = meRes?.data || {};
      setMySubs(me.items || me.Items || []);
    } catch (e) {
      console.error(e);
      setError(
        e?.response?.data?.message ||
          e?.response?.data ||
          e?.message ||
          "Failed to load subscription plans."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const nowUtcMs = useMemo(
    () => new Date(nowUtc || Date.now()).getTime(),
    [nowUtc]
  );

  // best subscription per product (latest end)
  const bestSubByProductId = useMemo(() => {
    const map = new Map();
    for (const s of mySubs || []) {
      const pid = s.contentProductId ?? s.ContentProductId;
      if (!pid) continue;

      const prev = map.get(pid);
      const end = new Date(s.endDate || s.EndDate || 0).getTime();
      const prevEnd = prev
        ? new Date(prev.endDate || prev.EndDate || 0).getTime()
        : -1;
      if (!prev || end > prevEnd) map.set(pid, s);
    }
    return map;
  }, [mySubs]);

  function statusBadgeText(pid) {
    const s = bestSubByProductId.get(pid);
    if (!s) return { kind: "none", text: "Not subscribed" };

    const active = isActiveNow(s, nowUtcMs);
    const isTrial = !!(s.isTrial ?? s.IsTrial);
    const end = formatDateShort(s.endDate || s.EndDate);
    const rem = daysRemaining(s, nowUtcMs);

    if (active) {
      if (isTrial)
        return {
          kind: "trial",
          text: `Trial • ends ${end}${rem ? ` (${rem} days)` : ""}`,
        };
      return {
        kind: "active",
        text: `Active • ends ${end}${rem ? ` (${rem} days)` : ""}`,
      };
    }
    return { kind: "expired", text: `Expired • ended ${end}` };
  }

  function expiringNudge(pid) {
    const s = bestSubByProductId.get(pid);
    if (!s) return null;

    const active = isActiveNow(s, nowUtcMs);
    if (!active) return null;

    const rem = daysRemaining(s, nowUtcMs);
    if (rem > 14) return null; // only nudge when within 2 weeks
    const isTrial = !!(s.isTrial ?? s.IsTrial);

    return {
      title: isTrial ? "Your trial is ending soon" : "Your subscription is ending soon",
      body: isTrial
        ? `Your trial expires in ${rem} day(s). Subscribe now to avoid losing access.`
        : `Your access expires in ${rem} day(s). Renew now to avoid interruption.`,
    };
  }

  async function startMpesa(plan, product) {
    setError(null);
    setNotice(null);

    if (!phone.trim()) {
      setError("Enter your phone number for MPESA (e.g., 2547XXXXXXXX).");
      return;
    }

    const planId = plan.contentProductPriceId || plan.ContentProductPriceId;
    const key = `${planId}-mpesa`;
    setBusyKey(key);

    try {
      const res = await api.post("/subscriptions/checkout", {
        provider: "Mpesa",
        contentProductPriceId: planId,
        phoneNumber: phone.trim(),
        clientReturnUrl: `${window.location.origin}/dashboard/law-reports`,
      });

      const data = res?.data || {};
      const paymentIntentId = data.paymentIntentId || data.PaymentIntentId;

      setNotice(
        `STK sent. Check your phone to complete payment for "${
          product?.name || product?.Name
        }".`
      );

      // optional polling
      if (paymentIntentId) {
        const start = Date.now();
        const timeoutMs = 90_000;
        const intervalMs = 2500;

        while (Date.now() - start < timeoutMs) {
          const intent = await api.get(`/payments/intent/${paymentIntentId}`);
          const it = intent?.data || {};
          const status = String(it.status || it.Status || "").toLowerCase();
          const finalized = !!(it.isFinalized ?? it.IsFinalized);

          if (status === "success" && finalized) {
            setNotice("Payment confirmed. Subscription activated.");
            await loadAll();
            nav("/dashboard/law-reports");
            return;
          }

          if (status === "failed") {
            setError("Payment failed or was cancelled. Please try again.");
            return;
          }

          await new Promise((r) => setTimeout(r, intervalMs));
        }

        setNotice(
          "We’re still waiting for confirmation. If you completed payment, refresh this page in a moment."
        );
      }
    } catch (e) {
      console.error(e);
      setError(
        e?.response?.data?.message ||
          e?.response?.data ||
          e?.message ||
          "MPESA checkout failed."
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function startPaystack(plan, product) {
    setError(null);
    setNotice(null);

    const planId = plan.contentProductPriceId || plan.ContentProductPriceId;
    const key = `${planId}-paystack`;
    setBusyKey(key);

    try {
      const clientReturnUrl = `${window.location.origin}/payments/paystack/return?next=${encodeURIComponent(
        "/dashboard/law-reports"
      )}`;

      const res = await api.post("/subscriptions/checkout", {
        provider: "Paystack",
        contentProductPriceId: planId,
        clientReturnUrl,
      });

      const data = res?.data || {};
      const url = data.authorizationUrl || data.AuthorizationUrl;
      const reference = data.reference || data.Reference || null;

      // ✅ CRITICAL: snapshot auth + next route under the Paystack reference
      // so PaystackReturn can restore token even if storage/cookies are lost.
      if (reference) {
        writeCtx(reference, {
          tokenSnapshot: getToken?.() || null,
          next: "/dashboard/law-reports",
          productName: product?.name || product?.Name || null,
          contentProductPriceId: planId,
          ts: Date.now(),
        });
      }

      if (!url) {
        setError("Paystack did not return an authorization URL.");
        return;
      }

      setNotice(
        `Redirecting to Paystack for "${product?.name || product?.Name}"…`
      );
      window.location.href = url;
    } catch (e) {
      console.error(e);
      setError(
        e?.response?.data?.message ||
          e?.response?.data ||
          e?.message ||
          "Paystack checkout failed."
      );
    } finally {
      setBusyKey(null);
    }
  }

  const sortedProducts = useMemo(() => {
    const list = [...(products || [])];
    if (productIdFocus) {
      list.sort((a, b) => {
        const aid = a.contentProductId ?? a.ContentProductId;
        const bid = b.contentProductId ?? b.ContentProductId;
        const aScore = aid === productIdFocus ? -1 : 0;
        const bScore = bid === productIdFocus ? -1 : 0;
        return aScore - bScore;
      });
    }
    return list;
  }, [products, productIdFocus]);

  function normalizePlans(plans) {
    const list = [...(plans || [])].filter(Boolean);

    // Keep only active-ish plans if the API ever returns mixed rows
    const activeOnly = list.filter(
      (p) => (p.isActive ?? p.IsActive ?? true) === true
    );

    // Sort: Monthly then Annual then others; within group low->high
    activeOnly.sort((a, b) => {
      const ga = normalizeBilling(a.billingPeriod ?? a.BillingPeriod);
      const gb = normalizeBilling(b.billingPeriod ?? b.BillingPeriod);
      const order = (g) => (g === "monthly" ? 0 : g === "annual" ? 1 : 2);
      const oa = order(ga);
      const ob = order(gb);
      if (oa !== ob) return oa - ob;
      const aa = Number(a.amount ?? a.Amount ?? 0);
      const bb = Number(b.amount ?? b.Amount ?? 0);
      return aa - bb;
    });

    return activeOnly;
  }

  return (
    <div className="lrs-page">
      {/* HERO / HEADER CARD */}
      <div className="lrs-heroCard">
        <div className="lrs-heroTop">
          <div>
            <div className="lrs-kicker">LawAfrica • Subscriptions</div>
            <h1 className="lrs-title">Subscribe to Law Reports</h1>
            <p className="lrs-sub">
              Choose a plan below. You can subscribe now or renew anytime.{" "}
              <span className="lrs-dot">•</span> Audience: <b>{audience}</b>
            </p>
          </div>

          <div className="lrs-heroActions">
            <button
              className="lrs-iconBtn"
              onClick={loadAll}
              disabled={loading}
              title="Refresh"
              type="button"
            >
              <IconRefresh className="lrs-ico" />
              <span>Refresh</span>
            </button>

            <button
              className="lrs-btnPrimary"
              onClick={() => nav("/dashboard/law-reports")}
              title="Back"
              type="button"
            >
              <IconBack className="lrs-ico" />
              <span>Back</span>
            </button>
          </div>
        </div>
      </div>

      {/* PHONE CARD */}
      <div className="lrs-card">
        <div className="lrs-rowTop">
          <div className="lrs-rowTitle">
            <span className="lrs-rowIcon">
              <IconPhone className="lrs-ico" />
            </span>
            MPESA phone number
          </div>
          <div className="lrs-rowHint">
            Used only when you click “Subscribe/Renew (MPESA)”.
          </div>
        </div>

        <input
          className="lrs-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. 254712345678"
          inputMode="numeric"
          autoComplete="tel"
        />
      </div>

      {error ? (
        <div className="lrs-alert lrs-alertErr">
          <div className="lrs-alertTitle">Something went wrong</div>
          <div className="lrs-alertBody">
            {typeof error === "string" ? error : JSON.stringify(error)}
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="lrs-alert lrs-alertOk">
          <div className="lrs-alertTitle">Update</div>
          <div className="lrs-alertBody">{notice}</div>
        </div>
      ) : null}

      {loading ? (
        <div className="lrs-loading">Loading plans…</div>
      ) : sortedProducts.length === 0 ? (
        <div className="lrs-empty">No subscription products available right now.</div>
      ) : (
        <div className="lrs-grid">
          {sortedProducts.map((p) => {
            const pid = p.contentProductId ?? p.ContentProductId;
            const name = p.name ?? p.Name;
            const desc = p.description ?? p.Description;

            const rawPlans = p.plans ?? p.Plans ?? [];
            const plans = normalizePlans(rawPlans);

            const badge = statusBadgeText(pid);
            const nudge = expiringNudge(pid);
            const activeSub = bestSubByProductId.get(pid);
            const activeNow = activeSub ? isActiveNow(activeSub, nowUtcMs) : false;
            const primaryLabel = activeNow ? "Renew" : "Subscribe";

            return (
              <div className="lrs-premiumCard" key={pid}>
                <div className="lrs-cardTop">
                  <div className="lrs-cardTitle">{name}</div>

                  <span
                    className={[
                      "lrs-badge",
                      badge.kind === "active" ? "ok" : "",
                      badge.kind === "trial" ? "trial" : "",
                      badge.kind === "expired" ? "muted" : "",
                      badge.kind === "none" ? "muted" : "",
                    ].join(" ")}
                    title="Your status for this product"
                  >
                    {badge.text}
                  </span>
                </div>

                {desc ? <div className="lrs-cardDesc">{desc}</div> : null}

                <ul className="lrs-features">
                  <li>
                    <IconCheck className="lrs-featIco" />
                    Full Law Reports library access
                  </li>
                  <li>
                    <IconCheck className="lrs-featIco" />
                    Fast search + citations
                  </li>
                  <li>
                    <IconCheck className="lrs-featIco" />
                    Reader highlights + notes
                  </li>
                </ul>

                {nudge ? (
                  <div className="lrs-nudge">
                    <div className="lrs-nudgeTitle">{nudge.title}</div>
                    <div className="lrs-nudgeBody">{nudge.body}</div>
                  </div>
                ) : null}

                <div className="lrs-sectionTitle">Plans</div>

                {plans.length === 0 ? (
                  <div className="lrs-emptyPlan">
                    <div className="lrs-emptyPlanTitle">
                      No active plans available for this product.
                    </div>
                    <div className="lrs-emptyPlanMeta">
                      Admin: confirm there is an active <b>ContentProductPrice</b>{" "}
                      for Audience <b>{audience}</b>.
                    </div>

                    <button
                      className="lrs-pillBtn"
                      onClick={() => nav(`/dashboard/trials?productId=${pid}`)}
                      title="Request trial (if eligible)"
                      type="button"
                    >
                      <IconSpark className="lrs-ico" />
                      Trial
                    </button>
                  </div>
                ) : (
                  <div className="lrs-planStack">
                    {plans.map((pl) => {
                      const planId = pl.contentProductPriceId ?? pl.ContentProductPriceId;
                      const period = pl.billingPeriod ?? pl.BillingPeriod;
                      const currency = pl.currency ?? pl.Currency ?? "KES";
                      const amount = pl.amount ?? pl.Amount;

                      const keyMpesa = `${planId}-mpesa`;
                      const keyPaystack = `${planId}-paystack`;

                      return (
                        <div className="lrs-plan" key={planId}>
                          <div className="lrs-planRow">
                            <div className="lrs-planLeft">
                              <div className="lrs-planPeriod">{billingLabel(period)}</div>
                              <div className="lrs-planMeta">
                                Billed {normalizeBilling(period) === "annual" ? "yearly" : "monthly"}
                              </div>
                            </div>

                            <div className="lrs-planPrice">{formatMoney(amount, currency)}</div>
                          </div>

                          <div className="lrs-planActions">
                            <button
                              className="lrs-actionBtn"
                              disabled={busyKey === keyMpesa}
                              onClick={() => startMpesa(pl, p)}
                              title="Pay with MPESA (STK Push)"
                              type="button"
                            >
                              <IconPhone className="lrs-ico" />
                              {busyKey === keyMpesa ? "Sending…" : `${primaryLabel} (MPESA)`}
                            </button>

                            <button
                              className="lrs-actionBtn"
                              disabled={busyKey === keyPaystack}
                              onClick={() => startPaystack(pl, p)}
                              title="Pay with Paystack"
                              type="button"
                            >
                              <IconCard className="lrs-ico" />
                              {busyKey === keyPaystack ? "Opening…" : `${primaryLabel} (Paystack)`}
                            </button>

                            <button
                              className="lrs-pillBtn"
                              onClick={() => nav(`/dashboard/trials?productId=${pid}`)}
                              title="Request trial (if eligible)"
                              type="button"
                            >
                              <IconSpark className="lrs-ico" />
                              Trial
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <div className="lrs-tip">Tip: Annual plans usually save more.</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
