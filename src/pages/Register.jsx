// src/pages/Register.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../api/client.js";
import "../styles/register.css";

const SIGNUP_FEE_KES = 10;

// Backend expects enum names for PaymentPurpose (string) unless you mapped numeric.
const PAYMENT_PURPOSE_PUBLIC_SIGNUP = "PublicSignupFee";

const USER_TYPES = [
  { value: "Public", label: "Individual (Public)", sub: "Pay once, access free content and your purchases" },
  { value: "Institution", label: "Institution User", sub: "Use your institution email & reference number" },
];

const INSTITUTION_MEMBER_TYPES = [
  { value: "Student", label: "Student", sub: "Learner / enrollee" },
  { value: "Staff", label: "Staff", sub: "Employee / lecturer" },
];

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);

  if (typeof v === "object") {
    if (v.message) return String(v.message);
    if (v.title) return String(v.title);

    if (v.errors && typeof v.errors === "object") {
      const lines = [];
      for (const key of Object.keys(v.errors)) {
        const arr = v.errors[key];
        if (Array.isArray(arr)) {
          for (const msg of arr) lines.push(`${key}: ${msg}`);
        } else if (arr != null) {
          lines.push(`${key}: ${String(arr)}`);
        }
      }
      if (lines.length) return lines.join("\n");
    }

    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return "An unexpected error occurred.";
    }
  }

  return String(v);
}

function extractAxiosError(e) {
  const data = e?.response?.data;

  if (!data) return e?.message || "Request failed.";

  if (typeof data === "object" && data.errors) {
    const title = data.title || "One or more validation errors occurred.";
    return `${title}\n${toText(data)}`;
  }

  if (typeof data === "object" && data.message) return data.message;

  return data?.message || data || e?.message || "Request failed.";
}

// localStorage keys for returning from Paystack
const LS_REG_INTENT = "la_reg_intent_id";
const LS_REG_EMAIL = "la_reg_email";

// ✅ NEW: store creds across Paystack redirect so TwoFactorSetup works
const LS_REG_USERNAME = "la_reg_username";
const LS_REG_PASSWORD = "la_reg_password";

