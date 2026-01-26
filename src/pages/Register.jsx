import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/client.js";
import "../styles/register.css";

const SIGNUP_FEE_KES = 10;
const PAYMENT_PURPOSE_PUBLIC_SIGNUP = "PublicSignupFee";
const USER_TYPES = [
  {
    value: "Public",
    label: "Individual (Public)",
    sub: "Pay once, access free content and your purchases",
    icon: "👤",
  },
  {
    value: "Institution",
    label: "Institution User",
    sub: "Use your institution email & access code",
    icon: "🏛️",
  },
];
const PUBLIC_PAY_METHODS = [
  { value: "MPESA", label: "Mpesa", sub: "Kenya-only (STK prompt)", icon: "📱" },
  { value: "PAYSTACK", label: "Paystack", sub: "Card/bank/international", icon: "💳" },
];
const INSTITUTION_MEMBER_TYPES = [
  { value: "Student", label: "Student", sub: "Learner / enrollee" },
  { value: "Staff", label: "Staff", sub: "Employee / lecturer" },
];

const USERNAME_REGEX = /^[A-Za-z]+(\.[A-Za-z]+)*$/;

const AUTH_BENEFITS = [
  {
    title: "Statutes",
    desc: "Consolidated, updated and indexed legal materials.",
    icon: "⟡",
  },
  {
    title: "Law Reports",
    desc: "Reliable reporting for research and precedent-based work.",
    icon: "📄",
  },
  {
    title: "Commentaries",
    desc: "Expert analysis for deeper understanding.",
    icon: "💬",
  },
  {
    title: "Journals",
    desc: "Scholarly insights for academics and practitioners.",
    icon: "📚",
  },
];

