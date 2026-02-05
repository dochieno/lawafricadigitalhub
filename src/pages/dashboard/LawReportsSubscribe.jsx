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

function fmtDateShort(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(dt); // e.g. 12 Feb 2026
}

function billingLabel(period) {
  const s = String(period || "").toLowerCase();
  if (s.includes("month") || s === "1") return "Monthly";
  if (s.includes("annual") || s.includes("year") || s === "2") return "Annual";
  return period || "Plan";
}

function isActiveNow(sub, nowUtcMs) {
  if (!sub) return false;
  const status = String(sub.status || sub.Status || "").toLowerCase();
  if (status !== "active") return false;
  const start = new Date(sub.startDate || sub.StartDate).getTime();
  const end = new Date(sub.endDate || sub.EndDate).getTime();
  return start <= nowUtcMs && end >= nowUtcMs;
}

function daysRemaining(endDate, nowUtcMs) {
  const end = new Date(endDate).getTime();
  if (!Number.isFinite(end)) return 0;
  const diff = end - nowUtcMs;
  return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
}

// ----- small inline svg icons (no dependency) -----
function IRefresh() {
  return (
    <svg viewBox="0 0 24 24" className="lrsIco" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5a5 5 0 0 1-9.58 2H5.26A7 7 0 0 0 19 13c0-3.87-3.13-7-7-7Z"
      />
    </svg>
  );
}
function IBack() {
  return (
    <svg viewBox="0 0 24 24" className="lrsIco" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20 11H7.83l4.58-4.59L11 5l-7 7 7 7 1.41-1.41L7.83 13H20v-2Z"
      />
    </svg>
  );
}
function IMpesa() {
  return (
    <svg viewBox="0 0 24 24" className="lrsIco" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 18a1.25 1.25 0 1 0 0-2.5A1.25 1.25 0 0 0 12 20Zm-5-4h10V6H7v10Z"
      />
    </svg>
  );
}
function IPaystack() {
  return (
    <svg viewBox="0 0 24 24" className="lrsIco" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-11Zm2.2 1.3h11.6v2H6.2v-2Zm0 4h7.2v2H6.2v-2Z"
      />
    </svg>
  );
}
function ITrial() {
  return (
    <svg viewBox="0 0 24 24" className="lrsIco" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2 8.5 8.5 2 12l6.5 3.5L12 22l3.5-6.5L22 12l-6.5-3.5L12 2Zm0 6.2 1.5 2.8 2.8 1.5-2.8 1.5L12 16.8 10.5 14 7.7 12.5l2.8-1.5L12 8.2Z"
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

  // latest subscription per product
  const latestByProductId = useMemo(() => {
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

  function buildBadge(sub) {
    if (!sub) return { text: "Not subscribed", tone: "muted" };

    const active = isActiveNow(sub, nowUtcMs);
    const endTxt = fmtDateShort(sub.endDate || sub.EndDate);
    const isTrial = !!(sub.isTrial ?? sub.IsTrial);

    if (active) {
      const dr = daysRemaining(sub.endDate || sub.EndDate, nowUtcMs);
      if (isTrial && dr <= 7) {
        return {
          text: `Trial • ends ${endTxt} (${dr} day${dr === 1 ? "" : "s"})`,
          tone: "warn",
        };
      }
      return { text: `${isTrial ? "Trial" : "Active"} • ends ${endTxt}`, tone: "ok" };
    }

    return { text: `Expired • ended ${endTxt}`, tone: "muted" };
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

      // Optional: polling if you already have /payments/intent/{id}
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

  const audienceTxt = String(audience || "Public");

  return (
    <div className="lrsPage">
      {/* HERO CARD (match Trials styling) */}
      <div className="lrsHeroCard">
        <div className="lrsHeroTop">
          <div>
            <div className="lrsKicker">LAWAFRICA • SUBSCRIPTIONS</div>
            <h1 className="lrsTitle">Subscribe to Law Reports</h1>
            <p className="lrsSub">
              Choose a plan below. You can subscribe now or renew anytime.{" "}
              <span className="lrsDot">•</span> Audience: <b>{audienceTxt}</b>
            </p>
          </div>

          <div className="lrsHeroActions">
            <button className="lrsIconBtn" onClick={loadAll} disabled={loading} title="Refresh">
              <IRefresh />
              <span>Refresh</span>
            </button>

            <button
              className="lrsIconBtn lrsPrimaryBtn"
              onClick={() => nav("/dashboard/law-reports")}
              title="Back to Law Reports"
            >
              <IBack />
              <span>Back</span>
            </button>
          </div>
        </div>
      </div>

      {/* MPESA card */}
      <div className="lrsCard lrsPhoneCard">
        <div className="lrsCardHead">
          <div className="lrsCardTitleSm">MPESA phone number</div>
          <div className="lrsCardMeta">Used only when you click “Subscribe/Renew (MPESA)”.</div>
        </div>

        <div className="lrsPhoneRow">
          <input
            className="lrsInput"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 254712345678"
            inputMode="numeric"
            autoComplete="tel"
          />
        </div>
      </div>

      {error ? (
        <div className="lrsAlert lrsAlertErr">
          <div className="lrsAlertTitle">Action required</div>
          <div className="lrsAlertBody">{typeof error === "string" ? error : JSON.stringify(error)}</div>
        </div>
      ) : null}

      {notice ? (
        <div className="lrsAlert lrsAlertInfo">
          <div className="lrsAlertTitle">Update</div>
          <div className="lrsAlertBody">{notice}</div>
        </div>
      ) : null}

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
            const sub = latestByProductId.get(pid) || null;
            const badge = buildBadge(sub);
            const activeNow = sub ? isActiveNow(sub, nowUtcMs) : false;
            const isTrial = !!(sub?.isTrial ?? sub?.IsTrial);
            const dr = sub ? daysRemaining(sub.endDate || sub.EndDate, nowUtcMs) : 0;

            const ctaLabel = activeNow ? "Renew" : "Subscribe";

            return (
              <div className="lrsCard lrsProductCard" key={pid}>
                <div className="lrsProdTop">
                  <div className="lrsProdTitle">{name}</div>

                  <span className={`lrsBadge ${badge.tone}`} title="Your status for this product">
                    {badge.text}
                  </span>
                </div>

                {desc ? <div className="lrsProdDesc">{desc}</div> : null}

                {/* Trial expiry hint -> push user to subscribe */}
                {activeNow && isTrial ? (
                  <div className={`lrsHint ${dr <= 7 ? "warn" : "ok"}`}>
                    {dr <= 7 ? (
                      <>
                        Your trial is ending soon (<b>{dr}</b> day{dr === 1 ? "" : "s"}). Consider
                        subscribing to avoid losing access.
                      </>
                    ) : (
                      <>You’re currently on a trial. You can subscribe anytime.</>
                    )}
                  </div>
                ) : null}

                {/* Premium features (small) */}
                <div className="lrsFeatures">
                  <div className="lrsFeat">
                    <span className="lrsDotIcon" />
                    Full Law Reports library access
                  </div>
                  <div className="lrsFeat">
                    <span className="lrsDotIcon" />
                    Fast search + citations
                  </div>
                  <div className="lrsFeat">
                    <span className="lrsDotIcon" />
                    Reader highlights + notes
                  </div>
                </div>

                <div className="lrsSectionTitle">Plans</div>

                {plans.length === 0 ? (
                  <div className="lrsEmptyPlan">
                    <div className="lrsEmptyPlanTitle">No active plans available for this product.</div>
                    <div className="lrsEmptyPlanMeta">
                      This usually means your pricing “Effective To” date has passed for audience{" "}
                      <b>{audienceTxt}</b>. Update/extend the active ContentProductPrice in Admin.
                    </div>

                    <div className="lrsPlanActions">
                      <button
                        className="lrsIconBtn lrsGhostBtn"
                        onClick={() => nav(`/dashboard/trials?productId=${pid}`)}
                        title="Request trial (if eligible)"
                      >
                        <ITrial />
                        <span>Start trial</span>
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

                      return (
                        <div className="lrsPlan" key={planId}>
                          <div className="lrsPlanRow">
                            <div className="lrsPlanPeriod">{billingLabel(period)}</div>
                            <div className="lrsPlanPrice">{formatMoney(amount, currency)}</div>
                          </div>

                          <div className="lrsPlanActions">
                            <button
                              className="lrsIconBtn lrsGhostBtn"
                              disabled={busyKey === keyMpesa}
                              onClick={() => startMpesa(pl, p)}
                              title="Pay with MPESA (STK Push)"
                            >
                              <IMpesa />
                              <span>{busyKey === keyMpesa ? "Sending…" : `${ctaLabel} (MPESA)`}</span>
                            </button>

                            <button
                              className="lrsIconBtn lrsGhostBtn"
                              disabled={busyKey === keyPaystack}
                              onClick={() => startPaystack(pl, p)}
                              title="Pay with Paystack"
                            >
                              <IPaystack />
                              <span>{busyKey === keyPaystack ? "Opening…" : `${ctaLabel} (Paystack)`}</span>
                            </button>

                            <button
                              className="lrsIconBtn lrsDashedBtn"
                              onClick={() => nav(`/dashboard/trials?productId=${pid}`)}
                              title="Request trial (if eligible)"
                            >
                              <ITrial />
                              <span>Trial</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {plans.length > 0 ? (
                  <div className="lrsTip">Tip: Annual plans usually save more.</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
