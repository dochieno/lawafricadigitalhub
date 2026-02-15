import { useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import api from "../api/client";
import "../styles/userProfileMenu.css";

const API_ORIGIN = "https://lawafricaapi.onrender.com";

function resolveAvatarUrl(user) {
  const raw =
    user?.profileImageUrl ||
    user?.ProfileImageUrl ||
    user?.avatarUrl ||
    user?.ProfileImageURL;

  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) return raw;

  const cleaned = String(raw).trim().replaceAll("\\", "/");

  if (cleaned.startsWith("/storage/")) return `${API_ORIGIN}${cleaned}`;

  if (cleaned.toLowerCase().startsWith("storage/")) {
    return `${API_ORIGIN}/storage/${cleaned.substring("storage/".length)}`;
  }

  if (!cleaned.includes("/")) {
    return `${API_ORIGIN}/storage/ProfileImages/${cleaned}`;
  }

  return `${API_ORIGIN}/${cleaned.startsWith("/") ? cleaned.slice(1) : cleaned}`;
}

/* ----------------------------
   Tiny inline icons (no deps)
----------------------------- */
function Ic({ children }) {
  return (
    <span className="pm-ic" aria-hidden="true">
      {children}
    </span>
  );
}

function IcCamera() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7a2 2 0 0 1 2-2h2l1.2-1.6A2 2 0 0 1 10.8 3h2.4a2 2 0 0 1 1.6.8L16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function IcTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6 7l1 14h10l1-14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcLogout() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M10 7V6a2 2 0 0 1 2-2h7v16h-7a2 2 0 0 1-2-2v-1"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M4 12h9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7 9l-3 3 3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcMail() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16v10H4V7Z" stroke="currentColor" strokeWidth="2" />
      <path
        d="m5 8 7 5 7-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M16 10a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M4 21a8 8 0 0 1 16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function UserProfileMenu({ user, onLogout }) {
  const { refreshUser } = useAuth();
  const fileInputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  const initials =
    user?.name
      ?.split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  const avatarSrc = useMemo(() => resolveAvatarUrl(user), [user]);

  const triggerFileSelect = () => {
    setMsg("");
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    setMsg("");
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMsg("Please select a valid image file.");
      e.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMsg("Image is too large. Max 2MB.");
      e.target.value = "";
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploading(true);
      setProgress(0);

      await api.post("/profile/image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          setProgress(Math.round((evt.loaded * 100) / evt.total));
        },
      });

      await refreshUser();

      setMsg("Profile photo updated.");
      setOpen(false);
    } catch (err) {
      console.error("Upload failed", err);
      setMsg("Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
      setProgress(0);

      if (localUrl) URL.revokeObjectURL(localUrl);
      setPreview(null);

      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveImage = async () => {
    setMsg("");
    try {
      await api.delete("/profile/image");
      await refreshUser();
      setMsg("Profile photo removed.");
      setOpen(false);
    } catch (err) {
      console.error("Remove failed", err);
      setMsg("Failed to remove image. Please try again.");
    }
  };

  return (
    <div className="profile-menu">
      <button
        className={`profile-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="User menu"
        type="button"
      >
        {preview ? (
          <img src={preview} alt="Preview" />
        ) : avatarSrc ? (
          <img
            src={avatarSrc}
            alt="Profile"
            onError={() => setMsg("Could not load profile photo. Please re-upload.")}
          />
        ) : (
          <div className="profile-initials" aria-hidden="true">
            {initials}
          </div>
        )}
      </button>

      {open && (
        <div className="profile-dropdown" role="menu" aria-label="Profile menu">
          {/* Arrow pointer */}
          <div className="pm-arrow" aria-hidden="true" />

          {/* Header */}
          <div className="profile-info">
            <div className="pm-idrow">
              <span className="pm-dot" />
              <div className="pm-title">Account</div>
            </div>

            <div className="pm-user">
              <div className="pm-avatar-mini" aria-hidden="true">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              <div className="pm-user-meta">
                <div className="profile-name">{user?.name || user?.Username || "User"}</div>
                <div className="profile-email">{user?.email || user?.Email || ""}</div>
              </div>
            </div>
          </div>

          {msg && <div className="profile-msg">{msg}</div>}

          {/* Actions list (compact, like admin menu) */}
          <div className="pm-actions" role="presentation">
            <button
              className="pm-item"
              onClick={triggerFileSelect}
              disabled={uploading}
              type="button"
            >
              <Ic><IcCamera /></Ic>
              <span className="pm-item-label">
                {uploading ? "Uploading..." : avatarSrc ? "Change photo" : "Upload photo"}
              </span>
              <span className="pm-kbd" aria-hidden="true">⌘U</span>
            </button>

            {avatarSrc && (
              <button
                className="pm-item pm-danger"
                onClick={handleRemoveImage}
                disabled={uploading}
                type="button"
              >
                <Ic><IcTrash /></Ic>
                <span className="pm-item-label">Remove photo</span>
              </button>
            )}

            <div className="pm-divider" aria-hidden="true" />

            <button className="pm-item pm-muted" type="button" disabled>
              <Ic><IcUser /></Ic>
              <span className="pm-item-label">Profile</span>
              <span className="pm-hint" aria-hidden="true">Coming soon</span>
            </button>

            <button className="pm-item pm-muted" type="button" disabled>
              <Ic><IcMail /></Ic>
              <span className="pm-item-label">Notifications</span>
              <span className="pm-hint" aria-hidden="true">Coming soon</span>
            </button>

            <div className="pm-divider" aria-hidden="true" />

            <button
              className="pm-item pm-logout"
              onClick={onLogout}
              disabled={uploading}
              type="button"
            >
              <Ic><IcLogout /></Ic>
              <span className="pm-item-label">Logout</span>
            </button>

            {uploading && (
              <div className="upload-progress" aria-label="Upload progress">
                <div
                  className="upload-progress-bar"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleFileChange}
          />
        </div>
      )}
    </div>
  );
}
