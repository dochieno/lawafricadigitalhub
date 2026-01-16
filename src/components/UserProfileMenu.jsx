import { useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import api from "../api/client";
import "../styles/userProfileMenu.css";

const API_ORIGIN = "https://lawafricaapi.onrender.com";

/**
 * Converts whatever backend returns into a browser-loadable absolute URL.
 * Supports:
 *  - "/storage/ProfileImages/x.jpg" ✅ canonical
 *  - "Storage/ProfileImages/x.jpg" ✅ legacy
 *  - "user_1_x.jpg" ✅ legacy
 *  - wrong slashes "\" ✅ legacy
 */
function resolveAvatarUrl(user) {
  const raw =
    user?.profileImageUrl ||
    user?.ProfileImageUrl ||
    user?.avatarUrl ||
    user?.ProfileImageURL; // just in case older shape

  if (!raw) return null;

  // Already absolute
  if (/^https?:\/\//i.test(raw)) return raw;

  const cleaned = String(raw).trim().replaceAll("\\", "/");

  // canonical
  if (cleaned.startsWith("/storage/")) return `${API_ORIGIN}${cleaned}`;

  // legacy "Storage/..."
  if (cleaned.toLowerCase().startsWith("storage/")) {
    return `${API_ORIGIN}/storage/${cleaned.substring("storage/".length)}`;
  }

  // filename-only
  if (!cleaned.includes("/")) {
    return `${API_ORIGIN}/storage/ProfileImages/${cleaned}`;
  }

  // other relative paths
  return `${API_ORIGIN}/${cleaned.startsWith("/") ? cleaned.slice(1) : cleaned}`;
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

    // validations
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

      // ✅ IMPORTANT: your route is /api/profile/image (lowercase controller)
      await api.post("/profile/image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          setProgress(Math.round((evt.loaded * 100) / evt.total));
        },
      });

      // Pull latest /api/profile/me
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
        <div className="profile-dropdown" role="menu">
          <div className="profile-info">
            <div className="profile-name">
              {user?.name || user?.Username || "User"}
            </div>
            <div className="profile-email">
              {user?.email || user?.Email || ""}
            </div>
          </div>

          {msg && <div className="profile-msg">{msg}</div>}

          <div className="profile-actions">
            <button
              className="profile-action primary"
              onClick={triggerFileSelect}
              disabled={uploading}
              type="button"
            >
              {uploading ? "Uploading..." : avatarSrc ? "Change photo" : "Upload photo"}
            </button>

            {uploading && (
              <div className="upload-progress" aria-label="Upload progress">
                <div
                  className="upload-progress-bar"
                  style={{ width: `${progress}%` }}
                />
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
