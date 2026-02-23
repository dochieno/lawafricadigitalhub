// src/pages/dashboard/lawyers/LawyerApply.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";

import {
  getMyLawyerProfile,
  upsertMyLawyerProfile,
  lookupPracticeAreas,
  lookupTowns,
  lookupCourts,
  lookupServices,

  // ✅ NEW: attachments
  listMyLawyerDocuments,
  uploadMyLawyerDocument,
  deleteMyLawyerDocument,
} from "../../../api/lawyers";

import "../../../styles/explore.css";
import "../../../styles/lawyersDropdown.css";

function formatErr(e) {
  return e?.response?.data?.message || e?.message || "Something went wrong.";
}

function normalizeCountry(c) {
  const id = c?.id ?? c?.Id ?? 0;
  const name = c?.name ?? c?.Name ?? "";
  return { id: Number(id), name: String(name || "") };
}

function uniqById(list) {
  const seen = new Set();
  const out = [];
  for (const x of list || []) {
    if (!x || !x.id) continue;
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

function toNumOrNull(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------
   Small inline icons
--------------------------- */
function SmallIcon({ children }) {
  return (
    <span style={{ display: "inline-flex", width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
      {children}
    </span>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path d="M12 2 20 6v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconSave() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path d="M5 4h12l2 2v14H5V4Z" stroke="currentColor" strokeWidth="2" />
      <path d="M8 4v6h8V4" stroke="currentColor" strokeWidth="2" />
      <path d="M8 20v-6h8v6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 11v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 11v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 7l1-3h10l1 3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M7 7v14h10V7" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path d="M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------------------
   Explore-style searchable dropdown
--------------------------- */
function LookupDropdown({ label, disabled, value, onChange, fetcher, placeholder }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    function onPointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const load = useCallback(
    async (searchText) => {
      if (!fetcher) return;
      setErr("");
      setLoading(true);
      try {
        const res = await fetcher({ q: searchText });
        setItems(Array.isArray(res) ? res : []);
      } catch (e) {
        setErr(formatErr(e));
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [fetcher]
  );

  useEffect(() => {
    if (!open) return;
    load(q.trim());
  }, [open, load, q]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q, open, load]);

  return (
    <div className="lw-popWrap" ref={wrapRef}>
      {label ? <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>{label}</div> : null}

      <button
        type="button"
        className="lw-popBtn"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-expanded={open}
      >
        {value?.name ? (
          <span className="lw-popValue">{value.name}</span>
        ) : (
          <span className="lw-popHint">{disabled ? "Select country first" : "Select..."}</span>
        )}
      </button>

      {open ? (
        <div className="lw-popPanel">
          <div className="lw-popTopRow">
            <input
              className="explore-miniSearch"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder || "Type to search..."}
              autoFocus
            />
            <button
              type="button"
              className="lw-popClear"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear
            </button>
          </div>

          {err ? <div className="explore-error" style={{ padding: 10 }}>{err}</div> : null}

          <div className="explore-checkList" style={{ maxHeight: 260 }}>
            {loading ? (
              <div className="lw-popEmpty">Loading…</div>
            ) : items.length === 0 ? (
              <div className="lw-popEmpty">No results.</div>
            ) : (
              items.map((it) => (
                <label
                  key={it.id}
                  className="explore-check"
                  onClick={() => {
                    onChange({ id: it.id, name: it.name, postCode: it.postCode, code: it.code });
                    setOpen(false);
                  }}
                >
                  <input type="radio" checked={value?.id === it.id} readOnly />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span>{it.name}</span>
                    {it.postCode ? <span style={{ opacity: 0.65 }}>{it.postCode}</span> : null}
                    {it.code ? <span style={{ opacity: 0.65 }}>{it.code}</span> : null}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------
   Resolve IDs -> names (so no "Town #1031")
--------------------------- */
async function resolveTownNames(countryId, ids) {
  const uniq = Array.from(new Set((ids || []).filter((x) => Number(x) > 0)));
  if (!countryId || uniq.length === 0) return [];
  const list = await lookupTowns({ countryId, q: "" });
  const map = new Map((Array.isArray(list) ? list : []).map((t) => [t.id, t]));
  return uniq.map((id) => {
    const t = map.get(id);
    return t ? { id: t.id, name: t.name, postCode: t.postCode } : { id, name: `Town #${id}` };
  });
}

async function resolvePracticeAreaNames(ids) {
  const uniq = Array.from(new Set((ids || []).filter((x) => Number(x) > 0)));
  if (uniq.length === 0) return [];
  const list = await lookupPracticeAreas({ q: "" });
  const map = new Map((Array.isArray(list) ? list : []).map((p) => [p.id, p]));
  return uniq.map((id) => {
    const p = map.get(id);
    return p ? { id: p.id, name: p.name } : { id, name: `Area #${id}` };
  });
}

async function resolveServiceNames(ids) {
  const uniq = Array.from(new Set((ids || []).filter((x) => Number(x) > 0)));
  if (uniq.length === 0) return [];
  const list = await lookupServices({ q: "" });
  const map = new Map((Array.isArray(list) ? list : []).map((s) => [s.id, s]));
  return uniq.map((id) => {
    const s = map.get(id);
    return s ? { id: s.id, name: s.name } : { id, name: `Service #${id}` };
  });
}

/* ---------------------------
   Documents helpers
--------------------------- */
function bytesLabel(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return "";
  const kb = num / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * ✅ IMPORTANT:
 * These "value" strings MUST match your backend enum names (LawyerDocumentType)
 *   KenyaSchoolOfLawCertificate
 *   AdmissionCertificate
 *   PracticingCertificate
 *   NationalIdOrPassport
 *   Other
 */
const DOC_KIND_OPTIONS = [
  { value: "KenyaSchoolOfLawCertificate", label: "Kenya School of Law Certificate" },
  { value: "PracticingCertificate", label: "Practicing Certificate" },
  { value: "NationalIdOrPassport", label: "National ID / Passport" },
  { value: "AdmissionCertificate", label: "Admission Certificate" },
  { value: "Other", label: "Other" },
];

export default function LawyerApply() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Countries from backend /api/country
  const [countryOptions, setCountryOptions] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesErr, setCountriesErr] = useState("");
  const [country, setCountry] = useState(null);

  // Primary selectors
  const [primaryTown, setPrimaryTown] = useState(null);
  const [highestCourt, setHighestCourt] = useState(null);

  // Profile fields (prefill from User)
  const [displayName, setDisplayName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [bio, setBio] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [publicEmail, setPublicEmail] = useState("");

  // Location fields
  const [googleFormattedAddress, setGoogleFormattedAddress] = useState("");
  const [googlePlaceId, setGooglePlaceId] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  // Multi lists
  const [townsServed, setTownsServed] = useState([]);
  const [practiceAreas, setPracticeAreas] = useState([]);
  const [pickTown, setPickTown] = useState(null);
  const [pickArea, setPickArea] = useState(null);

  // Services + rate cards
  const [pickService, setPickService] = useState(null);
  const [serviceOfferings, setServiceOfferings] = useState([]);

  // ✅ NEW: Documents (attachments)
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsErr, setDocsErr] = useState("");
  const [docs, setDocs] = useState([]);

  const [docKind, setDocKind] = useState(DOC_KIND_OPTIONS[0]?.value || "Other");
  const [docNotes, setDocNotes] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docUploadErr, setDocUploadErr] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);

  const compactBtn = useMemo(
    () => ({
      padding: "8px 10px",
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 850,
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      whiteSpace: "nowrap",
    }),
    []
  );

  const miniIconBtn = useMemo(
    () => ({
      padding: "8px 10px",
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 850,
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      whiteSpace: "nowrap",
    }),
    []
  );

  // Load countries
  useEffect(() => {
    let alive = true;

    async function loadCountries() {
      setCountriesErr("");
      setCountriesLoading(true);
      try {
        const res = await api.get("/country");
        const raw = Array.isArray(res.data) ? res.data : [];
        const list = raw.map(normalizeCountry).filter((x) => x.id > 0 && x.name);
        list.sort((a, b) => a.name.localeCompare(b.name));

        if (!alive) return;

        setCountryOptions(list);

        const kenya = list.find((x) => x.name.toLowerCase() === "kenya");
        setCountry((cur) => cur ?? kenya ?? list[0] ?? null);
      } catch (e) {
        if (alive) setCountriesErr(formatErr(e));
      } finally {
        if (alive) setCountriesLoading(false);
      }
    }

    loadCountries();
    return () => {
      alive = false;
    };
  }, []);

  // ✅ Load documents (attachments)
  const loadDocs = useCallback(async () => {
    setDocsErr("");
    setDocsLoading(true);
    try {
      const list = await listMyLawyerDocuments();
      setDocs(Array.isArray(list) ? list : []);
    } catch (e) {
      setDocsErr(formatErr(e));
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  // Load existing profile + resolve names
  useEffect(() => {
    let alive = true;

    async function loadMe() {
      setErr("");
      setLoading(true);

      try {
        const me = await getMyLawyerProfile();
        if (!alive) return;

        if (me) {
          setDisplayName(me.displayName || "");
          setFirmName(me.firmName || "");
          setBio(me.bio || "");
          setPrimaryPhone(me.primaryPhone || "");
          setPublicEmail(me.publicEmail || "");

          setGoogleFormattedAddress(me.googleFormattedAddress || "");
          setGooglePlaceId(me.googlePlaceId || "");
          setLatitude(me.latitude != null ? String(me.latitude) : "");
          setLongitude(me.longitude != null ? String(me.longitude) : "");

          const cid = me.countryId || null;
          if (cid && countryOptions.length) {
            const c = countryOptions.find((x) => x.id === cid);
            if (c) setCountry(c);
          }

          if (me.primaryTownId) {
            setPrimaryTown({
              id: me.primaryTownId,
              name: me.primaryTownName || `Town #${me.primaryTownId}`,
            });
          }

          if (me.highestCourtAllowedId) {
            setHighestCourt({
              id: me.highestCourtAllowedId,
              name: me.highestCourtAllowedName || `Court #${me.highestCourtAllowedId}`,
            });
          }

          const effectiveCountryId = me.countryId || country?.id || null;

          if (Array.isArray(me.townIdsServed) && effectiveCountryId) {
            const townObjs = await resolveTownNames(effectiveCountryId, me.townIdsServed);
            if (alive) setTownsServed(townObjs);
          }

          if (Array.isArray(me.practiceAreaIds)) {
            const areaObjs = await resolvePracticeAreaNames(me.practiceAreaIds);
            if (alive) setPracticeAreas(areaObjs);
          }

          if (Array.isArray(me.serviceOfferings) && me.serviceOfferings.length) {
            const serviceIds = me.serviceOfferings.map((s) => s.lawyerServiceId).filter(Boolean);
            let resolvedNames = [];
            try {
              resolvedNames = await resolveServiceNames(serviceIds);
            } catch {
              resolvedNames = [];
            }
            const nameMap = new Map(resolvedNames.map((s) => [s.id, s.name]));

            setServiceOfferings(
              me.serviceOfferings.map((s) => ({
                lawyerServiceId: s.lawyerServiceId,
                serviceName: s.serviceName || nameMap.get(s.lawyerServiceId) || `Service #${s.lawyerServiceId}`,
                currency: s.currency || "KES",
                minFee: s.minFee != null ? String(s.minFee) : "",
                maxFee: s.maxFee != null ? String(s.maxFee) : "",
                billingUnit: s.billingUnit || "Negotiable",
                notes: s.notes || "",
              }))
            );
          }
        } else {
          const fn = (user?.firstName || user?.FirstName || "").trim();
          const ln = (user?.lastName || user?.LastName || "").trim();
          const full = `${fn} ${ln}`.trim();

          setDisplayName((cur) => (cur && cur.trim() ? cur : (full || user?.name || "")));
          setPublicEmail((cur) => (cur && cur.trim() ? cur : (user?.email || "")));
          setPrimaryPhone((cur) => (cur && cur.trim() ? cur : (user?.phoneNumber || user?.PhoneNumber || "")));
        }
      } catch (e) {
        if (alive) setErr(formatErr(e));
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadMe();
    return () => {
      alive = false;
    };
  }, [user, countryOptions, country?.id]);

  useEffect(() => {
    if (loading) return;
    loadDocs();
  }, [loading, loadDocs]);

  useEffect(() => {
    if (!pickTown) return;
    setTownsServed((cur) => uniqById([...(cur || []), pickTown]));
    setPickTown(null);
  }, [pickTown]);

  useEffect(() => {
    if (!pickArea) return;
    setPracticeAreas((cur) => uniqById([...(cur || []), pickArea]));
    setPickArea(null);
  }, [pickArea]);

  useEffect(() => {
    if (!pickService) return;

    setServiceOfferings((cur) => {
      const exists = (cur || []).some((x) => x.lawyerServiceId === pickService.id);
      if (exists) return cur;

      return [
        ...(cur || []),
        {
          lawyerServiceId: pickService.id,
          serviceName: pickService.name,
          currency: "KES",
          minFee: "",
          maxFee: "",
          billingUnit: "Negotiable",
          notes: "",
        },
      ];
    });

    setPickService(null);
  }, [pickService]);

  function removeTown(id) {
    setTownsServed((cur) => (cur || []).filter((x) => x.id !== id));
  }
  function removeArea(id) {
    setPracticeAreas((cur) => (cur || []).filter((x) => x.id !== id));
  }
  function removeService(serviceId) {
    setServiceOfferings((cur) => (cur || []).filter((x) => x.lawyerServiceId !== serviceId));
  }
  function updateServiceRow(serviceId, patch) {
    setServiceOfferings((cur) => (cur || []).map((x) => (x.lawyerServiceId === serviceId ? { ...x, ...patch } : x)));
  }

  async function save() {
    setErr("");
    setToast(null);

    if (!displayName.trim()) return setErr("Display name is required.");
    if (!country?.id) return setErr("Country is required.");
    if (!primaryTown?.id) return setErr("Primary town is required.");

    const lat = latitude.trim();
    const lng = longitude.trim();
    if ((lat && !Number.isFinite(Number(lat))) || (lng && !Number.isFinite(Number(lng)))) {
      return setErr("Latitude/Longitude must be numeric (or leave blank).");
    }

    for (const s of serviceOfferings || []) {
      const minN = toNumOrNull(s.minFee);
      const maxN = toNumOrNull(s.maxFee);
      if (minN != null && minN < 0) return setErr("Min fee cannot be negative.");
      if (maxN != null && maxN < 0) return setErr("Max fee cannot be negative.");
      if (minN != null && maxN != null && minN > maxN) return setErr("Min fee cannot exceed Max fee.");
    }

    setSaving(true);
    try {
      const payload = {
        displayName: displayName.trim(),
        firmName: firmName.trim() || null,
        bio: bio.trim() || null,
        primaryPhone: primaryPhone.trim() || null,
        publicEmail: publicEmail.trim() || null,

        primaryTownId: primaryTown.id,
        highestCourtAllowedId: highestCourt?.id ?? null,

        googleFormattedAddress: googleFormattedAddress.trim() || null,
        googlePlaceId: googlePlaceId.trim() || null,
        latitude: lat ? Number(lat) : null,
        longitude: lng ? Number(lng) : null,

        townIdsServed: uniqById([...(townsServed || []), primaryTown]).map((x) => x.id),
        practiceAreaIds: uniqById(practiceAreas || []).map((x) => x.id),

        serviceOfferings: (serviceOfferings || []).map((s) => ({
          lawyerServiceId: s.lawyerServiceId,
          currency: (s.currency || "").trim() || null,
          minFee: toNumOrNull(s.minFee),
          maxFee: toNumOrNull(s.maxFee),
          billingUnit: (s.billingUnit || "").trim() || null,
          notes: (s.notes || "").trim() || null,
        })),
      };

      const res = await upsertMyLawyerProfile(payload);
      setToast({ kind: "success", text: res?.message || "Submitted successfully." });
      setTimeout(() => navigate("/dashboard/lawyers"), 700);
    } catch (e) {
      const m = formatErr(e);
      setErr(m);
      setToast({ kind: "error", text: m });
    } finally {
      setSaving(false);
    }
  }

  async function uploadDoc() {
    setDocUploadErr("");
    setToast(null);

    if (!docFile) {
      setDocUploadErr("Please choose a file to upload.");
      return;
    }

    setDocUploading(true);
    try {
      await uploadMyLawyerDocument({
        file: docFile,
        type: docKind, // ✅ backend enum name
        // notes are currently UI-only (backend controller doesn't accept notes yet)
      });

      setDocFile(null);
      setDocNotes("");
      const input = document.getElementById("lawyer-doc-file");
      if (input) input.value = "";

      await loadDocs();
      setToast({ kind: "success", text: "Document uploaded." });
    } catch (e) {
      const m = formatErr(e);
      setDocUploadErr(m);
      setToast({ kind: "error", text: m });
    } finally {
      setDocUploading(false);
    }
  }

  async function removeDoc(id) {
    if (!id) return;
    if (!window.confirm("Delete this document?")) return;

    setToast(null);
    try {
      await deleteMyLawyerDocument(id);
      await loadDocs();
      setToast({ kind: "success", text: "Document removed." });
    } catch (e) {
      const m = formatErr(e);
      setToast({ kind: "error", text: m });
    }
  }

  if (loading) return <div className="explore-loading">Loading…</div>;

  return (
    <div className="explore-container">
      {toast ? (
        <div className={`toast ${toast.kind === "success" ? "toast-success" : "toast-error"}`}>{toast.text}</div>
      ) : null}

      <div className="explore-shell">
        {/* Sidebar */}
        <div className="explore-shellLeft">
          <aside
            className="explore-sidebar"
            style={{
              maxHeight: "calc(100vh - 110px)",
              overflow: "auto",
            }}
          >
            <div className="explore-sidebarTop">
              <div className="explore-sidebarTitleRow">
                <div>
                  <div className="explore-sidebarTitle">Apply</div>
                  <div className="explore-sidebarSub">Become a lawyer on LawAfrica</div>
                </div>

                <button
                  className="explore-linkBtn"
                  onClick={() => navigate("/dashboard/lawyers")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  title="Back to Find a Lawyer"
                >
                  <IconBack /> Back
                </button>
              </div>
            </div>

            <div className="explore-sidebarBody">
              {/* Country */}
              <div className="explore-filterSection">
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                  Country
                </div>

                {countriesLoading ? (
                  <div className="explore-muted">Loading countries…</div>
                ) : countriesErr ? (
                  <div className="explore-error">{countriesErr}</div>
                ) : (
                  <select
                    className="explore-select"
                    value={country?.id ?? ""}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      const c = countryOptions.find((x) => x.id === id) || null;
                      setCountry(c);

                      setPrimaryTown(null);
                      setHighestCourt(null);
                      setTownsServed([]);
                    }}
                  >
                    {countryOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}

                <div className="explore-hint">Used to filter towns and courts.</div>
              </div>

              {/* Primary town */}
              <div className="explore-filterSection">
                <LookupDropdown
                  label="Primary town"
                  value={primaryTown}
                  onChange={setPrimaryTown}
                  disabled={!country?.id}
                  fetcher={({ q }) => lookupTowns({ countryId: country.id, q })}
                  placeholder="Type town name or post code…"
                />
                <div className="explore-hint">Required. Must match selected country.</div>
              </div>

              {/* Court */}
              <div className="explore-filterSection">
                <LookupDropdown
                  label="Highest court allowed"
                  value={highestCourt}
                  onChange={setHighestCourt}
                  disabled={!country?.id}
                  fetcher={({ q }) => lookupCourts({ countryId: country.id, q })}
                  placeholder="Type court name or code…"
                />
              </div>

              {/* Towns served */}
              <div className="explore-filterSection">
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                  Towns served <span style={{ opacity: 0.6 }}>(optional)</span>
                </div>

                <LookupDropdown
                  label=""
                  value={pickTown}
                  onChange={setPickTown}
                  disabled={!country?.id}
                  fetcher={({ q }) => lookupTowns({ countryId: country.id, q })}
                  placeholder="Search and add town…"
                />

                <div className="explore-checkList" style={{ marginTop: 10 }}>
                  {townsServed.length === 0 ? (
                    <div className="explore-muted">No towns added yet.</div>
                  ) : (
                    townsServed.map((t) => (
                      <div key={t.id} className="explore-check">
                        <input type="checkbox" checked readOnly />
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <span>{t.name}</span>
                          <button className="explore-linkBtn" onClick={() => removeTown(t.id)} title="Remove town">
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Practice areas */}
              <div className="explore-filterSection">
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                  Areas of expertise <span style={{ opacity: 0.6 }}>(Practice Areas)</span>
                </div>

                <LookupDropdown
                  label=""
                  value={pickArea}
                  onChange={setPickArea}
                  disabled={false}
                  fetcher={({ q }) => lookupPracticeAreas({ q })}
                  placeholder="Search and add practice area…"
                />

                <div className="explore-checkList" style={{ marginTop: 10 }}>
                  {practiceAreas.length === 0 ? (
                    <div className="explore-muted">No practice areas added yet.</div>
                  ) : (
                    practiceAreas.map((a) => (
                      <div key={a.id} className="explore-check">
                        <input type="checkbox" checked readOnly />
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <span>{a.name}</span>
                          <button className="explore-linkBtn" onClick={() => removeArea(a.id)} title="Remove practice area">
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Services + rate cards */}
              <div className="explore-filterSection">
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                  Services & Rate Card
                </div>

                <LookupDropdown
                  label=""
                  value={pickService}
                  onChange={setPickService}
                  disabled={false}
                  fetcher={async ({ q }) => {
                    try {
                      return await lookupServices({ q });
                    } catch {
                      return [];
                    }
                  }}
                  placeholder="Search and add service…"
                />

                <div className="explore-hint">Add services you offer and set estimated fees.</div>
              </div>

              {/* Actions */}
              <div className="explore-filterSection">
                <div className="explore-drawerActions" style={{ marginTop: 0 }}>
                  <button className="explore-cta-btn" onClick={save} disabled={saving} style={compactBtn} title="Submit application">
                    <SmallIcon><IconShield /></SmallIcon>
                    {saving ? "Submitting…" : "Submit"}
                  </button>

                  <button
                    className="explore-btn explore-btn-hotOutline"
                    onClick={() => navigate("/dashboard/lawyers")}
                    style={compactBtn}
                    type="button"
                    title="Cancel"
                  >
                    Cancel
                  </button>
                </div>

                {err ? <div className="explore-error" style={{ marginTop: 12 }}>{err}</div> : null}
              </div>
            </div>
          </aside>
        </div>

        {/* Main form */}
        <section>
          <div className="explore-header">
            <div className="explore-titleRow">
              <div className="explore-brandTitle">
                <div className="explore-brandKicker">LawAfrica</div>
                <h1 className="explore-title">
                  Apply to be a <span className="explore-titleAccent">Lawyer</span>
                </h1>
                <p className="explore-subtitle">
                  Your application will be marked <b>Pending</b> until verified.
                </p>
              </div>
            </div>

            <div className="explore-chipsRow">
              <div className="explore-chips">
                <span className="explore-chip"><span className="explore-chipText">Country: {country?.name || "—"}</span></span>
                {primaryTown?.name ? <span className="explore-chip"><span className="explore-chipText">Primary: {primaryTown.name}</span></span> : null}
                {highestCourt?.name ? <span className="explore-chip"><span className="explore-chipText">Court: {highestCourt.name}</span></span> : null}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="explore-btn explore-btn-hotOutline" onClick={() => navigate("/dashboard/lawyers")} style={compactBtn} title="Back">
                  <SmallIcon><IconBack /></SmallIcon>
                  Back
                </button>

                <button className="explore-cta-btn" onClick={save} disabled={saving} style={compactBtn} title="Save">
                  <SmallIcon><IconSave /></SmallIcon>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>

          <div className="explore-empty" style={{ marginTop: 14 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Display name</div>
                <input className="explore-sidebarSearch" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g., Jane Doe" />
                <div className="explore-hint">Default is your account name, but you can change how clients address you.</div>
              </div>

              <div>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Firm name (optional)</div>
                <input className="explore-sidebarSearch" value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="e.g., Doe & Co Advocates" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Phone (optional)</div>
                  <input className="explore-sidebarSearch" value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} placeholder="+254..." />
                </div>
                <div>
                  <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Public email (optional)</div>
                  <input className="explore-sidebarSearch" value={publicEmail} onChange={(e) => setPublicEmail(e.target.value)} placeholder="email@example.com" />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr", gap: 12 }}>
                <div>
                  <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Location / Address (optional)</div>
                  <input className="explore-sidebarSearch" value={googleFormattedAddress} onChange={(e) => setGoogleFormattedAddress(e.target.value)} placeholder="e.g., ABC Building, Nairobi" />
                  <div className="explore-hint">Shown publicly on your profile.</div>
                </div>
                <div>
                  <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Latitude</div>
                  <input className="explore-sidebarSearch" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="-1.2864" />
                </div>
                <div>
                  <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Longitude</div>
                  <input className="explore-sidebarSearch" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="36.8172" />
                </div>
              </div>

              <div>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Google Place Id (optional)</div>
                <input className="explore-sidebarSearch" value={googlePlaceId} onChange={(e) => setGooglePlaceId(e.target.value)} placeholder="Optional Place ID" />
              </div>

              <div>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Bio (optional)</div>
                <textarea className="explore-sidebarSearch" style={{ minHeight: 140 }} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Brief professional bio…" />
              </div>

              {/* Rate card editor */}
              <div style={{ marginTop: 6 }}>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 10 }}>
                  Services & Estimated Fees
                </div>

                {serviceOfferings.length === 0 ? (
                  <div className="explore-muted">No services added yet. Use the sidebar to add services.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {serviceOfferings.map((s) => (
                      <div
                        key={s.lawyerServiceId}
                        style={{
                          border: "1px solid rgba(15,23,42,0.10)",
                          borderRadius: 16,
                          padding: 12,
                          background: "#fff",
                          boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <div style={{ fontWeight: 900 }}>{s.serviceName}</div>
                          <button
                            className="explore-btn"
                            type="button"
                            style={miniIconBtn}
                            onClick={() => removeService(s.lawyerServiceId)}
                            title="Remove service"
                          >
                            <SmallIcon><IconTrash /></SmallIcon>
                            Remove
                          </button>
                        </div>

                        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "0.6fr 0.7fr 0.7fr 1fr", gap: 10 }}>
                          <div>
                            <div className="explore-hint" style={{ marginTop: 0 }}>Currency</div>
                            <input className="explore-sidebarSearch" value={s.currency} onChange={(e) => updateServiceRow(s.lawyerServiceId, { currency: e.target.value })} placeholder="KES" />
                          </div>
                          <div>
                            <div className="explore-hint" style={{ marginTop: 0 }}>Min fee</div>
                            <input className="explore-sidebarSearch" value={s.minFee} onChange={(e) => updateServiceRow(s.lawyerServiceId, { minFee: e.target.value })} placeholder="e.g. 2000" />
                          </div>
                          <div>
                            <div className="explore-hint" style={{ marginTop: 0 }}>Max fee</div>
                            <input className="explore-sidebarSearch" value={s.maxFee} onChange={(e) => updateServiceRow(s.lawyerServiceId, { maxFee: e.target.value })} placeholder="e.g. 5000" />
                          </div>
                          <div>
                            <div className="explore-hint" style={{ marginTop: 0 }}>Billing unit</div>
                            <select className="explore-select" value={s.billingUnit} onChange={(e) => updateServiceRow(s.lawyerServiceId, { billingUnit: e.target.value })}>
                              <option value="Consultation">Consultation</option>
                              <option value="Hour">Hour</option>
                              <option value="Fixed">Fixed</option>
                              <option value="Negotiable">Negotiable</option>
                            </select>
                          </div>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <div className="explore-hint" style={{ marginTop: 0 }}>Notes (optional)</div>
                          <input className="explore-sidebarSearch" value={s.notes} onChange={(e) => updateServiceRow(s.lawyerServiceId, { notes: e.target.value })} placeholder="e.g. excludes filing fees…" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  className="explore-btn explore-btn-hotOutline"
                  type="button"
                  style={{ ...compactBtn, marginTop: 12 }}
                  onClick={() => setToast({ kind: "success", text: "Use the sidebar to add another service." })}
                  title="Add service via sidebar"
                >
                  <SmallIcon><IconPlus /></SmallIcon>
                  Add another service
                </button>
              </div>

              {/* ✅ Verification Documents */}
              <div style={{ marginTop: 10 }}>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 10 }}>
                  Verification Documents
                </div>

                <div className="explore-hint" style={{ marginTop: 0, marginBottom: 10 }}>
                  Upload supporting documents (e.g., KSL certificate, practicing certificate). Requirements may vary by country — we’ll enforce rules later.
                </div>

                {/* uploader */}
                <div
                  style={{
                    border: "1px solid rgba(15,23,42,0.10)",
                    borderRadius: 16,
                    padding: 12,
                    background: "linear-gradient(135deg, rgba(107,35,59,0.04), rgba(255,255,255,0.95))",
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div className="explore-hint" style={{ marginTop: 0 }}>Document type</div>
                      <select className="explore-select" value={docKind} onChange={(e) => setDocKind(e.target.value)}>
                        {DOC_KIND_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="explore-hint" style={{ marginTop: 0 }}>Notes (optional)</div>
                      <input
                        className="explore-sidebarSearch"
                        value={docNotes}
                        onChange={(e) => setDocNotes(e.target.value)}
                        placeholder="e.g. 2026 certificate"
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      id="lawyer-doc-file"
                      type="file"
                      onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                      style={{ maxWidth: 420 }}
                    />

                    <button
                      className="explore-cta-btn"
                      type="button"
                      onClick={uploadDoc}
                      disabled={docUploading}
                      style={compactBtn}
                      title="Upload document"
                    >
                      <SmallIcon><IconUpload /></SmallIcon>
                      {docUploading ? "Uploading…" : "Upload"}
                    </button>

                    <button
                      className="explore-btn explore-btn-hotOutline"
                      type="button"
                      onClick={loadDocs}
                      disabled={docsLoading}
                      style={compactBtn}
                      title="Refresh documents"
                    >
                      Refresh
                    </button>

                    {docFile ? (
                      <span style={{ fontSize: 12, opacity: 0.8 }}>
                        Selected: <b>{docFile.name}</b> ({bytesLabel(docFile.size)})
                      </span>
                    ) : null}
                  </div>

                  {docUploadErr ? <div className="explore-error" style={{ marginTop: 10 }}>{docUploadErr}</div> : null}
                </div>

                {/* list */}
                <div style={{ marginTop: 12 }}>
                  {docsErr ? <div className="explore-error">{docsErr}</div> : null}

                  {docsLoading ? (
                    <div className="explore-muted">Loading documents…</div>
                  ) : docs.length === 0 ? (
                    <div className="explore-muted">No documents uploaded yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {docs.map((d) => {
                        const id = d.id ?? d.documentId ?? `${d.kind || d.type}-${d.fileName}`;
                        const kind = d.kind || d.type || d.documentKind || "Document";
                        const name = d.fileName || d.name || "Attachment";
                        const size = d.sizeBytes ?? d.size ?? d.length ?? null;
                        const createdAt = d.createdAt || d.uploadedAt || d.created || null;

                        return (
                          <div
                            key={id}
                            style={{
                              border: "1px solid rgba(15,23,42,0.10)",
                              borderRadius: 16,
                              padding: 12,
                              background: "#fff",
                              boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {kind}
                                </div>
                                <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4 }}>
                                  {name}
                                  {size ? <span style={{ opacity: 0.7 }}> • {bytesLabel(size)}</span> : null}
                                  {createdAt ? <span style={{ opacity: 0.7 }}> • {new Date(createdAt).toLocaleString()}</span> : null}
                                </div>
                                {d.notes ? <div style={{ opacity: 0.75, fontSize: 13, marginTop: 6 }}>{d.notes}</div> : null}
                              </div>

                              <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                                {d.url ? (
                                  <a
                                    className="explore-btn explore-btn-hotOutline"
                                    href={d.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ ...compactBtn, textDecoration: "none" }}
                                    title="View document"
                                  >
                                    <SmallIcon><IconEye /></SmallIcon>
                                    View
                                  </a>
                                ) : null}

                                <button
                                  className="explore-btn"
                                  type="button"
                                  style={compactBtn}
                                  onClick={() => removeDoc(d.id ?? d.documentId)}
                                  title="Delete document"
                                >
                                  <SmallIcon><IconTrash /></SmallIcon>
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="explore-hint" style={{ marginTop: 12 }}>
                Tip: after uploading documents, submit/save your profile so the Admin can verify you faster.
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}