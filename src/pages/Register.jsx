// src/pages/Register.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../api/client.js";
import "../styles/register.css";

const SIGNUP_FEE_KES = 10;
const PAYMENT_PURPOSE_PUBLIC_SIGNUP = "PublicSignupFee";

const USER_TYPES = [
  { value: "Public", label: "Individual (Public)", sub: "Pay once, access free content and your purchases" },
  { value: "Institution", label: "Institution User", sub: "Use your institution email & access code" },
];

const INSTITUTION_MEMBER_TYPES = [
  { value: "Student", label: "Student", sub: "Learner / enrollee" },
  { value: "Staff", label: "Staff", sub: "Employee / lecturer" },
];

const USERNAME_REGEX = /^[A-Za-z]+(\.[A-Za-z]+)*$/;

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

// localStorage keys for resuming after leaving (old/local resume)
const LS_REG_INTENT = "la_reg_intent_id";
const LS_REG_EMAIL = "la_reg_email";
const LS_REG_USERNAME = "la_reg_username";
const LS_REG_PASSWORD = "la_reg_password";

// remember how the user was paying + phone/country for better resume UX
const LS_REG_PAYMETHOD = "la_reg_pay_method"; // MPESA | PAYSTACK
const LS_REG_PHONE = "la_reg_phone";
const LS_REG_COUNTRY = "la_reg_country";