function getPasswordRules(pwd) {
  const v = String(pwd || "");
  return {
    min8: v.length >= 8,
    hasUpper: /[A-Z]/.test(v),
    hasLower: /[a-z]/.test(v),
    hasNumber: /[0-9]/.test(v),
    hasSpecial: /[^A-Za-z0-9]/.test(v),
  };
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizePhone(phone) {
  let p = String(phone || "").trim();
  p = p.replace(/\s+/g, "");
  if (p.startsWith("+")) p = p.slice(1);

  if (p.startsWith("07") && p.length === 10) {
    p = "254" + p.slice(1);
  }
  if (/^7\d{8}$/.test(p)) {
    p = "254" + p;
  }
  return p;
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

const LS_REG_INTENT = "la_reg_intent_id";
const LS_REG_EMAIL = "la_reg_email";
const LS_REG_USERNAME = "la_reg_username";
const LS_REG_PASSWORD = "la_reg_password";

const LS_REG_PAYMETHOD = "la_reg_pay_method"; // MPESA | PAYSTACK
const LS_REG_PHONE = "la_reg_phone";
const LS_REG_COUNTRY = "la_reg_country";

const LS_RESUME_TOKEN = "la_resume_token";
const LS_RESUME_EMAIL = "la_resume_email";
const LS_REG_NEXTACTION = "la_reg_next_action";

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

  // Institution fields
  const [institutionId, setInstitutionId] = useState("");
  const [institutionAccessCode, setInstitutionAccessCode] = useState("");
  const [institutionMemberType, setInstitutionMemberType] = useState("Student");

  // ✅ NEW: Reference number (institution users only; nullable overall)
  const [referenceNumber, setReferenceNumber] = useState("");

  const [institutions, setInstitutions] = useState([]);
  const [institutionsLoadFailed, setInstitutionsLoadFailed] = useState(false);

  const selectedInstitution = useMemo(() => {
    if (!institutionId) return null;
    return institutions.find((i) => String(i.id) === String(institutionId)) || null;
  }, [institutionId, institutions]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Touched + errors
  const [touched, setTouched] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});

  // Flow state
  const [intentId, setIntentId] = useState(null);
  const [nextAction, setNextAction] = useState(null);
  const [paymentInfo, setPaymentInfo] = useState(null);

  // Payment method (Public only)
  const [publicPayMethod, setPublicPayMethod] = useState("MPESA");

  // Waiting / polling
  const [waitingPayment, setWaitingPayment] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const pollRef = useRef(null);

  // ✅ Resume banner (old/local resume)
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [resumeIntentId, setResumeIntentId] = useState(null);
  const [resumePayMethod, setResumePayMethod] = useState(null);

  // ✅ Resume-with-OTP UI state
  const [resumeOtpOpen, setResumeOtpOpen] = useState(false);
  const [resumeEmail, setResumeEmail] = useState(() => localStorage.getItem(LS_RESUME_EMAIL) || "");
  const [resumeCode, setResumeCode] = useState("");
  const [resumeOtpSent, setResumeOtpSent] = useState(false);
  const [resumeCooldown, setResumeCooldown] = useState(0);
  const [resumeExpires, setResumeExpires] = useState(0);
  const resumeTimerRef = useRef(null);

  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [resumeInfo, setResumeInfo] = useState("");
  const [resumeVerified, setResumeVerified] = useState(false);

  // ✅ initialize from localStorage so users can proceed even after refresh
  const [resumeToken, setResumeToken] = useState(() => localStorage.getItem(LS_RESUME_TOKEN) || "");
  const [resumePending, setResumePending] = useState(null); // Step 2 data from /pending

  // ✅ NEW: Step 3 - continuing payment from resumed intent
  const [resumeContinueLoading, setResumeContinueLoading] = useState(false);

  // Completion UX
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Token for 2FA flow
  const [postRegisterSetupToken, setPostRegisterSetupToken] = useState("");

  // General UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const lockForm = waitingPayment || loading;

  const passwordRules = useMemo(() => getPasswordRules(password), [password]);
  // eslint-disable-next-line no-unused-vars
  const passwordRulesOk = useMemo(() => Object.values(passwordRules).every(Boolean), [passwordRules]);

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
      setReferenceNumber(""); // ✅ clear when switching away from institution

      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.institutionId;
        delete next.institutionMemberType;
        delete next.institutionAccessCode;
        delete next.referenceNumber;
        return next;
      });
    }
  }, [isPublic]);

  useEffect(() => {
  if (intentId) return;
  const storedIntent = localStorage.getItem(LS_REG_INTENT);
  if (!storedIntent) return;

  const parsed = Number(storedIntent);
  if (!Number.isFinite(parsed) || parsed <= 0) return;

  // Restore intent into state
  setIntentId(parsed);
  const storedNext = localStorage.getItem("la_reg_next_action");
  if (storedNext) setNextAction(storedNext);
}, [intentId]);

  // -----------------------------
  // ✅ Detect old/local resume data (existing behavior)
  // -----------------------------
  useEffect(() => {
    const storedIntent = localStorage.getItem(LS_REG_INTENT);
    const storedPayMethod = localStorage.getItem(LS_REG_PAYMETHOD);
    if (!storedIntent) {
      setResumeAvailable(false);
      setResumeIntentId(null);
      setResumePayMethod(null);
      return;
    }

    

    const parsed = Number(storedIntent);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setResumeAvailable(false);
      setResumeIntentId(null);
      setResumePayMethod(null);
      return;
    }

    setResumeAvailable(true);
    setResumeIntentId(parsed);
    setResumePayMethod(storedPayMethod || null);

    // also prefill known basics if empty (nice UX)
    const storedEmail = localStorage.getItem(LS_REG_EMAIL) || "";
    const storedUsername = localStorage.getItem(LS_REG_USERNAME) || "";
    const storedPassword = localStorage.getItem(LS_REG_PASSWORD) || "";
    const storedPhone = localStorage.getItem(LS_REG_PHONE) || "";
    const storedCountry = localStorage.getItem(LS_REG_COUNTRY) || "";

    if (!email && storedEmail) setEmail(storedEmail);
    if (!username && storedUsername) setUsername(storedUsername);
    if (!password && storedPassword) setPassword(storedPassword);
    if (!phoneNumber && storedPhone) setPhoneNumber(storedPhone);
    if (!countryId && storedCountry) setCountryId(storedCountry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------
  // ✅ Resume OTP countdown tick (cooldown + expiry)
  // -----------------------------
  useEffect(() => {
    if (!resumeOtpSent) return;

    if (resumeTimerRef.current) clearInterval(resumeTimerRef.current);

    resumeTimerRef.current = setInterval(() => {
      setResumeCooldown((s) => (s > 0 ? s - 1 : 0));
      setResumeExpires((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => {
      if (resumeTimerRef.current) clearInterval(resumeTimerRef.current);
      resumeTimerRef.current = null;
    };
  }, [resumeOtpSent]);

  useEffect(() => {
    if (!resumeOtpSent) return;
    if (resumeExpires > 0) return;
    setResumeInfo("Code expired. Request a new code to continue.");
  }, [resumeExpires, resumeOtpSent]);

  // -----------------------------
  // Validation helpers
  // -----------------------------
  function markTouched(name) {
    setTouched((prev) => ({ ...prev, [name]: true }));
  }

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

const validateField = useCallback(
  (name, value) => {
    const raw = (value ?? "").toString();
    const v = raw;

    if (name === "firstName") {
      if (!v.trim()) return "First name is required.";
    }

    if (name === "lastName") {
      if (!v.trim()) return "Last name is required.";
    }

    if (name === "username") {
      const u = v.trim();
      if (!u) return "Username is required.";
      if (/\s/.test(u)) return "Username cannot contain spaces.";
      if (!USERNAME_REGEX.test(u)) {
        return "Username must contain letters only. Dots are allowed between letter groups (e.g. d.ochieno). No numbers, no leading/trailing dots, and no consecutive dots.";
      }
      if (u.length < 3) return "Username must be at least 3 characters.";
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
      if (isPublic && publicPayMethod === "MPESA") {
        if (!v.trim()) return "Phone number is required for Mpesa payment.";

        const normalized = normalizePhone(v);
        if (!/^2547\d{8}$/.test(normalized)) {
          return "Enter a valid Mpesa number like 2547XXXXXXXX (or 07XXXXXXXX).";
        }
      }
    }

    if (name === "institutionMemberType") {
      if (!isPublic && !v.trim()) return "Please select Student or Staff.";
    }

    if (name === "institutionAccessCode") {
      if (!isPublic) {
        const required = selectedInstitution?.accessCodeRequired !== false;
        if (required && !v.trim()) return "Institution access code is required.";
        if (v.trim() && v.trim().length < 3) return "Access code looks too short.";
      }
    }

    if (name === "referenceNumber") {
      if (!isPublic) {
        if (!v.trim()) return "Reference number is required for institution users.";
        if (v.trim().length < 3) return "Reference number looks too short.";
      }
    }

    if (name === "password") {
      if (!v) return "Password is required.";
      const rules = getPasswordRules(v);
      const ok = Object.values(rules).every(Boolean);
      if (!ok) {
        return "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.";
      }
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
  },
  [
    isPublic,
    publicPayMethod,
    selectedInstitution,
    password,
  ]
);
  function validateAll() {
    const next = {};

    const fields = [
      ["firstName", firstName],
      ["lastName", lastName],
      ["username", username],
      ["email", email],
      ["phoneNumber", phoneNumber],
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

      const msgRef = validateField("referenceNumber", referenceNumber);
      if (msgRef) next.referenceNumber = msgRef;
    }

    setFieldErrors(next);

    setTouched(() => ({
      firstName: true,
      lastName: true,
      username: true,
      email: true,
      phoneNumber: true,
      password: true,
      confirmPassword: true,
      institutionId: true,
      institutionMemberType: true,
      institutionAccessCode: true,
      referenceNumber: true,
    }));

    return Object.keys(next).length === 0;
  }

  function liveValidate(name, value) {
    if (!touched?.[name]) return;
    const msg = validateField(name, value);
    msg ? setFieldError(name, msg) : clearFieldError(name);
  }

const isFormValidForSubmit = useMemo(() => {
  const requiredNames = ["firstName", "lastName", "username", "email", "password", "confirmPassword"];

  if (isPublic && publicPayMethod === "MPESA") requiredNames.push("phoneNumber");

  if (!isPublic) {
    requiredNames.push("institutionId");
    requiredNames.push("institutionMemberType");
    const requiredCode = selectedInstitution?.accessCodeRequired !== false;
    if (requiredCode) requiredNames.push("institutionAccessCode");
    requiredNames.push("referenceNumber");
  }

  const fieldValues = {
    firstName,
    lastName,
    username,
    email,
    password,
    confirmPassword,
    phoneNumber,
    institutionId,
    institutionMemberType,
    institutionAccessCode,
    referenceNumber,
  };

  for (const n of requiredNames) {
    const value = fieldValues[n] ?? "";
    if (validateField(n, value)) return false; // validateField returns an error => invalid
  }

  return true;
}, [
  firstName,
  lastName,
  username,
  email,
  password,
  confirmPassword,
  phoneNumber,
  institutionId,
  institutionMemberType,
  institutionAccessCode,
  referenceNumber,
  isPublic,
  publicPayMethod,
  selectedInstitution,
  validateField, // ✅ fixes eslint react-hooks/exhaustive-deps
]);
  // -----------------------------
  // Fetch setup token
  // -----------------------------
  async function fetchSetupTokenForOnboarding(user, pass) {
    const u = String(user || "").trim();
    const p = pass || "";
    if (!u || !p) return "";

    try {
      const res = await api.post("/Security/resend-2fa-setup", {
        username: u,
        password: p,
      });
      const data = res.data?.data ?? res.data;
      return data?.setupToken || "";
    } catch {
      return "";
    }
  }

  // -----------------------------
  // Server-error -> field mapping
  // -----------------------------
  function applyServerFieldHints(message) {
    const msg = String(message || "");
    if (/reference\s*number/i.test(msg)) {
      setFieldError("referenceNumber", msg);
      setTouched((prev) => ({ ...prev, referenceNumber: true }));
    }
  }

  // -----------------------------
  // API helpers
  // -----------------------------
  async function createRegistrationIntentIfNeeded() {
      if (intentId) {
        // If nextAction is missing (e.g., refresh), try to recover via status
        if (!nextAction) {
          try {
            const res = await api.get(`/registration/intent/${intentId}/status`);
            const data = res.data?.data ?? res.data;

            const recovered = data?.nextAction || data?.NextAction || null;
            if (recovered) {
              setNextAction(recovered);
              localStorage.setItem(LS_REG_NEXTACTION, String(recovered));
              return { intentId, nextAction: recovered };
            }
          } catch {
            // If status call fails, fall through and create a fresh intent (rare)
          }
        } else {
          return { intentId, nextAction };
        }
      }
    const payload = {
      email: email.trim(),
      username: username.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phoneNumber: phoneNumber.trim() || null,
      countryId: countryId ? Number(countryId) : null,

      institutionAccessCode: !isPublic ? institutionAccessCode.trim().toUpperCase() : null,
      userType,
      institutionId: !isPublic && institutionId ? Number(institutionId) : null,
      institutionMemberType: !isPublic ? institutionMemberType : null,

      // ✅ Only send referenceNumber for institution users; nullable overall
      referenceNumber: !isPublic ? (referenceNumber.trim() ? referenceNumber.trim() : null) : null,
    };

    const res = await api.post("/registration/intent", payload);
    const data = res.data?.data ?? res.data;

    setIntentId(data.registrationIntentId);
    setNextAction(data.nextAction);
    localStorage.setItem(LS_REG_INTENT, String(data.registrationIntentId));
    localStorage.setItem(LS_REG_NEXTACTION, String(data.nextAction || ""));

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
    // Reuse existing endpoint as requested
    const res = await api.post("/payments/paystack/initialize", {
      purpose: PAYMENT_PURPOSE_PUBLIC_SIGNUP,
      amount: SIGNUP_FEE_KES,
      currency: "KES",
      email: email.trim(),
      registrationIntentId,
    });

    const data = res.data?.data ?? res.data;

    const authorizationUrl =
      data?.authorization_url || data?.authorizationUrl || data?.data?.authorization_url || data?.authorizationUrl;

    if (!authorizationUrl) {
      throw new Error("Paystack initialize did not return authorizationUrl.");
    }

    // Persist for resume (old/local)
    localStorage.setItem(LS_REG_INTENT, String(registrationIntentId));
    localStorage.setItem(LS_REG_EMAIL, email.trim());
    localStorage.setItem(LS_REG_USERNAME, username.trim());
    localStorage.setItem(LS_REG_PASSWORD, password);
    localStorage.setItem(LS_REG_PAYMETHOD, "PAYSTACK");
    localStorage.setItem(LS_REG_PHONE, phoneNumber.trim());
    localStorage.setItem(LS_REG_COUNTRY, countryId || "");

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

        setRegistrationComplete(true);
        setSuccessMessage("Payment confirmed and your account has been created. Proceed to set up 2FA.");

        const token = await fetchSetupTokenForOnboarding(username.trim(), password);
        setPostRegisterSetupToken(token);

        // registration is done, clear resume keys
        localStorage.removeItem(LS_REG_INTENT);
        localStorage.removeItem(LS_REG_EMAIL);
        localStorage.removeItem(LS_REG_USERNAME);
        localStorage.removeItem(LS_REG_PASSWORD);
        localStorage.removeItem(LS_REG_PAYMETHOD);
        localStorage.removeItem(LS_REG_PHONE);
        localStorage.removeItem(LS_REG_COUNTRY);
        localStorage.removeItem(LS_REG_NEXTACTION);

        nav("/twofactor-setup", {
          replace: true,
          state: { username: username.trim(), password, setupToken: token },
        });

        return;
      }

      if (data?.status === "PAID") {
        setWaitingPayment(true);
        setStatusText("Payment received. Finalizing account creation...");
        return;
      }

      // Still pending / not paid
      setWaitingPayment(true);
      setStatusText("Waiting for payment. If you didn’t get a prompt or payment failed, you can resend the prompt.");
    } catch (e) {
      setStatusText("");
      const msg = toText(extractAxiosError(e));
      setError(toText(msg));
      applyServerFieldHints(msg);
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

  // Handle Paystack return
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const paid = (qs.get("paid") || "").trim();
    const reference = (qs.get("reference") || "").trim();
    if (paid !== "1" && !reference) return;

    const storedIntent = localStorage.getItem(LS_REG_INTENT);
    if (!storedIntent) return;

    const storedEmail = localStorage.getItem(LS_REG_EMAIL) || "";
    if (!email && storedEmail) setEmail(storedEmail);

    const storedUsername = localStorage.getItem(LS_REG_USERNAME) || "";
    const storedPassword = localStorage.getItem(LS_REG_PASSWORD) || "";
    if (!username && storedUsername) setUsername(storedUsername);
    if (!password && storedPassword) setPassword(storedPassword);

    const storedPhone = localStorage.getItem(LS_REG_PHONE) || "";
    const storedCountry = localStorage.getItem(LS_REG_COUNTRY) || "";
    if (!phoneNumber && storedPhone) setPhoneNumber(storedPhone);
    if (!countryId && storedCountry) setCountryId(storedCountry);

    const parsedIntent = Number(storedIntent);
    if (Number.isFinite(parsedIntent) && parsedIntent > 0) {
      setIntentId(parsedIntent);
      setNextAction("PAYMENT_REQUIRED");

      setInfo("Payment successful ✅ Finalizing your account...");
      setWaitingPayment(true);
      setStatusText("Finalizing account creation…");

      checkIntentStatus(parsedIntent);

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
  // Existing: Resume registration (old/local intent-based)
  // -----------------------------
  async function resumeRegistration() {
    const storedIntent = localStorage.getItem(LS_REG_INTENT);
    if (!storedIntent) return;

    const parsedIntent = Number(storedIntent);
    if (!Number.isFinite(parsedIntent) || parsedIntent <= 0) return;

    // Ensure we also restore pay method + phone/country (nice UX)
    const storedPayMethod = localStorage.getItem(LS_REG_PAYMETHOD);
    if (storedPayMethod === "MPESA") setPublicPayMethod("MPESA");
    if (storedPayMethod === "PAYSTACK") setPublicPayMethod("PAYSTACK");

    const storedPhone = localStorage.getItem(LS_REG_PHONE) || "";
    const storedCountry = localStorage.getItem(LS_REG_COUNTRY) || "";
    if (storedPhone) setPhoneNumber(storedPhone);
    if (storedCountry) setCountryId(storedCountry);

    setIntentId(parsedIntent);
    setNextAction("PAYMENT_REQUIRED");

    setError("");
    setInfo("Resuming your registration…");
    setWaitingPayment(true);
    setStatusText("Checking your payment status…");
    await checkIntentStatus(parsedIntent);
  }

  // -----------------------------
  // Resume with Email + OTP
  // -----------------------------
  async function requestResumeOtp() {
    const em = String(resumeEmail || "").trim().toLowerCase();

    setResumeError("");
    setResumeInfo("");
    setResumeVerified(false);
    setResumePending(null);

    if (!em) {
      setResumeError("Enter your email to continue.");
      return;
    }
    if (!isEmail(em)) {
      setResumeError("Enter a valid email address.");
      return;
    }

    if (resumeCooldown > 0) {
      setResumeInfo(`Please wait ${resumeCooldown}s before requesting another code.`);
      return;
    }

    setResumeLoading(true);
    try {
      const res = await api.post("/registration/resume/start-otp", { email: em });
      const data = res.data?.data ?? res.data;

      const cooldownSeconds = Number(data?.cooldownSeconds ?? 60);
      const expiresSeconds = Number(data?.expiresSeconds ?? 600);

      setResumeOtpSent(true);
      setResumeCooldown(Number.isFinite(cooldownSeconds) ? cooldownSeconds : 60);
      setResumeExpires(Number.isFinite(expiresSeconds) ? expiresSeconds : 600);

      setResumeInfo("If an unfinished registration exists for this email, we’ve sent a 6-digit code. Check your inbox.");
      localStorage.setItem(LS_RESUME_EMAIL, em);
    } catch (e) {
      setResumeError(toText(extractAxiosError(e)));
    } finally {
      setResumeLoading(false);
    }
  }

  async function verifyResumeOtp() {
    const em = String(resumeEmail || "").trim().toLowerCase();
    const code = String(resumeCode || "").replace(/\D/g, "").slice(0, 6);

    setResumeError("");
    setResumeInfo("");
    setResumePending(null);

    if (!em || !isEmail(em)) {
      setResumeError("Enter a valid email address.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setResumeError("Enter the 6-digit code from your email.");
      return;
    }

    setResumeLoading(true);
    try {
      const res = await api.post("/registration/resume/verify-otp", { email: em, code });
      const data = res.data?.data ?? res.data;

      const token = data?.resumeToken || data?.ResumeToken || "";
      const pending = data?.pending || data?.Pending || null;

      setResumeToken(token);
      setResumeVerified(true);

      if (token) localStorage.setItem(LS_RESUME_TOKEN, token);
      localStorage.setItem(LS_RESUME_EMAIL, em);

      setResumePending(pending);

      if (pending?.hasPending === false || pending?.HasPending === false) {
        setResumeInfo("Verified ✅ We couldn’t find an unfinished registration for this email.");
      } else {
        setResumeInfo("Verified ✅ Now click “Load pending registration” to continue.");
      }
    } catch (e) {
      setResumeError(toText(extractAxiosError(e)));
    } finally {
      setResumeLoading(false);
    }
  }

  function resetResumeOtpUi() {
    setResumeError("");
    setResumeInfo("");
    setResumeCode("");
    setResumeOtpSent(false);
    setResumeCooldown(0);
    setResumeExpires(0);
    setResumeVerified(false);
    setResumePending(null);
    if (resumeTimerRef.current) clearInterval(resumeTimerRef.current);
    resumeTimerRef.current = null;
  }

  // Step 2: pending
  async function fetchResumePending() {
    const token = String(resumeToken || localStorage.getItem(LS_RESUME_TOKEN) || "").trim();
    if (!token) {
      setResumeError("Missing resume token. Please verify the OTP again.");
      return;
    }

    setResumeLoading(true);
    setResumeError("");
    setResumeInfo("");
    try {
      const res = await api.get("/registration/resume/pending", {
        headers: { "X-Resume-Token": token },
      });
      const data = res.data?.data ?? res.data;

      setResumePending(data);

      if (!data?.hasPending) {
        setResumeInfo("No pending registration found for this verified session.");
      } else {
        setResumeInfo("Pending registration loaded ✅");
      }
    } catch (e) {
      setResumeError(toText(extractAxiosError(e)));
    } finally {
      setResumeLoading(false);
    }
  }
  // -----------------------------
  function getPendingIntentId(p) {
    if (!p) return null;

    const id1 = p.registrationIntentId;
    const id2 = p.RegistrationIntentId;

    // From nested shapes if any:
    const id3 = p?.pending?.registrationIntentId || p?.pending?.RegistrationIntentId;

    const picked = id1 ?? id2 ?? id3;
    const n = Number(picked);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function getPendingHasPending(p) {
    if (!p) return false;
    return Boolean(p.hasPending ?? p.HasPending ?? p?.pending?.hasPending ?? p?.pending?.HasPending ?? false);
  }

  async function continueResumeWithMpesa() {
    const regId = getPendingIntentId(resumePending);
    if (!regId) {
      setResumeError("Missing RegistrationIntentId. Please load pending registration again.");
      return;
    }

    // Mpesa needs phone number. Prefer what the user typed on main form; otherwise use stored.
    const phone = String(phoneNumber || localStorage.getItem(LS_REG_PHONE) || "").trim();
    if (!phone) {
      setResumeError("Enter your phone number above (Mpesa) then try again.");
      return;
    }
    const norm = normalizePhone(phone);
    if (!/^2547\d{8}$/.test(norm)) {
      setResumeError("Enter a valid Mpesa number like 2547XXXXXXXX (or 07XXXXXXXX).");
      return;
    }

    setResumeContinueLoading(true);
    setResumeError("");
    setResumeInfo("");
    try {
      // ✅ This is Step 3: re-initiate STK using existing endpoint and recovered intent id.
      await initiateSignupPaymentMpesa(regId);

      // Persist so polling/resume works like the old flow
      localStorage.setItem(LS_REG_INTENT, String(regId));
      localStorage.setItem(LS_REG_PAYMETHOD, "MPESA");
      localStorage.setItem(LS_REG_PHONE, phone.trim());
      localStorage.setItem(LS_REG_COUNTRY, countryId || "");

      setPublicPayMethod("MPESA");
      setIntentId(regId);
      setNextAction("PAYMENT_REQUIRED");

      setWaitingPayment(true);
      setStatusText("Mpesa prompt sent. Approve it on your phone. If you didn’t get it, resend.");
      setInfo("Resumed ✅ Waiting for payment confirmation...");
    } catch (e) {
      setResumeError(toText(extractAxiosError(e)));
    } finally {
      setResumeContinueLoading(false);
    }
  }

  async function continueResumeWithPaystack() {
    const regId = getPendingIntentId(resumePending);
    if (!regId) {
      setResumeError("Missing RegistrationIntentId. Please load pending registration again.");
      return;
    }

    // Paystack needs an email. Prefer resumeEmail; fallback to main email.
    const em = String(resumeEmail || email || "").trim().toLowerCase();
    if (!em || !isEmail(em)) {
      setResumeError("Enter a valid email address for Paystack.");
      return;
    }

    setResumeContinueLoading(true);
    setResumeError("");
    setResumeInfo("");
    try {
      // ✅ Reuse existing endpoint as requested
      const res = await api.post("/payments/paystack/initialize", {
        purpose: PAYMENT_PURPOSE_PUBLIC_SIGNUP,
        amount: SIGNUP_FEE_KES,
        currency: "KES",
        email: em,
        registrationIntentId: regId,
      });

      const data = res.data?.data ?? res.data;
      const authorizationUrl =
        data?.authorization_url || data?.authorizationUrl || data?.data?.authorization_url || data?.authorizationUrl;

      if (!authorizationUrl) throw new Error("Paystack initialize did not return authorizationUrl.");

      // Persist like old flow so return handler + polling works
      localStorage.setItem(LS_REG_INTENT, String(regId));
      localStorage.setItem(LS_REG_EMAIL, em);
      localStorage.setItem(LS_REG_PAYMETHOD, "PAYSTACK");
      localStorage.setItem(LS_REG_COUNTRY, countryId || "");

      // keep these if already present; do not overwrite with blanks
      if (username) localStorage.setItem(LS_REG_USERNAME, username.trim());
      if (password) localStorage.setItem(LS_REG_PASSWORD, password);

      // Redirect to Paystack
      window.location.href = authorizationUrl;
    } catch (e) {
      setResumeError(toText(extractAxiosError(e)));
    } finally {
      setResumeContinueLoading(false);
    }
  }
  async function onCreateAccount(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setStatusText("");
    setPaymentInfo(null);

    setRegistrationComplete(false);
    setSuccessMessage("");
    setPostRegisterSetupToken("");

    const ok = validateAll();
    if (!ok) {
      setError("Please fix the highlighted fields and try again.");
      return;
    }

    setLoading(true);
    try {
      const { intentId: createdIntentId, nextAction: action } = await createRegistrationIntentIfNeeded();

      if (action === "PAYMENT_REQUIRED") {
        // Persist intent for BOTH pay methods so user can resume later (old/local)
        localStorage.setItem(LS_REG_INTENT, String(createdIntentId));
        localStorage.setItem(LS_REG_EMAIL, email.trim());
        localStorage.setItem(LS_REG_USERNAME, username.trim());
        localStorage.setItem(LS_REG_PASSWORD, password);
        localStorage.setItem(LS_REG_PAYMETHOD, publicPayMethod);
        localStorage.setItem(LS_REG_PHONE, phoneNumber.trim());
        localStorage.setItem(LS_REG_COUNTRY, countryId || "");

        if (publicPayMethod === "MPESA") {
          setInfo(
            `Signup fee: KES ${SIGNUP_FEE_KES}. If you don’t receive a prompt, use “Resend prompt”. If you can’t pay now, you can close and resume later.`
          );

          try {
            const pay = await initiateSignupPaymentMpesa(createdIntentId);
            const checkoutId = pay?.checkoutRequestId || pay?.CheckoutRequestId;
            if (!checkoutId) {
              throw new Error("Mpesa initiate did not return a checkoutRequestId.");
            }

            setWaitingPayment(true);
            setStatusText("Mpesa prompt sent. Approve it on your phone. If you didn’t get it, resend.");
            return;
          } catch (mpErr) {
            setWaitingPayment(true);
            setStatusText(
              "We could not send the prompt (or it failed). You can resend the prompt after topping up or try again later."
            );
            const msg = toText(extractAxiosError(mpErr));
            setError(toText(msg));
            applyServerFieldHints(msg);
            return;
          }
        }

        setInfo(`Signup fee: KES ${SIGNUP_FEE_KES}. Redirecting to Paystack checkout...`);
        await initiateSignupPaymentPaystack(createdIntentId);
        return;
      }

      await api.post(`/registration/complete/${createdIntentId}`);

      setRegistrationComplete(true);
      setSuccessMessage("Account created successfully. Proceed to set up 2FA.");

      localStorage.setItem(LS_REG_USERNAME, username.trim());
      localStorage.setItem(LS_REG_PASSWORD, password);

      const token = await fetchSetupTokenForOnboarding(username.trim(), password);
      setPostRegisterSetupToken(token);

      nav("/twofactor-setup", {
        replace: true,
        state: { username: username.trim(), password, setupToken: token },
      });
    } catch (e2) {
      const msg = toText(extractAxiosError(e2));
      setError(toText(msg));
      applyServerFieldHints(msg);
    } finally {
      setLoading(false);
    }
  }

  // Resend Mpesa STK prompt (same intent)
  async function resendMpesaPrompt() {
    const useIntent = intentId || Number(localStorage.getItem(LS_REG_INTENT) || 0);
    if (!useIntent) return;

    setError("");
    setInfo("");
    setStatusText("Sending a new Mpesa prompt…");

    try {
      localStorage.setItem(LS_REG_PHONE, phoneNumber.trim());
      localStorage.setItem(LS_REG_COUNTRY, countryId || "");
      localStorage.setItem(LS_REG_PAYMETHOD, "MPESA");

      const pay = await initiateSignupPaymentMpesa(useIntent);
      const checkoutId = pay?.checkoutRequestId || pay?.CheckoutRequestId;
      if (!checkoutId) throw new Error("Mpesa initiate did not return a checkoutRequestId.");

      setWaitingPayment(true);
      setStatusText("New Mpesa prompt sent. Check your phone and approve.");
    } catch (e) {
      setWaitingPayment(true);
      setStatusText("Prompt could not be sent. You can top up and try again, or retry later.");
      const msg = toText(extractAxiosError(e));
      setError(toText(msg));
      applyServerFieldHints(msg);
    }
  }

  function changePhoneAndResend() {
    stopPolling();
    setWaitingPayment(false);
    setStatusText("");
    setInfo(
      "Update your phone number, then click “Resend Mpesa prompt”. Your registration intent is saved — you won’t lose it."
    );
    setError("");
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
    setPostRegisterSetupToken("");

    setFieldErrors({});
    setTouched({});

    localStorage.removeItem(LS_REG_INTENT);
    localStorage.removeItem(LS_REG_EMAIL);
    localStorage.removeItem(LS_REG_USERNAME);
    localStorage.removeItem(LS_REG_PASSWORD);
    localStorage.removeItem(LS_REG_PAYMETHOD);
    localStorage.removeItem(LS_REG_PHONE);
    localStorage.removeItem(LS_REG_COUNTRY);
    localStorage.removeItem(LS_REG_NEXTACTION);
    localStorage.removeItem(LS_RESUME_TOKEN);
    localStorage.removeItem(LS_RESUME_EMAIL);    

    setResumeToken("");
    setResumePending(null);
    setResumeVerified(false);
    setResumeOtpSent(false);
    setResumeCode("");

    // keep existing form values as-is (existing behavior); do not reset unless you already had that elsewhere
  }

    function AuthLeftPanel() {
    return (
      <div className="auth-left-inner">
        <img src="/logo.png" alt="LawAfrica" className="auth-brand" />

        <h1 className="auth-left-title">Digital Platform</h1>
        <p className="auth-left-subtitle">Trusted legal knowledge. Anywhere. Anytime.</p>

        <div className="auth-benefits-card">
          <div className="auth-benefits-title">What you get</div>

          <div className="auth-benefits-list">
            {AUTH_BENEFITS.map((b) => (
              <div key={b.title} className="auth-benefit">
                <div className="auth-benefit-ic">{b.icon}</div>
                <div className="auth-benefit-txt">
                  <div className="auth-benefit-name">{b.title}</div>
                  <div className="auth-benefit-desc">{b.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="auth-benefits-foot">
            Used by courts, law firms, universities, and public institutions.
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------
  // UI helpers (NO inline styles)
  // -----------------------------
  function FieldError({ name }) {
    const msg = fieldErrors?.[name];
    if (!msg || !touched?.[name]) return null;
    return <div className="auth-field-error">{msg}</div>;
  }

  function inputClass(name, base = "") {
    const hasTouched = !!touched?.[name];
    const hasErr = !!fieldErrors?.[name];

    const cls = [base].filter(Boolean);

    if (hasTouched && hasErr) cls.push("la-input-err");
    if (hasTouched && !hasErr) cls.push("la-input-ok");

    return cls.join(" ");
  }

  function Alert({ kind, children }) {
    if (!children) return null;
    const isErr = kind === "error";
    return (
      <div className={`auth-alert ${isErr ? "error" : "ok"}`}>
        <div className="auth-alert-icon" aria-hidden="true">
          {isErr ? "⚠️" : "✅"}
        </div>
        <div className="auth-alert-body">{children}</div>
      </div>
    );
  }

  function StepPill({ text }) {
    return <span className="ra-step-pill">{text}</span>;
  }

function PillChoice({ items, value, onChange, disabled, tone = "default" }) {
  return (
    <div className={`pill-grid tone-${tone}`}>
      {items.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(t.value)}
            className={["pill-btn", active ? "is-active" : ""].join(" ")}
          >
            <div className="pill-top">
              {t.icon && (
                <div className="pill-ic" aria-hidden="true">
                  {t.icon}
                </div>
              )}
              <div className="pill-title">{t.label}</div>
            </div>

            {t.sub && <div className="pill-sub">{t.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

  function RuleItem({ ok, label }) {
    return (
      <div className={`rule-item ${ok ? "ok" : "bad"}`}>
        <span className="rule-dot" aria-hidden="true">
          {ok ? "✓" : "×"}
        </span>
        <span className="rule-text">{label}</span>
      </div>
    );
  }

  function formatDateMaybe(d) {
    if (!d) return "";
    try {
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return String(d);
      return dt.toLocaleString();
    } catch {
      return String(d);
    }
  }

  if (registrationComplete) {
    return (
      <div className="auth-shell">
        <aside className="auth-left">
          <AuthLeftPanel />
        </aside>

        <main className="auth-right">
          <section className="auth-card">
            <h2 className="auth-title">Account created ✅</h2>
            <p className="auth-subtitle">{successMessage || "Next step: complete 2FA setup."}</p>

            <Alert kind="error">{error ? toText(error) : ""}</Alert>
            <Alert kind="ok">{info ? toText(info) : ""}</Alert>

            <div className="auth-actions-row">
              <button
                type="button"
                className="auth-btn auth-btn-primary"
                onClick={() =>
                  nav("/twofactor-setup", {
                    replace: true,
                    state: { username: username.trim(), password, setupToken: postRegisterSetupToken },
                  })
                }
              >
                Continue to 2FA setup →
              </button>

              <button type="button" className="auth-btn auth-btn-dark" onClick={() => nav("/login")}>
                Go to login
              </button>

              <button type="button" className="auth-btn auth-btn-muted" onClick={startOver}>
                Start over
              </button>
            </div>

            {(intentId || nextAction) && (
              <div className="auth-debug">
                Intent: {intentId ? `#${intentId}` : "—"} | Next: {nextAction || "—"}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  const resumeHasPending = getPendingHasPending(resumePending);
  const resumeRegId = getPendingIntentId(resumePending);

return (
  <div className="auth-shell">
    <aside className="auth-left">
      <AuthLeftPanel />
    </aside>

    <main className="auth-right">
      <section className="auth-card">
        <h2 className="auth-title">Create account</h2>

        {/* Existing (old/local resume): unchanged */}
        {resumeAvailable && !waitingPayment && !intentId && (
          <div className="ra-resume-warn">
            <div className="ra-resume-warn-title">You have an unfinished registration.</div>

            <div className="ra-resume-warn-text">
              Intent #{resumeIntentId} {resumePayMethod ? `• Method: ${resumePayMethod}` : ""}. You can resume and complete
              payment now.
            </div>

            <div className="ra-actions">
              <button type="button" onClick={resumeRegistration} className="ra-btn ra-btn-dark">
                Resume registration
              </button>

              <button type="button" onClick={startOver} className="ra-btn ra-btn-gray">
                Discard and start new
              </button>
            </div>
          </div>
        )}

        {/* Resume on any device/browser via Email + OTP */}
        {!waitingPayment && !intentId && (
          <div className="ra-panel">
            <div className="ra-resume-head">
              <div>
                <div className="ra-resume-head-title">Resume signup with Email + Code</div>
                <div className="ra-resume-head-sub">
                  Use this if you switched browser/device, cleared storage, or didn’t finish payment.
                </div>
              </div>

              <button
                type="button"
                className={`ra-btn ${resumeOtpOpen ? "ra-btn-dark" : "ra-btn-red"}`}
                onClick={() => {
                  setResumeOtpOpen((s) => !s);
                  setResumeError("");
                  setResumeInfo("");
                  if (!resumeEmail && email) setResumeEmail(String(email).trim());
                }}
              >
                {resumeOtpOpen ? "Close" : "Resume"}
              </button>
            </div>

            {resumeOtpOpen && (
                <div className="ra-stack ra-mt-12">
                <Alert kind="error">{resumeError ? toText(resumeError) : ""}</Alert>
                <Alert kind="ok">{resumeInfo ? toText(resumeInfo) : ""}</Alert>

                <div className="ra-stack">
                  <div>
                    <label className="field-label">Email used during signup</label>
                    <input
                      className={inputClass("resumeEmail")}
                      value={resumeEmail}
                      onChange={(e) => {
                        const v = e.target.value;
                        setResumeEmail(v);
                        setResumeError("");
                      }}
                      placeholder="e.g. name@example.com"
                      disabled={resumeLoading || resumeContinueLoading}
                    />
                    <div className="ra-help">
                      We’ll send a 6-digit code if an unfinished registration exists for this email.
                    </div>
                  </div>

                  <div className="ra-actions">
                    <button
                      type="button"
                      className={`ra-btn ${resumeCooldown > 0 ? "ra-btn-gray" : "ra-btn-teal"}`}
                      onClick={requestResumeOtp}
                      disabled={resumeLoading || resumeContinueLoading || resumeCooldown > 0}
                    >
                      {resumeLoading ? "Sending..." : resumeOtpSent ? "Resend code" : "Send code"}
                      {resumeCooldown > 0 ? ` (${resumeCooldown}s)` : ""}
                    </button>

                    <button
                      type="button"
                      className="ra-btn ra-btn-gray"
                      onClick={resetResumeOtpUi}
                      disabled={resumeLoading || resumeContinueLoading}
                    >
                      Reset
                    </button>

                    {resumeOtpSent && (
                      <div className="ra-help ra-self-center">
                        Code expires in <strong>{resumeExpires > 0 ? `${Math.ceil(resumeExpires / 60)} min` : "—"}</strong>
                      </div>
                    )}
                  </div>

                  <div className="ra-code-box">
                    <label className="field-label">6-digit code</label>
                    <input
                      className={`ra-code-input ${inputClass("resumeCode")}`}
                      value={resumeCode}
                      onChange={(e) => {
                        const v = String(e.target.value || "").replace(/\D/g, "").slice(0, 6);
                        setResumeCode(v);
                        setResumeError("");
                      }}
                      inputMode="numeric"
                      placeholder="123456"
                      disabled={resumeLoading || resumeContinueLoading || !resumeOtpSent}
                    />

                    <div className="ra-actions ra-items-center">
                      <button
                        type="button"
                        className="ra-btn ra-btn-dark"
                        onClick={verifyResumeOtp}
                        disabled={
                          resumeLoading ||
                          resumeContinueLoading ||
                          !resumeOtpSent ||
                          !/^\d{6}$/.test(String(resumeCode))
                        }
                      >
                        {resumeLoading ? "Verifying..." : "Verify code"}
                      </button>

                      {resumeVerified && (
                          <span className="ra-verified">Verified ✅ (Step 1)</span>
                      )}
                    </div>

                    <div className="ra-actions">
                      <button
                        type="button"
                        className="ra-btn ra-btn-red"
                        onClick={fetchResumePending}
                        disabled={resumeLoading || resumeContinueLoading || !String(resumeToken || "").trim()}
                      >
                        Load pending registration (Step 2)
                      </button>
                    </div>

                    {resumePending && (
                      <div className="ra-pending">
                        <div className="ra-pending-title">Pending registration</div>

                        {(() => {
                          if (!resumeHasPending) {
                            return <div className="ra-text-13">No pending registration found for this email.</div>;
                          }

                          const status = resumePending?.status ?? resumePending?.Status ?? null;
                          const next = resumePending?.nextAction ?? resumePending?.NextAction ?? null;
                          const exp = resumePending?.expiresAt ?? resumePending?.ExpiresAt ?? null;

                          return (
                            <div className="ra-pending-grid">
                              <div>
                                <strong>Intent:</strong> #{resumeRegId ?? "—"}
                              </div>
                              <div>
                                <strong>Status:</strong> {status ?? "—"}
                              </div>
                              <div>
                                <strong>Next action:</strong> {next ?? "—"}
                              </div>
                              <div>
                                <strong>Expires:</strong> {exp ? formatDateMaybe(exp) : "—"}
                              </div>

                              <div className="ra-actions">
                                <button
                                  type="button"
                                  className="ra-btn ra-btn-teal"
                                  onClick={continueResumeWithMpesa}
                                  disabled={resumeContinueLoading}
                                >
                                  {resumeContinueLoading ? "Working..." : "Continue with Mpesa"}
                                </button>

                                <button
                                  type="button"
                                  className="ra-btn ra-btn-dark"
                                  onClick={continueResumeWithPaystack}
                                  disabled={resumeContinueLoading}
                                >
                                  {resumeContinueLoading ? "Working..." : "Continue with Paystack"}
                                </button>
                              </div>

                              <div className="ra-pending-note">
                                Mpesa will send an STK prompt. Paystack will redirect you to checkout.
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

          <p className="subtitle">
            {isPublic
              ? `Public signup requires a one-time fee of KES ${SIGNUP_FEE_KES}.`
              : "Institution users can sign up here. Choose Student or Staff to allocate the correct seat type."}
          </p>

          <Alert kind="error">{error ? toText(error) : ""}</Alert>
          <Alert kind="ok">{info ? toText(info) : ""}</Alert>
          {isPublic && (
            <div className="ra-fee">
              <div className="ra-fee-row">
                <div className="ra-fee-amount">
                  Signup fee: <span className="ra-fee-accent">KES {SIGNUP_FEE_KES}</span>
                </div>
                <div className="ra-fee-steps">
                  <StepPill text="1) Create intent" />
                  <StepPill text="2) Pay" />
                  <StepPill text="3) Auto-confirm" />
                </div>
              </div>

              <div className="ra-fee-desc">
                {publicPayMethod === "MPESA" ? (
                  <>
                    We’ll send an <b>Mpesa STK push</b>. If you don’t receive it or you can’t pay now, you can resend or resume
                    later.
                  </>
                ) : (
                  <>
                    You’ll be redirected to <b>Paystack checkout</b>, then returned here to finalize your account.
                  </>
                )}
              </div>
            </div>
          )}

          <form onSubmit={onCreateAccount}>
            <div className="auth-section-head">
              <label className="field-label">Account Type</label>
              <div className="auth-section-line" />
            </div>

            <div className="ra-mb-14">
              <PillChoice
                items={USER_TYPES}
                value={userType}
                onChange={(v) => {
                  setUserType(v);
                  setError("");
                  setInfo("");
                }}
                disabled={waitingPayment}
                tone="account"
              />
            </div>
            
            {isPublic && (
              <>
                <div className="auth-section-head">
                  <label className="field-label">Payment Method</label>
                  <div className="auth-section-line" />
                </div>

                <div className="ra-mb-14">
                <PillChoice
                  tone="payment"
                  items={PUBLIC_PAY_METHODS}
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
                className={inputClass("firstName")}
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  liveValidate("firstName", e.target.value);
                }}
                onBlur={(e) => {
                  markTouched("firstName");
                  const msg = validateField("firstName", e.target.value);
                  msg ? setFieldError("firstName", msg) : clearFieldError("firstName");
                }}
                disabled={lockForm}
                aria-invalid={!!(touched.firstName && fieldErrors.firstName)}
              />
                <FieldError name="firstName" />
              </div>

              <div>
                <label className="field-label">Last Name</label>
                <input
                  className={inputClass("lastName")}
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    liveValidate("lastName", e.target.value);
                  }}
                  onBlur={(e) => {
                    markTouched("lastName");
                    const msg = validateField("lastName", e.target.value);
                    msg ? setFieldError("lastName", msg) : clearFieldError("lastName");
                  }}
                  disabled={lockForm}
                  aria-invalid={!!(touched.lastName && fieldErrors.lastName)}
                />
                <FieldError name="lastName" />
              </div>
            </div>

            <label className="field-label">Username</label>
              <input
                className={inputClass("username")}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  liveValidate("username", e.target.value);
                }}
                onBlur={(e) => {
                  markTouched("username");
                  const trimmed = e.target.value.trim();
                  if (trimmed !== e.target.value) setUsername(trimmed);
                  const msg = validateField("username", trimmed);
                  msg ? setFieldError("username", msg) : clearFieldError("username");
                }}
                disabled={lockForm}
                placeholder="e.g. d.ochieno"
                aria-invalid={!!(touched.username && fieldErrors.username)}
              />
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
              Letters only. Dots allowed between letter groups (e.g. <code>d.ochieno</code>). No numbers/spaces, no
              leading/trailing dots, no consecutive dots.
            </div>
            <FieldError name="username" />

            <label className="field-label">Email</label>
            <input
              className={inputClass("email")}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                liveValidate("email", e.target.value);
              }}
              onBlur={(e) => {
                markTouched("email");
                const msg = validateField("email", e.target.value);
                msg ? setFieldError("email", msg) : clearFieldError("email");
              }}
              disabled={lockForm}
              aria-invalid={!!(touched.email && fieldErrors.email)}
            />
            <FieldError name="email" />

            {!isPublic && selectedInstitution?.emailDomain && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                Your institution domain: <strong>@{selectedInstitution.emailDomain}</strong>
              </div>
            )}

            <div className="grid-2">
              <div>
                <label className="field-label">
                  Phone {isPublic ? (publicPayMethod === "MPESA" ? "(required for Mpesa)" : "(optional)") : "(optional)"}
                </label>
                <input
                  className={inputClass("phoneNumber")}
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    liveValidate("phoneNumber", e.target.value);
                  }}
                  onBlur={(e) => {
                    markTouched("phoneNumber");
                    const msg = validateField("phoneNumber", e.target.value);
                    msg ? setFieldError("phoneNumber", msg) : clearFieldError("phoneNumber");
                  }}
                  disabled={lockForm && !(waitingPayment && publicPayMethod === "MPESA")}
                  placeholder={isPublic && publicPayMethod === "MPESA" ? "e.g. 2547XXXXXXXX or 07XXXXXXXX" : "Optional"}
                  aria-invalid={!!(touched.phoneNumber && fieldErrors.phoneNumber)}
                />
                <FieldError name="phoneNumber" />
              </div>

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
            </div>

            {!isPublic && (
              <>
                <div className="divider" />
                <h3 className="section-title">Institution Details</h3>

                <label className="field-label">Institution (required)</label>
                {institutionsLoadFailed ? (
                  <div style={{ fontSize: 13, color: "#991b1b", marginBottom: 8 }}>
                    Could not load institutions. Please refresh the page.
                  </div>
                ) : (
                    <select
                      className={inputClass("institutionId")}
                      value={institutionId}
                      onChange={(e) => {
                        setInstitutionId(e.target.value);
                        liveValidate("institutionId", e.target.value);
                        clearFieldError("institutionId");
                      }}
                      onBlur={(e) => {
                        markTouched("institutionId");
                        const msg = validateField("institutionId", e.target.value);
                        msg ? setFieldError("institutionId", msg) : clearFieldError("institutionId");
                      }}
                      disabled={lockForm}
                      aria-invalid={!!(touched.institutionId && fieldErrors.institutionId)}
                    >
                    <option value="">Select institution</option>
                    {institutions
                      .filter((i) => i.isActive !== false)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                  </select>
                )}
                <FieldError name="institutionId" />

                <label className="field-label" style={{ marginTop: 12 }}>
                  Member Type (required)
                </label>
                <div style={{ marginBottom: 10 }}>
                  <PillChoice
                    items={INSTITUTION_MEMBER_TYPES}
                    value={institutionMemberType}
                    onChange={(v) => {
                      setInstitutionMemberType(v);
                      clearFieldError("institutionMemberType");
                    }}
                    disabled={lockForm}
                  />
                </div>
                <div style={{ display: "none" }}>{touched.institutionMemberType}</div>
                <FieldError name="institutionMemberType" />

                {/* ✅ Reference Number + Access Code on same row */}
                <div className="grid-2" style={{ marginTop: 10 }}>
                  <div>
                    <label className="field-label">Reference Number (required)</label>
                  <input
                    className={inputClass("referenceNumber")}
                    value={referenceNumber}
                    onChange={(e) => {
                      setReferenceNumber(e.target.value);
                      liveValidate("referenceNumber", e.target.value);
                    }}
                    onBlur={(e) => {
                      markTouched("referenceNumber");
                      const msg = validateField("referenceNumber", e.target.value);
                      msg ? setFieldError("referenceNumber", msg) : clearFieldError("referenceNumber");
                    }}
                    disabled={lockForm}
                    placeholder="e.g. Student/Staff number"
                    aria-invalid={!!(touched.referenceNumber && fieldErrors.referenceNumber)}
                  />
                    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                      Required for institution registrations (Student/Staff). Public users won’t see or use this field.
                    </div>
                    <FieldError name="referenceNumber" />
                  </div>

                  <div>
                    {selectedInstitution?.accessCodeRequired !== false ? (
                      <>
                        <label className="field-label">Institution Access Code (required)</label>
                        <input
                          className={inputClass("institutionAccessCode")}
                          value={institutionAccessCode}
                          onChange={(e) => {
                            setInstitutionAccessCode(e.target.value);
                            liveValidate("institutionAccessCode", e.target.value);
                          }}
                          onBlur={(e) => {
                            markTouched("institutionAccessCode");
                            const msg = validateField("institutionAccessCode", e.target.value);
                            msg ? setFieldError("institutionAccessCode", msg) : clearFieldError("institutionAccessCode");
                          }}
                          disabled={lockForm}
                          placeholder="Enter access code provided by your institution"
                          aria-invalid={!!(touched.institutionAccessCode && fieldErrors.institutionAccessCode)}
                        />
                        <FieldError name="institutionAccessCode" />
                      </>
                    ) : (
                      <>
                        <label className="field-label">Institution Access Code (not required)</label>
                        <input value="Not required for this institution" disabled style={{ opacity: 0.85 }} />
                        <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                          Your institution does not require an access code for signup.
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="divider" />
            {/* ✅ Removed the "Password" section title as requested */}

            <div className="grid-2">
              <div>
                <label className="field-label">Password</label>
                <input
                  className={inputClass("password")}
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    liveValidate("password", e.target.value);

                    if (touched.confirmPassword) {
                      const msg = validateField("confirmPassword", confirmPassword);
                      msg ? setFieldError("confirmPassword", msg) : clearFieldError("confirmPassword");
                    }
                  }}
                  onBlur={(e) => {
                    markTouched("password");
                    const msg = validateField("password", e.target.value);
                    msg ? setFieldError("password", msg) : clearFieldError("password");
                  }}
                  disabled={lockForm}
                  aria-invalid={!!(touched.password && fieldErrors.password)}
                />

              <div className="rules-grid">
                <RuleItem ok={passwordRules.min8} label="8+ chars" />
                <RuleItem ok={passwordRules.hasUpper} label="Uppercase" />
                <RuleItem ok={passwordRules.hasLower} label="Lowercase" />
                <RuleItem ok={passwordRules.hasNumber} label="Number" />
                <RuleItem ok={passwordRules.hasSpecial} label="Special" />
              </div>

                <FieldError name="password" />
              </div>

              <div>
                <label className="field-label">Confirm Password</label>
                  <input
                    className={inputClass("confirmPassword")}
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      liveValidate("confirmPassword", e.target.value);
                    }}
                    onBlur={(e) => {
                      markTouched("confirmPassword");
                      const msg = validateField("confirmPassword", e.target.value);
                      msg ? setFieldError("confirmPassword", msg) : clearFieldError("confirmPassword");
                    }}
                    disabled={lockForm}
                    aria-invalid={!!(touched.confirmPassword && fieldErrors.confirmPassword)}
                  />
                <FieldError name="confirmPassword" />
              </div>
            </div>

            <button type="submit" disabled={lockForm || !isFormValidForSubmit}>
              {loading
                ? isPublic
                  ? publicPayMethod === "MPESA"
                    ? "Sending Mpesa prompt..."
                    : "Redirecting to Paystack..."
                  : "Creating account..."
                : waitingPayment
                ? "Finalizing payment..."
                : isPublic
                ? publicPayMethod === "MPESA"
                  ? `Pay (KES ${SIGNUP_FEE_KES}) & Create Account`
                  : `Go to Paystack (KES ${SIGNUP_FEE_KES})`
                : "Create Account"}
            </button>

            {!lockForm && !isFormValidForSubmit && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                Complete the required fields (including valid username + password) to continue.
              </div>
            )}

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
                <div style={{ fontWeight: 950, marginBottom: 6 }}>{statusText || "Waiting for payment..."}</div>

                <div style={{ fontSize: 13, color: "#155e75", display: "grid", gap: 6 }}>
                  <div>We auto-refresh every 5 seconds.</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <StepPill text="Approve payment" />
                    <StepPill text="We confirm" />
                    <StepPill text="Account created" />
                    <StepPill text="Setup 2FA" />
                  </div>
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
                    style={{ width: "auto", padding: "10px 14px", borderRadius: 12 }}
                    onClick={() => {
                      const stored = localStorage.getItem(LS_REG_INTENT);
                      const useIntent = intentId || (stored ? Number(stored) : null);
                      checkIntentStatus(useIntent);
                    }}
                    disabled={loading}
                  >
                    I’ve paid — Check status
                  </button>

                  {isPublic && publicPayMethod === "MPESA" && (
                    <>
                      <button
                        type="button"
                        style={{
                          width: "auto",
                          padding: "10px 14px",
                          borderRadius: 12,
                          background: "#0f766e",
                          color: "white",
                        }}
                        onClick={resendMpesaPrompt}
                        disabled={loading}
                      >
                        Resend Mpesa prompt
                      </button>

                      <button
                        type="button"
                        style={{
                          width: "auto",
                          padding: "10px 14px",
                          borderRadius: 12,
                          background: "#111827",
                          color: "white",
                        }}
                        onClick={changePhoneAndResend}
                        disabled={loading}
                      >
                        Change phone & resend
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    style={{
                      width: "auto",
                      padding: "10px 14px",
                      background: "#6b7280",
                      color: "white",
                      borderRadius: 12,
                    }}
                    onClick={startOver}
                  >
                    Start over
                  </button>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: "#155e75" }}>
                  If you can’t pay now, you can close this page. When you come back, click <b>Resume registration</b>.
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
      </section>
    </main>
  </div>
);
}
