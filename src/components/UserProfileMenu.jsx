import { useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import api from "../api/client";
import "../styles/userProfileMenu.css";

const API_ORIGIN = "https://lawafricaapi.onrender.com";

function resolveAvatarUrl(user) {
  // Prefer ProfileImageUrl coming from /api/profile/me (backend)
  const raw = user?.profileImageUrl || user?.ProfileImageUrl || user?.avatarUrl;
  if (!raw) return null;

  // Already absolute
  if (/^https?:\/\//i.test(raw)) return raw;

  // Ensure leading slash
  const path = raw.startsWith("/") ? raw : `/${raw}`;

  // If backend stored "/storage/..." just prefix API origin
  if (path.startsWith("/storage/")) return `${API_ORIGIN}${path}`;

  // If backend stored "Storage/..." (older DB rows), normalize to "/storage/..."
  if (path.toLowerCase().startsWith("/storage/")) return `${API_ORIGIN}${path}`;

  // If backend stored plain filename by mistake, fall back to profile images directory
  return `${API_ORIGIN}/storage/ProfileImages/${raw}`;
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

    // ✅ validations
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

      await api.post("/Profile/image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          const percent = Math.round((evt.loaded * 100) / evt.total);
          setProgress(percent);
        },
      });

      await refreshUser();
      setOpen(false);
      setMsg("Profile photo updated.");
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
      await api.delete("/Profile/image");
      await refreshUser();
      setOpen(false);
      setMsg("Profile photo removed.");
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
        <div className="profile-dropdown" role="menu">
          <div className="profile-info">
            <div className="profile-name">{user?.name || user?.Username || "User"}</div>
            <div className="profile-email">{user?.email || user?.Email || ""}</div>
          </div>

          {msg && <div className="profile-msg">{msg}</div>}

          <div className="profile-actions">
            <button
              className="profile-action primary"
              onClick={triggerFileSelect}
              disabled={uploading}
              type="button"
            >
              {uploading ? "Uploading..." : (avatarSrc ? "Change photo" : "Upload photo")}
            </button>

            {uploading && (
              <div className="upload-progress" aria-label="Upload progress">
                <div className="upload-progress-bar" style={{ width: `${progress}%` }} />
              </div>
            )}

            {avatarSrc && (
              <button
                className="profile-action danger"
                onClick={handleRemoveImage}
                disabled={uploading}
                type="button"
              >
                Remove photo
              </button>
            )}

            <button
              className="profile-action outline"
              onClick={onLogout}
              disabled={uploading}
              type="button"
            >
              Logout
            </button>
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
