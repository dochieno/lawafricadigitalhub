// src/pages/dashboard/LawReportsSubscribe.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api/client";
import "../../styles/lawReportsSubscribe.css";

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

function billingLabel(period) {
  const s = String(period || "").toLowerCase();
  if (s.includes("month") || s === "1") return "Monthly";
  if (s.includes("annual") || s.includes("year") || s === "2") return "Annual";
  return period || "Plan";
}

function formatDatePretty(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // 31 Jan 2026
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

function isActiveNow(sub, nowUtcMs) {
  if (!sub) return false;
  const status = String(sub.status || sub.Status || "").toLowerCase();
  if (status !== "active") return false;
  const start = new Date(sub.startDate || sub.StartDate).getTime();
  const end = new Date(sub.endDate || sub.EndDate).getTime();
  return start <= nowUtcMs && end >= nowUtcMs;
}

function pickBestPlan(plans = []) {
  const annual = plans.find((p) =>
    String(p.billingPeriod || p.BillingPeriod).toLowerCase().includes("annual")
  );
  return annual || plans[0] || null;
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

  const nowUtcMs = useMemo(() => new Date(nowUtc || Date.now()).getTime(), [nowUtc]);

  const activeByProductId = useMemo(() => {
    const map = new Map();
    for (const s of mySubs || []) {
      const pid = s.contentProductId ?? s.ContentProductId;
      if (!pid) continue;

      const prev = map.get(pid);
      const end = new Date(s.endDate || s.EndDate || 0).getTime();
      const prevEnd = prev ? new Date(prev.endDate || prev.EndDate || 0).getTime() : -1;
      if (!prev || end > prevEnd) map.set(pid, s);
    }
    return map;
  }, [mySubs]);

  function subscriptionBadge(pid) {
    const s = activeByProductId.get(pid);
    if (!s) return null;

    const active = isActiveNow(s, nowUtcMs);
    const endPretty = formatDatePretty(s.endDate || s.EndDate);
    return active ? `Active • ends ${endPretty}` : `Expired • ended ${endPretty}`;
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
        `STK sent. Check your phone to complete payment for "${product?.name || product?.Name}".`
      );

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

      if (!url) {
        setError("Paystack did not return an authorization URL.");
        return;
      }

      setNotice(`Redirecting to Paystack for "${product?.name || product?.Name}"…`);
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

  return (
    <div className="lrsPage">
      {/* ✅ Header card (like Trials) */}
      <div className="lrsHero">
        <div className="lrsHeroLeft">
          <div className="lrsKicker">LAWAFRICA • SUBSCRIPTIONS</div>
          <div className="lrsHeroTitle">Subscribe to Law Reports</div>
          <div className="lrsHeroSub">
            Choose a plan below. You can subscribe now or renew anytime.
            <span className="lrsDot">•</span>
            Audience: <b>{audience}</b>
          </div>
        </div>

        <div className="lrsHeroActions">
          <button className="lrsBtn lrsBtnGhost" onClick={loadAll} disabled={loading}>
            Refresh
          </button>
          <button className="lrsBtn" onClick={() => nav("/dashboard/law-reports")}>
            Back to Law Reports
          </button>
        </div>
      </div>

      <div className="lrsPhoneCard">
        <div className="lrsPhoneTitle">MPESA phone number</div>
        <div className="lrsPhoneRow">
          <input
            className="lrsInput"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 254712345678"
            inputMode="numeric"
            autoComplete="tel"
          />
          <div className="lrsPhoneHint">Used only when you click “Subscribe/Renew (MPESA)”.</div>
        </div>
      </div>

      {error ? (
        <div className="lrsAlert lrsAlertErr">
          {typeof error === "string" ? error : JSON.stringify(error)}
        </div>
      ) : null}
      {notice ? <div className="lrsAlert lrsAlertInfo">{notice}</div> : null}

      {loading ? (
        <div className="lrsLoading">Loading plans…</div>
      ) : sortedProducts.length === 0 ? (
        <div className="lrsEmpty">No subscription products available right now.</div>
      ) : (
        <div className="lrsGrid">
          {sortedProducts.map((p) => {
            const pid = p.contentProductId ?? p.ContentProductId;
            const name = p.name ?? p.Name;
            const desc = p.description ?? p.Description;

            const plans = p.plans ?? p.Plans ?? [];
            const best = pickBestPlan(plans);

            const badge = subscriptionBadge(pid);
            const activeSub = activeByProductId.get(pid);
            const active = activeSub ? isActiveNow(activeSub, nowUtcMs) : false;

            return (
              <div className="lrsCard" key={pid}>
                <div className="lrsCardTop">
                  <div className="lrsCardTitle">{name}</div>

                  {badge ? (
                    <span className={`lrsBadge ${active ? "ok" : "muted"}`} title="Your status">
                      {badge}
                    </span>
                  ) : (
                    <span className="lrsBadge muted">Not subscribed</span>
                  )}
                </div>

                {desc ? <div className="lrsCardDesc">{desc}</div> : null}

                <div className="lrsSectionTitle">Plans</div>

                {plans.length === 0 ? (
                  <div className="lrsEmptyMini">
                    No active plans available for this product.
                    <div className="lrsEmptyMiniHint">
                      Admin: confirm there is an <b>active ContentProductPrice</b> for Audience <b>{audience}</b>.
                    </div>
                    <div className="lrsEmptyMiniActions">
                      <button
                        className="lrsBtn lrsBtnDashed"
                        onClick={() => nav(`/dashboard/trials?productId=${pid}`)}
                      >
                        Start trial
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="lrsPlanStack">
                    {plans.map((pl) => {
                      const planId = pl.contentProductPriceId ?? pl.ContentProductPriceId;
                      const period = pl.billingPeriod ?? pl.BillingPeriod;
                      const currency = pl.currency ?? pl.Currency ?? "KES";
                      const amount = pl.amount ?? pl.Amount;

                      const keyMpesa = `${planId}-mpesa`;
                      const keyPaystack = `${planId}-paystack`;

                      const primaryLabel = active ? "Renew" : "Subscribe";

                      return (
                        <div className="lrsPlan" key={planId}>
                          <div className="lrsPlanRow">
                            <div className="lrsPlanPeriod">{billingLabel(period)}</div>
                            <div className="lrsPlanPrice">{formatMoney(amount, currency)}</div>
                          </div>

                          <div className="lrsPlanActions">
                            <button
                              className="lrsBtn lrsBtnGhost"
                              disabled={busyKey === keyMpesa}
                              onClick={() => startMpesa(pl, p)}
                              title="Pay with MPESA (STK Push)"
                            >
                              {busyKey === keyMpesa
                                ? "Sending STK…"
                                : `${primaryLabel} (MPESA)`}
                            </button>

                            <button
                              className="lrsBtn lrsBtnGhost"
                              disabled={busyKey === keyPaystack}
                              onClick={() => startPaystack(pl, p)}
                              title="Pay with Paystack"
                            >
                              {busyKey === keyPaystack
                                ? "Opening Paystack…"
                                : `${primaryLabel} (Paystack)`}
                            </button>

                            <button
                              className="lrsBtn lrsBtnDashed"
                              onClick={() => nav(`/dashboard/trials?productId=${pid}`)}
                              title="Request trial (if eligible)"
                            >
                              Start trial
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {best ? <div className="lrsTip">Tip: Annual plans usually save more.</div> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