export default function Register() {
  const nav = useNavigate();
  const location = useLocation();

  // -----------------------------
  // Form state
  // -----------------------------
  const [userType, setUserType] = useState("Public");
  const isPublic = useMemo(() => userType === "Public", [userType]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  const [phoneNumber, setPhoneNumber] = useState("");

  // Countries
  const [countries, setCountries] = useState([]);
  const [countryId, setCountryId] = useState("");

  const [referenceNumber, setReferenceNumber] = useState("");

  // Institution fields (hidden for Public)
  const [institutionId, setInstitutionId] = useState("");
  const [institutionAccessCode, setInstitutionAccessCode] = useState("");

  const [institutionMemberType, setInstitutionMemberType] = useState("Student");

  const [institutions, setInstitutions] = useState([]);
  const [institutionsLoadFailed, setInstitutionsLoadFailed] = useState(false);

  const selectedInstitution = useMemo(() => {
    if (!institutionId) return null;
    return institutions.find((i) => String(i.id) === String(institutionId)) || null;
  }, [institutionId, institutions]);

  // Password
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Inline field errors
  const [fieldErrors, setFieldErrors] = useState({});

  // Flow state
  const [intentId, setIntentId] = useState(null);
  const [nextAction, setNextAction] = useState(null);
  const [paymentInfo, setPaymentInfo] = useState(null);

  // Payment method (Public only)
  const [publicPayMethod, setPublicPayMethod] = useState("MPESA"); // MPESA | PAYSTACK

  // Waiting / polling
  const [waitingPayment, setWaitingPayment] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const pollRef = useRef(null);

  // Completion UX
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // General UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const lockForm = waitingPayment || loading;

  // -----------------------------
  // Load countries
  // -----------------------------
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/Country");
        const raw = res.data?.data ?? res.data;

        const list = Array.isArray(raw) ? raw : [];
        const normalized = list
          .map((c) => ({
            id: c.id ?? c.Id,
            name: c.name ?? c.Name,
          }))
          .filter((c) => c.id != null && c.name);

        setCountries(normalized);

        if (!countryId && normalized.length === 1) {
          setCountryId(String(normalized[0].id));
        }
      } catch {
        setCountries([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------
  // Load institutions (PUBLIC)
  // -----------------------------
  useEffect(() => {
    (async () => {
      try {
        setInstitutionsLoadFailed(false);

        const candidates = ["/institutions/public", "/public/institutions", "/institutions?public=true"];

        let data = null;

        for (const url of candidates) {
          try {
            const res = await api.get(url);
            data = res.data?.data ?? res.data;
            if (Array.isArray(data)) break;
          } catch {
            // try next
          }
        }

        if (!Array.isArray(data)) {
          setInstitutions([]);
          setInstitutionsLoadFailed(true);
          return;
        }

        const normalized = data
          .map((i) => ({
            id: i.id ?? i.Id,
            name: i.name ?? i.Name,
            emailDomain: i.emailDomain ?? i.EmailDomain,
            isActive: i.isActive ?? i.IsActive,
            accessCodeRequired: i.accessCodeRequired ?? i.AccessCodeRequired,
          }))
          .filter((x) => x.id != null && x.name);

        setInstitutions(normalized);
      } catch {
        setInstitutions([]);
        setInstitutionsLoadFailed(true);
      }
    })();
  }, []);

  // If user selects Public, clear institution fields
  useEffect(() => {
    if (isPublic) {
      setInstitutionId("");
      setInstitutionAccessCode("");
      setInstitutionMemberType("Student");
    }
  }, [isPublic]);

  // -----------------------------
  // Validation helpers
  // -----------------------------
  function setFieldError(name, message) {
    setFieldErrors((prev) => ({ ...prev, [name]: message }));
  }

  function clearFieldError(name) {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function validateField(name, value) {
    const v = (value ?? "").toString();

    if (name === "firstName") {
      if (!v.trim()) return "First name is required.";
    }
    if (name === "lastName") {
      if (!v.trim()) return "Last name is required.";
    }
    if (name === "username") {
      if (!v.trim()) return "Username is required.";
      if (v.trim().length < 3) return "Username must be at least 3 characters.";
    }
    if (name === "email") {
      if (!v.trim()) return "Email is required.";
      if (!isEmail(v.trim())) return "Enter a valid email address.";

      if (!isPublic && selectedInstitution?.emailDomain) {
        const emailDomain = v.trim().split("@").pop()?.toLowerCase();
        const instDomain = String(selectedInstitution.emailDomain).toLowerCase();
        if (emailDomain && instDomain && emailDomain !== instDomain) {
          return `Email must use your institution domain: @${instDomain}`;
        }
      }
    }
    if (name === "phoneNumber") {
      // MPesa needs phone. Paystack doesn't.
      if (isPublic && publicPayMethod === "MPESA" && !v.trim())
        return "Phone number is required for Mpesa payment.";
    }
    if (name === "referenceNumber") {
      if (!v.trim()) return "Reference number is required.";
    }

    if (name === "institutionMemberType") {
      if (!isPublic && !v.trim()) return "Please select Student or Staff.";
    }

    if (name === "institutionAccessCode") {
      if (!isPublic && !v.trim()) return "Institution access code is required.";
      if (!isPublic && v.trim().length < 3) return "Access code looks too short.";
    }

    if (name === "password") {
      if (!v) return "Password is required.";
      if (v.length < 6) return "Password must be at least 6 characters.";
    }
    if (name === "confirmPassword") {
      if (!v) return "Confirm your password.";
      if (v !== password) return "Passwords do not match.";
    }
    if (name === "institutionId") {
      if (!isPublic && !v.trim()) return "Institution is required for institution users.";
      if (!isPublic && v.trim()) {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return "InstitutionId must be a valid number.";
      }
    }

    return null;
  }

  function validateAll() {
    const next = {};

    const fields = [
      ["firstName", firstName],
      ["lastName", lastName],
      ["username", username],
      ["email", email],
      ["phoneNumber", phoneNumber],
      ["referenceNumber", referenceNumber],
      ["password", password],
      ["confirmPassword", confirmPassword],
    ];

    for (const [name, value] of fields) {
      const msg = validateField(name, value);
      if (msg) next[name] = msg;
    }

    if (!isPublic) {
      const msgId = validateField("institutionId", institutionId);
      if (msgId) next.institutionId = msgId;

      const msgMt = validateField("institutionMemberType", institutionMemberType);
      if (msgMt) next.institutionMemberType = msgMt;

      const msgCode = validateField("institutionAccessCode", institutionAccessCode);
      if (msgCode) next.institutionAccessCode = msgCode;
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  // -----------------------------
  // API helpers
  // -----------------------------
  async function createRegistrationIntentIfNeeded() {
    if (intentId && nextAction) return { intentId, nextAction };

    const payload = {
      email: email.trim(),
      username: username.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phoneNumber: phoneNumber.trim() || null,
      countryId: countryId ? Number(countryId) : null,
      referenceNumber: referenceNumber.trim() || null,

      institutionAccessCode: !isPublic ? institutionAccessCode.trim().toUpperCase() : null,

      userType, // "Public" | "Institution"

      institutionId: !isPublic && institutionId ? Number(institutionId) : null,

      institutionMemberType: !isPublic ? institutionMemberType : null,
    };

    const res = await api.post("/registration/intent", payload);
    const data = res.data?.data ?? res.data;

    setIntentId(data.registrationIntentId);
    setNextAction(data.nextAction);

    return { intentId: data.registrationIntentId, nextAction: data.nextAction };
  }

  async function initiateSignupPaymentMpesa(registrationIntentId) {
    const payload = {
      purpose: PAYMENT_PURPOSE_PUBLIC_SIGNUP,
      amount: SIGNUP_FEE_KES,
      phoneNumber: normalizePhone(phoneNumber),
      registrationIntentId,
    };

    const res = await api.post("/payments/mpesa/stk/initiate", payload);
    const data = res.data?.data ?? res.data;

    setPaymentInfo(data);
    return data;
  }

  async function initiateSignupPaymentPaystack(registrationIntentId) {
    const res = await api.post("/payments/paystack/initialize", {
      purpose: PAYMENT_PURPOSE_PUBLIC_SIGNUP,
      amount: SIGNUP_FEE_KES,
      currency: "KES",
      email: email.trim(),
      registrationIntentId,
    });

    const data = res.data?.data ?? res.data;

    const authorizationUrl =
      data?.authorization_url ||
      data?.authorizationUrl ||
      data?.data?.authorization_url ||
      data?.authorizationUrl;

    if (!authorizationUrl) {
      throw new Error("Paystack initialize did not return authorizationUrl.");
    }

    // ✅ store so we can resume after Paystack redirects back
    localStorage.setItem(LS_REG_INTENT, String(registrationIntentId));
    localStorage.setItem(LS_REG_EMAIL, email.trim());

    // ✅ store creds so TwoFactorSetup can work after redirect (state resets)
    localStorage.setItem(LS_REG_USERNAME, username.trim());
    localStorage.setItem(LS_REG_PASSWORD, password);

    // redirect
    window.location.href = authorizationUrl;
  }

  async function checkIntentStatus(intentIdToCheck) {
    const useIntent = intentIdToCheck ?? intentId;
    if (!useIntent) return;

    setError("");
    setStatusText("Checking payment status...");
    try {
      const res = await api.get(`/registration/intent/${useIntent}/status`);
      const data = res.data?.data ?? res.data;

      setLastCheckedAt(new Date());

      if (data?.status === "COMPLETED") {
        stopPolling();
        setWaitingPayment(false);
        setStatusText("");

        // ✅ show success + move user forward
        setRegistrationComplete(true);
        setSuccessMessage(
          "Payment confirmed and your account has been created. Proceed to set up 2FA."
        );

        // ✅ Cleanup stored state now that we are done
        localStorage.removeItem(LS_REG_INTENT);
        localStorage.removeItem(LS_REG_EMAIL);
        localStorage.removeItem(LS_REG_USERNAME);
        localStorage.removeItem(LS_REG_PASSWORD);

        // ✅ auto-navigate to setup (same info you already pass)
        nav("/twofactor-setup", {
          replace: true,
          state: { username: username.trim(), password },
        });

        return;
      }

      if (data?.status === "PAID") {
        setWaitingPayment(true);
        setStatusText("Payment received. Finalizing account creation (sending emails)...");
        return;
      }

      setWaitingPayment(true);
      setStatusText("Still waiting for payment confirmation. Please complete the payment.");
    } catch (e) {
      setStatusText("");
      setError(toText(extractAxiosError(e)));
    }
  }

  function startPolling(intentIdToPoll) {
    stopPolling();
    pollRef.current = setInterval(() => {
      checkIntentStatus(intentIdToPoll);
    }, 5000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    if (waitingPayment && (intentId || localStorage.getItem(LS_REG_INTENT))) {
      const stored = localStorage.getItem(LS_REG_INTENT);
      const useIntent = intentId || (stored ? Number(stored) : null);
      if (useIntent) startPolling(useIntent);
      return () => stopPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingPayment, intentId]);

  // ✅ NEW: Handle Paystack return to registration
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const paid = (qs.get("paid") || "").trim();
    if (paid !== "1") return;

    const storedIntent = localStorage.getItem(LS_REG_INTENT);
    if (!storedIntent) return;

    const storedEmail = localStorage.getItem(LS_REG_EMAIL) || "";
    if (!email && storedEmail) setEmail(storedEmail);

    // ✅ Restore username/password after Paystack reload
    const storedUsername = localStorage.getItem(LS_REG_USERNAME) || "";
    const storedPassword = localStorage.getItem(LS_REG_PASSWORD) || "";
    if (!username && storedUsername) setUsername(storedUsername);
    if (!password && storedPassword) setPassword(storedPassword);

    const parsedIntent = Number(storedIntent);
    if (Number.isFinite(parsedIntent) && parsedIntent > 0) {
      setIntentId(parsedIntent);
      setNextAction("PAYMENT_REQUIRED");

      setInfo("Payment successful ✅ Finalizing your account...");
      setWaitingPayment(true);
      setStatusText("Finalizing account creation…");

      // immediate status check
      checkIntentStatus(parsedIntent);

      // clean URL so it doesn’t repeat
      qs.delete("paid");
      qs.delete("provider");
      nav(
        {
          pathname: location.pathname,
          search: qs.toString() ? `?${qs.toString()}` : "",
        },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // -----------------------------
  // Actions
  // -----------------------------
  async function onCreateAccount(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setStatusText("");
    setPaymentInfo(null);

    setRegistrationComplete(false);
    setSuccessMessage("");

    const ok = validateAll();
    if (!ok) {
      setError("Please fix the highlighted fields and try again.");
      return;
    }

    setLoading(true);
    try {
      const { intentId: createdIntentId, nextAction: action } = await createRegistrationIntentIfNeeded();

      if (action === "PAYMENT_REQUIRED") {
        if (publicPayMethod === "MPESA") {
          setInfo(
            `Signup fee applies: KES ${SIGNUP_FEE_KES}. An Mpesa prompt is being sent — please check your phone and approve.`
          );

          await initiateSignupPaymentMpesa(createdIntentId);

          setWaitingPayment(true);
          setStatusText("Waiting for payment confirmation... Check your phone and approve.");
          return;
        }

        // PAYSTACK
        setInfo(`Signup fee applies: KES ${SIGNUP_FEE_KES}. Redirecting to Paystack checkout...`);
        await initiateSignupPaymentPaystack(createdIntentId);
        return;
      }

      // no payment required
      await api.post(`/registration/complete/${createdIntentId}`);

      setRegistrationComplete(true);
      setSuccessMessage("Account created successfully. Proceed to set up 2FA.");

      nav("/twofactor-setup", {
        replace: true,
        state: { username: username.trim(), password },
      });
    } catch (e2) {
      setError(toText(extractAxiosError(e2)));
    } finally {
      setLoading(false);
    }
  }

  function startOver() {
    stopPolling();

    setError("");
    setInfo("");
    setStatusText("");
    setPaymentInfo(null);

    setWaitingPayment(false);
    setLastCheckedAt(null);

    setIntentId(null);
    setNextAction(null);

    setRegistrationComplete(false);
    setSuccessMessage("");

    setFieldErrors({});

    // clear stored return-state
    localStorage.removeItem(LS_REG_INTENT);
    localStorage.removeItem(LS_REG_EMAIL);

    // ✅ clear stored creds too
    localStorage.removeItem(LS_REG_USERNAME);
    localStorage.removeItem(LS_REG_PASSWORD);
  }

  // -----------------------------
  // UI helpers
  // -----------------------------
  function FieldError({ name }) {
    const msg = fieldErrors?.[name];
    if (!msg) return null;
    return <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>{msg}</div>;
  }

  function inputStyle(name) {
    return fieldErrors?.[name] ? { borderColor: "#ef4444", outlineColor: "#ef4444" } : undefined;
  }

  function PillChoice({ items, value, onChange, disabled }) {
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {items.map((t) => {
          const active = value === t.value;
          return (
            <button
              key={t.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(t.value)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: active ? "2px solid #8b1c1c" : "1px solid #e5e7eb",
                background: active ? "#fff1f2" : "white",
                color: "#111827",
                fontWeight: 800,
                cursor: disabled ? "not-allowed" : "pointer",
                flex: "1 1 220px",
                textAlign: "left",
                boxShadow: active ? "0 8px 20px rgba(0,0,0,0.06)" : "none",
              }}
            >
              <div style={{ fontSize: 14 }}>{t.label}</div>
              {t.sub && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280", fontWeight: 600 }}>
                  {t.sub}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // -----------------------------
  // SUCCESS SCREEN
  // -----------------------------
  if (registrationComplete) {
    return (
      <div className="register-layout">
        <div className="register-info-panel" style={{ flex: "0 0 40%" }}>
          <img src="/logo.png" alt="LawAfrica" className="register-brand-logo" />
          <h1>Account created ✅</h1>
          <p className="register-tagline">Next step: verify email and complete 2FA setup.</p>

          <ul className="register-benefits">
            <li>✔ Verify your email (activation link sent)</li>
            <li>✔ Check your email for the 2FA setup QR/setup instructions</li>
            <li>✔ Add LawAfrica to your Authenticator app</li>
            <li>✔ Verify using setup token + 6-digit code</li>
          </ul>
        </div>

        <div className="register-form-panel" style={{ flex: "1 1 60%" }}>
          <div className="register-card">
            <h2>Proceed to 2FA setup</h2>
            <p className="subtitle">{successMessage || "Your account is ready. Continue to set up 2FA."}</p>

            {error && (
              <div className="error-box" style={{ whiteSpace: "pre-wrap" }}>
                {toText(error)}
              </div>
            )}
            {info && (
              <div className="success-box" style={{ whiteSpace: "pre-wrap" }}>
                {toText(info)}
              </div>
            )}

            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() =>
                  nav("/twofactor-setup", {
                    replace: true,
                    state: { username: username.trim(), password },
                  })
                }
                style={{
                  width: "auto",
                  padding: "10px 14px",
                  background: "#8b1c1c",
                  color: "white",
                }}
              >
                Continue to 2FA setup →
              </button>

              <button
                type="button"
                onClick={() => nav("/login")}
                style={{
                  width: "auto",
                  padding: "10px 14px",
                  background: "#111827",
                  color: "white",
                }}
              >
                Go to login
              </button>

              <button
                type="button"
                onClick={startOver}
                style={{
                  width: "auto",
                  padding: "10px 14px",
                  background: "#6b7280",
                  color: "white",
                }}
              >
                Start over
              </button>
            </div>

            {(intentId || nextAction) && (
              <div style={{ marginTop: 14, fontSize: 12, color: "#6b7280" }}>
                Intent: {intentId ? `#${intentId}` : "—"} | Next: {nextAction || "—"}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------
  // MAIN REGISTER
  // -----------------------------
  return (
    <div className="register-layout">
      <div className="register-info-panel" style={{ flex: "0 0 40%" }}>
        <img src="/logo.png" alt="LawAfrica" className="register-brand-logo" />
        <h1>Create your LawAfrica account</h1>

        {isPublic ? (
          <p className="register-tagline">
            <strong>Public signup fee applies (KES {SIGNUP_FEE_KES}).</strong>
            <br />
            Choose <strong>Mpesa</strong> (Kenya) or <strong>Paystack</strong> (card/bank/international).
          </p>
        ) : (
          <p className="register-tagline">
            Use your institution email + reference number.
            <br />
            <strong>Institution access code is required for security.</strong>
          </p>
        )}

        <ul className="register-benefits">
          <li>✔ Secure signup via registration intent</li>
          <li>✔ Email verification + 2FA setup after account creation</li>
          <li>✔ Institution memberships can be managed by your admin</li>
        </ul>
      </div>

      <div className="register-form-panel" style={{ flex: "1 1 60%" }}>
        <div className="register-card">
          <h2>Sign up</h2>
          <p className="subtitle">
            {isPublic
              ? `Public signup requires a one-time fee of KES ${SIGNUP_FEE_KES}.`
              : "Institution users can sign up here. Choose Student or Staff to allocate the correct seat type."}
          </p>

          {error && (
            <div className="error-box" style={{ whiteSpace: "pre-wrap" }}>
              {toText(error)}
            </div>
          )}
          {info && (
            <div className="success-box" style={{ whiteSpace: "pre-wrap" }}>
              {toText(info)}
            </div>
          )}

          {isPublic && (
            <div
              className="success-box"
              style={{
                marginBottom: 14,
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                color: "#065f46",
              }}
            >
              <strong>Signup fee: KES {SIGNUP_FEE_KES}</strong>
              <div style={{ marginTop: 6 }}>
                {publicPayMethod === "MPESA" ? (
                  <>
                    When you click <strong>Create Account</strong>, we’ll initiate an <strong>Mpesa STK push</strong>.
                    Please <strong>check your phone</strong> and approve the prompt.
                  </>
                ) : (
                  <>
                    When you click <strong>Create Account</strong>, you’ll be redirected to <strong>Paystack</strong> to
                    complete payment.
                  </>
                )}
              </div>
            </div>
          )}

          <form onSubmit={onCreateAccount}>
            <label className="field-label">Account Type</label>
            <div style={{ marginBottom: 14 }}>
              <PillChoice items={USER_TYPES} value={userType} onChange={setUserType} disabled={waitingPayment} />
            </div>

            {/* ✅ Public payment method choice */}
            {isPublic && (
              <>
                <label className="field-label">Payment Method</label>
                <div style={{ marginBottom: 14 }}>
                  <PillChoice
                    items={[
                      { value: "MPESA", label: "Mpesa", sub: "Kenya-only (STK prompt)" },
                      { value: "PAYSTACK", label: "Paystack", sub: "Card/bank/international" },
                    ]}
                    value={publicPayMethod}
                    onChange={setPublicPayMethod}
                    disabled={lockForm}
                  />
                </div>
              </>
            )}

            <div className="grid-2">
              <div>
                <label className="field-label">First Name</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={(e) => {
                    const msg = validateField("firstName", e.target.value);
                    msg ? setFieldError("firstName", msg) : clearFieldError("firstName");
                  }}
                  disabled={lockForm}
                  style={inputStyle("firstName")}
                />
                <FieldError name="firstName" />
              </div>

              <div>
                <label className="field-label">Last Name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={(e) => {
                    const msg = validateField("lastName", e.target.value);
                    msg ? setFieldError("lastName", msg) : clearFieldError("lastName");
                  }}
                  disabled={lockForm}
                  style={inputStyle("lastName")}
                />
                <FieldError name="lastName" />
              </div>
            </div>

            <label className="field-label">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={(e) => {
                const msg = validateField("username", e.target.value);
                msg ? setFieldError("username", msg) : clearFieldError("username");
              }}
              disabled={lockForm}
              style={inputStyle("username")}
            />
            <FieldError name="username" />

            <label className="field-label">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={(e) => {
                const msg = validateField("email", e.target.value);
                msg ? setFieldError("email", msg) : clearFieldError("email");
              }}
              disabled={lockForm}
              style={inputStyle("email")}
            />
            <FieldError name="email" />

            {!isPublic && selectedInstitution?.emailDomain && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                Your institution domain: <strong>@{selectedInstitution.emailDomain}</strong>
              </div>
            )}

            <label className="field-label">
              Phone{" "}
              {isPublic
                ? publicPayMethod === "MPESA"
                  ? "(required for Mpesa)"
                  : "(optional)"
                : "(optional)"}
            </label>
            <input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onBlur={(e) => {
                const msg = validateField("phoneNumber", e.target.value);
                msg ? setFieldError("phoneNumber", msg) : clearFieldError("phoneNumber");
              }}
              disabled={lockForm}
              style={inputStyle("phoneNumber")}
            />
            <FieldError name="phoneNumber" />

            <div className="grid-2">
              <div>
                <label className="field-label">Country</label>
                {countries.length > 0 ? (
                  <select value={countryId} onChange={(e) => setCountryId(e.target.value)} disabled={lockForm}>
                    <option value="">Select country</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    inputMode="numeric"
                    value={countryId}
                    onChange={(e) => setCountryId(e.target.value)}
                    placeholder="CountryId (fallback)"
                    disabled={lockForm}
                  />
                )}
              </div>

              <div>
                <label className="field-label">Reference Number (required)</label>
                <input
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  onBlur={(e) => {
                    const msg = validateField("referenceNumber", e.target.value);
                    msg ? setFieldError("referenceNumber", msg) : clearFieldError("referenceNumber");
                  }}
                  placeholder={isPublic ? "National ID / Passport" : "Student No / Employee No"}
                  disabled={lockForm}
                  style={inputStyle("referenceNumber")}
                />
                <FieldError name="referenceNumber" />
              </div>
            </div>

            {!isPublic && (
              <>
                <div className="divider" />
                <h3 className="section-title">Institution</h3>

                <div style={{ marginBottom: 14 }}>
                  <label className="field-label">Registering as</label>
                  <PillChoice
                    items={INSTITUTION_MEMBER_TYPES}
                    value={institutionMemberType}
                    onChange={setInstitutionMemberType}
                    disabled={lockForm}
                  />
                  <FieldError name="institutionMemberType" />
                  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                    Choose the correct type to allocate seats properly (Student vs Staff).
                  </div>
                </div>

                {institutions.length > 0 ? (
                  <div className="grid-2">
                    <div>
                      <label className="field-label">Select Institution (required)</label>
                      <select
                        value={institutionId}
                        onChange={(e) => setInstitutionId(e.target.value)}
                        onBlur={(e) => {
                          const msg = validateField("institutionId", e.target.value);
                          msg ? setFieldError("institutionId", msg) : clearFieldError("institutionId");
                        }}
                        disabled={lockForm}
                        style={inputStyle("institutionId")}
                      >
                        <option value="">Select institution…</option>
                        {institutions.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                      <FieldError name="institutionId" />
                    </div>

                    <div>
                      <label className="field-label">
                        Institution Access Code <span style={{ color: "#b91c1c" }}>(required)</span>
                      </label>
                      <input
                        value={institutionAccessCode}
                        onChange={(e) => setInstitutionAccessCode(e.target.value.toUpperCase())}
                        onBlur={(e) => {
                          const msg = validateField("institutionAccessCode", e.target.value);
                          msg ? setFieldError("institutionAccessCode", msg) : clearFieldError("institutionAccessCode");
                        }}
                        placeholder="Get this from your institution admin"
                        disabled={lockForm}
                        style={inputStyle("institutionAccessCode")}
                      />
                      <FieldError name="institutionAccessCode" />
                    </div>
                  </div>
                ) : (
                  <>
                    {institutionsLoadFailed && (
                      <div
                        className="success-box"
                        style={{
                          marginBottom: 12,
                          background: "#fffbeb",
                          border: "1px solid #fcd34d",
                          color: "#92400e",
                        }}
                      >
                        Institution list is not available yet. Using manual InstitutionId entry.
                      </div>
                    )}

                    <div className="grid-2">
                      <div>
                        <label className="field-label">InstitutionId (required)</label>
                        <input
                          inputMode="numeric"
                          value={institutionId}
                          onChange={(e) => setInstitutionId(e.target.value)}
                          onBlur={(e) => {
                            const msg = validateField("institutionId", e.target.value);
                            msg ? setFieldError("institutionId", msg) : clearFieldError("institutionId");
                          }}
                          placeholder="e.g. 12"
                          disabled={lockForm}
                          style={inputStyle("institutionId")}
                        />
                        <FieldError name="institutionId" />
                      </div>

                      <div>
                        <label className="field-label">
                          Institution Access Code <span style={{ color: "#b91c1c" }}>(required)</span>
                        </label>
                        <input
                          value={institutionAccessCode}
                          onChange={(e) => setInstitutionAccessCode(e.target.value.toUpperCase())}
                          onBlur={(e) => {
                            const msg = validateField("institutionAccessCode", e.target.value);
                            msg ? setFieldError("institutionAccessCode", msg) : clearFieldError("institutionAccessCode");
                          }}
                          placeholder="Get this from your institution admin"
                          disabled={lockForm}
                          style={inputStyle("institutionAccessCode")}
                        />
                        <FieldError name="institutionAccessCode" />
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            <div className="divider" />
            <h3 className="section-title">Password</h3>

            <div className="grid-2">
              <div>
                <label className="field-label">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={(e) => {
                    const msg = validateField("password", e.target.value);
                    msg ? setFieldError("password", msg) : clearFieldError("password");
                  }}
                  disabled={lockForm}
                  style={inputStyle("password")}
                />
                <FieldError name="password" />
              </div>

              <div>
                <label className="field-label">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={(e) => {
                    const msg = validateField("confirmPassword", e.target.value);
                    msg ? setFieldError("confirmPassword", msg) : clearFieldError("confirmPassword");
                  }}
                  disabled={lockForm}
                  style={inputStyle("confirmPassword")}
                />
                <FieldError name="confirmPassword" />
              </div>
            </div>

            <button type="submit" disabled={lockForm}>
              {loading
                ? isPublic
                  ? publicPayMethod === "MPESA"
                    ? "Sending Mpesa prompt..."
                    : "Redirecting to Paystack..."
                  : "Creating account..."
                : waitingPayment
                ? "Finalizing payment..."
                : "Create Account"}
            </button>

            {paymentInfo && (
              <div className="success-box" style={{ marginTop: 12 }}>
                <div>
                  <strong>Payment initiated.</strong> {publicPayMethod === "MPESA" ? "Check your phone and approve." : ""}
                </div>
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  <div>
                    <strong>PaymentIntentId:</strong> {paymentInfo.paymentIntentId}
                  </div>
                  <div>
                    <strong>CheckoutRequestId:</strong> {paymentInfo.checkoutRequestId}
                  </div>
                </div>
              </div>
            )}

            {waitingPayment && (
              <div
                className="success-box"
                style={{
                  marginTop: 12,
                  background: "#ecfeff",
                  border: "1px solid #a5f3fc",
                  color: "#0e7490",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 6 }}>
                  {statusText || "Finalizing payment..."}
                </div>

                <div style={{ fontSize: 13, color: "#155e75" }}>
                  We auto-refresh every 5 seconds.
                </div>

                <div style={{ marginTop: 8, fontSize: 12, color: "#155e75" }}>
                  {lastCheckedAt ? (
                    <>
                      Last checked: <strong>{lastCheckedAt.toLocaleTimeString()}</strong>
                    </>
                  ) : (
                    <>Last checked: —</>
                  )}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={{ width: "auto", padding: "10px 14px" }}
                    onClick={() => {
                      const stored = localStorage.getItem(LS_REG_INTENT);
                      const useIntent = intentId || (stored ? Number(stored) : null);
                      checkIntentStatus(useIntent);
                    }}
                    disabled={loading}
                  >
                    I’ve paid — Check status
                  </button>

                  <button
                    type="button"
                    style={{
                      width: "auto",
                      padding: "10px 14px",
                      background: "#6b7280",
                      color: "white",
                    }}
                    onClick={startOver}
                  >
                    Start over
                  </button>
                </div>
              </div>
            )}

            <div className="register-footer">
              Already have an account?{" "}
              <span className="linkish" onClick={() => nav("/login")}>
                Sign in
              </span>
            </div>
          </form>

          {(intentId || nextAction) && (
            <div style={{ marginTop: 14, fontSize: 12, color: "#6b7280" }}>
              Intent: {intentId ? `#${intentId}` : "—"} | Next: {nextAction || "—"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