// ✅ NEW (Option 2): resume with email + OTP (works across browsers/devices)
const LS_RESUME_TOKEN = "la_resume_token";
const LS_RESUME_EMAIL = "la_resume_email";

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

  const [institutions, setInstitutions] = useState([]);
  const [institutionsLoadFailed, setInstitutionsLoadFailed] = useState(false);

  const selectedInstitution = useMemo(() => {
    if (!institutionId) return null;
    return institutions.find((i) => String(i.id) === String(institutionId)) || null;
  }, [institutionId, institutions]);

  // Password
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

  // ✅ NEW (Option 2): Resume-with-OTP UI state (single screen: request OTP → enter OTP → verify)
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
  const [resumeToken, setResumeToken] = useState(() => localStorage.getItem(LS_RESUME_TOKEN) || "");
  const [resumePending, setResumePending] = useState(null); // Step 2 data from /pending

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
  // kept (in case you use it later)
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

  // -----------------------------
  // Load institutions
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
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.institutionId;
        delete next.institutionMemberType;
        delete next.institutionAccessCode;
        return next;
      });
    }
  }, [isPublic]);

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

  function validateField(name, value) {
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

    if (name === "password") {
      if (!v) return "Password is required.";
      const rules = getPasswordRules(v);
      const ok = Object.values(rules).every(Boolean);
      if (!ok)
        return "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.";
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
    }

    for (const n of requiredNames) {
      const value =
        n === "firstName"
          ? firstName
          : n === "lastName"
          ? lastName
          : n === "username"
          ? username
          : n === "email"
          ? email
          : n === "password"
          ? password
          : n === "confirmPassword"
          ? confirmPassword
          : n === "phoneNumber"
          ? phoneNumber
          : n === "institutionId"
          ? institutionId
          : n === "institutionMemberType"
          ? institutionMemberType
          : n === "institutionAccessCode"
          ? institutionAccessCode
          : "";

      if (validateField(n, value)) return false;
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
    isPublic,
    publicPayMethod,
    selectedInstitution,
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

      institutionAccessCode: !isPublic ? institutionAccessCode.trim().toUpperCase() : null,
      userType,
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

  // Handle Paystack return
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const paid = (qs.get("paid") || "").trim();
    if (paid !== "1") return;

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
  // NEW (Step 1): Resume with Email + OTP (single screen)
  // -----------------------------
  async function requestResumeOtp() {
    const em = String(resumeEmail || "").trim().toLowerCase();

    setResumeError("");
    setResumeInfo("");
    setResumeVerified(false);
    // Do not clear resumeToken if it exists; user may be resuming again
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

      // Backend now sends OTP only if there is a pending intent (but still returns 200 always).
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

      // store token for Step 2/3
      if (token) localStorage.setItem(LS_RESUME_TOKEN, token);
      localStorage.setItem(LS_RESUME_EMAIL, em);

      // Keep the server-returned "pending" (might be the DTO object)
      setResumePending(pending);

      if (pending?.hasPending === false || pending?.HasPending === false) {
        setResumeInfo("Verified ✅ We couldn’t find an unfinished registration for this email.");
      } else {
        setResumeInfo("Verified ✅ Now click “Proceed to Step 2” to load your pending registration.");
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

  // -----------------------------
  // ✅ NEW: Step 2 (pending) - GET /registration/resume/pending with X-Resume-Token
  // -----------------------------
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

      // backend returns: { hasPending: bool, registrationIntentId, status, expiresAt, nextAction }
      setResumePending(data);

      if (!data?.hasPending) {
        setResumeInfo("No pending registration found for this verified session.");
      } else {
        setResumeInfo("Pending registration loaded ✅ You can continue in the next step.");
      }
    } catch (e) {
      setResumeError(toText(extractAxiosError(e)));
    } finally {
      setResumeLoading(false);
    }
  }

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
            setError(toText(extractAxiosError(mpErr)));
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
      setError(toText(extractAxiosError(e2)));
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
      setError(toText(extractAxiosError(e)));
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
  }

  // -----------------------------
  // UI helpers
  // -----------------------------
  function FieldError({ name }) {
    const msg = fieldErrors?.[name];
    if (!msg || !touched?.[name]) return null;
    return <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>{msg}</div>;
  }

  function inputStyle(name) {
    if (touched?.[name] && fieldErrors?.[name]) {
      return { borderColor: "#ef4444", outlineColor: "#ef4444" };
    }
    if (touched?.[name] && !fieldErrors?.[name]) {
      return { borderColor: "#22c55e", outlineColor: "#22c55e" };
    }
    return undefined;
  }

  function PillChoice({ items, value, onChange, disabled, tone = "default" }) {
    const accent = tone === "payment" ? "#0f766e" : "#8b1c1c";
    const activeBg = tone === "payment" ? "#ecfeff" : "#fff1f2";

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
                padding: "12px 14px",
                borderRadius: 16,
                border: active ? `2px solid ${accent}` : "1px solid #e5e7eb",
                background: active ? activeBg : "white",
                color: "#111827",
                fontWeight: 900,
                cursor: disabled ? "not-allowed" : "pointer",
                flex: "1 1 240px",
                textAlign: "left",
                boxShadow: active ? "0 10px 22px rgba(0,0,0,0.06)" : "none",
              }}
            >
              <div style={{ fontSize: 14 }}>{t.label}</div>
              {t.sub && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280", fontWeight: 650, lineHeight: 1.3 }}>
                  {t.sub}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  function Alert({ kind, children }) {
    if (!children) return null;

    const isErr = kind === "error";
    const bg = isErr ? "#fef2f2" : "#ecfdf5";
    const border = isErr ? "#fecaca" : "#a7f3d0";
    const color = isErr ? "#991b1b" : "#065f46";
    const icon = isErr ? "⚠️" : "✅";

    return (
      <div
        className={isErr ? "error-box" : "success-box"}
        style={{
          background: bg,
          border: `1px solid ${border}`,
          color,
          padding: "12px 12px",
          borderRadius: 12,
          whiteSpace: "pre-wrap",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 16, lineHeight: 1 }}>{icon}</div>
        <div style={{ flex: 1 }}>{children}</div>
      </div>
    );
  }

  function StepPill({ text }) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "6px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 800,
          background: "#f3f4f6",
          color: "#374151",
        }}
      >
        {text}
      </span>
    );
  }

  function RuleItem({ ok, label }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: ok ? "#065f46" : "#6b7280" }}>
        <span aria-hidden="true">{ok ? "✅" : "❌"}</span>
        <span>{label}</span>
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

  // -----------------------------
  // SUCCESS SCREEN (unchanged)
  // -----------------------------
  if (registrationComplete) {
    return (
      <div className="register-layout">
        <div className="register-info-panel" style={{ flex: "0 0 40%" }}>
          <img src="/logo.png" alt="LawAfrica" className="register-brand-logo" />
          <h1>Account created ✅</h1>
          <p className="register-tagline">Next step: complete 2FA setup.</p>

          <ul className="register-benefits">
            <li>✔ Check your email for the 2FA setup QR/setup instructions</li>
            <li>✔ Add LawAfrica to your Authenticator app</li>
            <li>✔ Verify using setup token + 6-digit code</li>
          </ul>
        </div>

        <div className="register-form-panel" style={{ flex: "1 1 60%" }}>
          <div className="register-card">
            <h2>Proceed to 2FA setup</h2>
            <p className="subtitle">{successMessage || "Your account is ready. Continue to set up 2FA."}</p>

            <Alert kind="error">{error ? toText(error) : ""}</Alert>
            <Alert kind="ok">{info ? toText(info) : ""}</Alert>

            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() =>
                  nav("/twofactor-setup", {
                    replace: true,
                    state: { username: username.trim(), password, setupToken: postRegisterSetupToken },
                  })
                }
                style={{
                  width: "auto",
                  padding: "10px 14px",
                  background: "#8b1c1c",
                  color: "white",
                  borderRadius: 12,
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
                  borderRadius: 12,
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
                  borderRadius: 12,
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
            Use your institution email and complete signup securely.
            <br />
            <strong>Institution access code is required for security.</strong>
          </p>
        )}

        <ul className="register-benefits">
          <li>✔ Secure signup via registration intent</li>
          <li>✔ 2FA setup after account creation</li>
          <li>✔ Institution memberships can be managed by your admin</li>
        </ul>
      </div>

      <div className="register-form-panel" style={{ flex: "1 1 60%" }}>
        <div className="register-card" style={{ borderRadius: 18 }}>
          <h2>Sign up</h2>

          {/* Existing (old/local resume): unchanged */}
          {resumeAvailable && !waitingPayment && !intentId && (
            <div
              style={{
                marginBottom: 12,
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid #fde68a",
                background: "#fffbeb",
                color: "#92400e",
              }}
            >
              <div style={{ fontWeight: 900 }}>You have an unfinished registration.</div>
              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.35 }}>
                Intent #{resumeIntentId} {resumePayMethod ? `• Method: ${resumePayMethod}` : ""}. You can resume and
                complete payment now.
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={resumeRegistration}
                  style={{ width: "auto", padding: "10px 14px", borderRadius: 12, background: "#92400e", color: "white" }}
                >
                  Resume registration
                </button>
                <button
                  type="button"
                  onClick={startOver}
                  style={{ width: "auto", padding: "10px 14px", borderRadius: 12, background: "#6b7280", color: "white" }}
                >
                  Discard and start new
                </button>
              </div>
            </div>
          )}

          {/* NEW: Resume on any device/browser via Email + OTP */}
          {!waitingPayment && !intentId && (
            <div
              style={{
                marginBottom: 12,
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                background: "linear-gradient(180deg, #ffffff 0%, #fafafa 100%)",
                padding: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 950, color: "#111827" }}>Resume signup with Email + Code</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#6b7280", lineHeight: 1.35 }}>
                    Use this if you switched browser/device, cleared storage, or didn’t finish payment.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setResumeOtpOpen((s) => !s);
                    setResumeError("");
                    setResumeInfo("");
                    if (!resumeEmail && email) setResumeEmail(String(email).trim());
                  }}
                  style={{
                    width: "auto",
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: resumeOtpOpen ? "#111827" : "#8b1c1c",
                    color: "white",
                    fontWeight: 900,
                  }}
                >
                  {resumeOtpOpen ? "Close" : "Resume"}
                </button>
              </div>

              {resumeOtpOpen && (
                <div style={{ marginTop: 12 }}>
                  <Alert kind="error">{resumeError ? toText(resumeError) : ""}</Alert>
                  <Alert kind="ok">{resumeInfo ? toText(resumeInfo) : ""}</Alert>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div>
                      <label className="field-label">Email used during signup</label>
                      <input
                        value={resumeEmail}
                        onChange={(e) => {
                          const v = e.target.value;
                          setResumeEmail(v);
                          setResumeError("");
                        }}
                        placeholder="e.g. name@example.com"
                        disabled={resumeLoading}
                      />
                      <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                        We’ll send a 6-digit code if an unfinished registration exists for this email.
                      </div>
                    </div>

                    {/* Request OTP */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={requestResumeOtp}
                        disabled={resumeLoading || resumeCooldown > 0}
                        style={{
                          width: "auto",
                          padding: "10px 14px",
                          borderRadius: 12,
                          background: resumeCooldown > 0 ? "#9ca3af" : "#0f766e",
                          color: "white",
                          fontWeight: 950,
                        }}
                      >
                        {resumeLoading ? "Sending..." : resumeOtpSent ? "Resend code" : "Send code"}
                        {resumeCooldown > 0 ? ` (${resumeCooldown}s)` : ""}
                      </button>

                      <button
                        type="button"
                        onClick={resetResumeOtpUi}
                        disabled={resumeLoading}
                        style={{
                          width: "auto",
                          padding: "10px 14px",
                          borderRadius: 12,
                          background: "#6b7280",
                          color: "white",
                          fontWeight: 900,
                        }}
                      >
                        Reset
                      </button>

                      {resumeOtpSent && (
                        <div style={{ alignSelf: "center", fontSize: 12, color: "#6b7280" }}>
                          Code expires in <strong>{resumeExpires > 0 ? `${Math.ceil(resumeExpires / 60)} min` : "—"}</strong>
                        </div>
                      )}
                    </div>

                    {/* Enter + Verify OTP (same screen) */}
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid #e5e7eb",
                        background: "#ffffff",
                      }}
                    >
                      <label className="field-label">6-digit code</label>
                      <input
                        value={resumeCode}
                        onChange={(e) => {
                          const v = String(e.target.value || "").replace(/\D/g, "").slice(0, 6);
                          setResumeCode(v);
                          setResumeError("");
                        }}
                        inputMode="numeric"
                        placeholder="123456"
                        disabled={resumeLoading || !resumeOtpSent}
                        style={{
                          textAlign: "center",
                          letterSpacing: "6px",
                          fontWeight: 950,
                          fontSize: 18,
                        }}
                      />

                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={verifyResumeOtp}
                          disabled={resumeLoading || !resumeOtpSent || !/^\d{6}$/.test(String(resumeCode))}
                          style={{
                            width: "auto",
                            padding: "10px 14px",
                            borderRadius: 12,
                            background: "#111827",
                            color: "white",
                            fontWeight: 950,
                          }}
                        >
                          {resumeLoading ? "Verifying..." : "Verify code"}
                        </button>

                        {resumeVerified && (
                          <span style={{ fontSize: 13, color: "#065f46", fontWeight: 900 }}>Verified ✅ (Step 1)</span>
                        )}
                      </div>

                      {/* ✅ NEW: Proceed to Step 2 button */}
                      {resumeVerified && (
                        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={fetchResumePending}
                            disabled={resumeLoading || !String(resumeToken || "").trim()}
                            style={{
                              width: "auto",
                              padding: "10px 14px",
                              borderRadius: 12,
                              background: "#8b1c1c",
                              color: "white",
                              fontWeight: 950,
                            }}
                          >
                            Proceed to Step 2 → Load pending registration
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              // convenience: keep token but clear pending display
                              setResumePending(null);
                              setResumeInfo("Pending view cleared. You can load again when ready.");
                              setResumeError("");
                            }}
                            disabled={resumeLoading}
                            style={{
                              width: "auto",
                              padding: "10px 14px",
                              borderRadius: 12,
                              background: "#6b7280",
                              color: "white",
                              fontWeight: 900,
                            }}
                          >
                            Clear pending view
                          </button>
                        </div>
                      )}

                      {/* ✅ NEW: show pending details on the same page */}
                      {resumeVerified && resumePending && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 14,
                            border: "1px solid #dbeafe",
                            background: "#eff6ff",
                            color: "#1e3a8a",
                          }}
                        >
                          <div style={{ fontWeight: 950, marginBottom: 6 }}>Pending registration (Step 2)</div>

                          {/* Handles both shapes:
                              - verify-otp response DTO: { HasPending, RegistrationIntentId, Status, ExpiresAt, NextAction }
                              - pending endpoint: { hasPending, registrationIntentId, status, expiresAt, nextAction }
                          */}
                          {(() => {
                            const hasPending =
                              resumePending?.hasPending ?? resumePending?.HasPending ?? resumePending?.pending?.hasPending ?? false;

                            const regId =
                              resumePending?.registrationIntentId ?? resumePending?.RegistrationIntentId ?? resumePending?.pending?.registrationIntentId;

                            const status = resumePending?.status ?? resumePending?.Status ?? resumePending?.pending?.status;
                            const next = resumePending?.nextAction ?? resumePending?.NextAction ?? resumePending?.pending?.nextAction;
                            const exp = resumePending?.expiresAt ?? resumePending?.ExpiresAt ?? resumePending?.pending?.expiresAt;

                            if (!hasPending) {
                              return <div style={{ fontSize: 13 }}>No pending registration found for this email.</div>;
                            }

                            return (
                              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                <div>
                                  <strong>Intent:</strong> #{regId ?? "—"}
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
                                <div style={{ marginTop: 6, fontSize: 12, color: "#1f2937" }}>
                                  Step 3 will use this intent to continue payment (Mpesa/Paystack) or complete creation for
                                  institution users — we’ll wire that next.
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
            <div
              style={{
                marginBottom: 14,
                background: "#f0f9ff",
                border: "1px solid #bae6fd",
                color: "#0c4a6e",
                padding: "12px 12px",
                borderRadius: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 950 }}>
                  Signup fee: <span style={{ color: "#0f766e" }}>KES {SIGNUP_FEE_KES}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <StepPill text="1) Create intent" />
                  <StepPill text="2) Pay" />
                  <StepPill text="3) Auto-confirm" />
                </div>
              </div>

              <div style={{ marginTop: 6, fontSize: 13, color: "#075985" }}>
                {publicPayMethod === "MPESA" ? (
                  <>
                    We’ll send an <b>Mpesa STK push</b>. If you don’t receive it or you can’t pay now, you can resend or
                    resume later.
                  </>
                ) : (
                  <>
                    You’ll be redirected to <b>Paystack checkout</b>, then returned here to finalize your account.
                  </>
                )}
              </div>
            </div>
          )}

          {/* ---- Existing signup form continues below (unchanged) ---- */}
          <form onSubmit={onCreateAccount}>
            <label className="field-label">Account Type</label>
            <div style={{ marginBottom: 14 }}>
              <PillChoice
                items={USER_TYPES}
                value={userType}
                onChange={(v) => {
                  setUserType(v);
                  setError("");
                  setInfo("");
                }}
                disabled={waitingPayment}
              />
            </div>

            {isPublic && (
              <>
                <label className="field-label">Payment Method</label>
                <div style={{ marginBottom: 14 }}>
                  <PillChoice
                    tone="payment"
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
                  style={inputStyle("firstName")}
                  aria-invalid={!!(touched.firstName && fieldErrors.firstName)}
                />
                <FieldError name="firstName" />
              </div>

              <div>
                <label className="field-label">Last Name</label>
                <input
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
                  style={inputStyle("lastName")}
                  aria-invalid={!!(touched.lastName && fieldErrors.lastName)}
                />
                <FieldError name="lastName" />
              </div>
            </div>

            <label className="field-label">Username</label>
            <input
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
              style={inputStyle("username")}
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
              style={inputStyle("email")}
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
                  style={inputStyle("phoneNumber")}
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
                    value={institutionId}
                    onChange={(e) => {
                      setInstitutionId(e.target.value);
                      liveValidate("institutionId", e.target.value);
                      clearFieldError("institutionId");
                      clearFieldError("institutionAccessCode");
                      clearFieldError("email");
                    }}
                    onBlur={(e) => {
                      markTouched("institutionId");
                      const msg = validateField("institutionId", e.target.value);
                      msg ? setFieldError("institutionId", msg) : clearFieldError("institutionId");
                    }}
                    disabled={lockForm}
                    style={inputStyle("institutionId")}
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

                {selectedInstitution?.accessCodeRequired !== false && (
                  <>
                    <label className="field-label" style={{ marginTop: 10 }}>
                      Institution Access Code (required)
                    </label>
                    <input
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
                      style={inputStyle("institutionAccessCode")}
                      placeholder="Enter access code provided by your institution"
                      aria-invalid={!!(touched.institutionAccessCode && fieldErrors.institutionAccessCode)}
                    />
                    <FieldError name="institutionAccessCode" />
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
                  style={inputStyle("password")}
                  aria-invalid={!!(touched.password && fieldErrors.password)}
                />

                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid #e5e7eb",
                    background: "#fafafa",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <RuleItem ok={passwordRules.min8} label="At least 8 characters" />
                  <RuleItem ok={passwordRules.hasUpper} label="Contains an uppercase letter (A–Z)" />
                  <RuleItem ok={passwordRules.hasLower} label="Contains a lowercase letter (a–z)" />
                  <RuleItem ok={passwordRules.hasNumber} label="Contains a number (0–9)" />
                  <RuleItem ok={passwordRules.hasSpecial} label="Contains a special character (e.g. !@#)" />
                </div>

                <FieldError name="password" />
              </div>

              <div>
                <label className="field-label">Confirm Password</label>
                <input
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
                  style={inputStyle("confirmPassword")}
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
        </div>
      </div>
    </div>
  );
}
