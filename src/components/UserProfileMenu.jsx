import { useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import api from "../api/client";
import "../styles/UserProfileMenu.css";

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
      .join("")
      .toUpperCase() || "U";

  const triggerFileSelect = () => {
    setMsg("");
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    setMsg("");
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview immediately
    setPreview(URL.createObjectURL(file));

    const formData = new FormData();
    formData.append("file", file); // must match backend parameter name

    try {
      setUploading(true);
      setProgress(0);

      // ✅ Correct endpoint from Swagger: POST /api/Profile/image
      await api.post("/Profile/image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          const percent = Math.round((evt.loaded * 100) / evt.total);
          setProgress(percent);
        },
      });

      await refreshUser(); // reload profile
      setPreview(null);
      setOpen(false);
    } catch (err) {
      console.error("Upload failed", err);
      setMsg("Failed to upload image. Please try again.");
      setPreview(null);
    } finally {
      setUploading(false);
      setProgress(0);
      // allow selecting same file again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveImage = async () => {
    setMsg("");
    try {
      // ✅ Correct endpoint from Swagger: DELETE /api/Profile/image
      await api.delete("/Profile/image");
      await refreshUser();
      setOpen(false);
    } catch (err) {
      console.error("Remove failed", err);
      setMsg("Failed to remove image. Please try again.");
    }
  };

  return (
    <div className="profile-menu">
      <button
        className="profile-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="User menu"
        type="button"
      >
        {preview ? (
          <img src={preview} alt="Preview" />
        ) : user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="Profile" />
        ) : (
          <div className="profile-initials">{initials}</div>
        )}
      </button>

      {open && (
        <div className="profile-dropdown">
          <div className="profile-info">
            <div className="profile-name">{user?.name || "User"}</div>
            <div className="profile-email">{user?.email || ""}</div>
          </div>

          {msg && <div style={{ marginTop: 8, color: "var(--la-red)" }}>{msg}</div>}

          <button
            className="profile-action primary"
            onClick={triggerFileSelect}
            disabled={uploading}
            type="button"
          >
            {uploading ? "Uploading..." : "Change profile image"}
          </button>

          {uploading && (
            <div className="upload-progress">
              <div
                className="upload-progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {user?.avatarUrl && (
            <button
              className="profile-action outline"
              onClick={handleRemoveImage}
              disabled={uploading}
              type="button"
            >
              Remove profile image
            </button>
          )}

          <button className="profile-action outline" onClick={onLogout} type="button">
            Logout
          </button>

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
