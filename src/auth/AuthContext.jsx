import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/client";
import { getToken, logout as clearToken } from "./auth";

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // -------------------------
  // REFRESH USER PROFILE
  // -------------------------
  const refreshUser = async () => {
    try {
      const res = await api.get("/Profile/me");
      const data = res.data;

      let avatarUrl = null;
      if (data.profileImageUrl) {
        avatarUrl = data.profileImageUrl.startsWith("http")
          ? data.profileImageUrl
          : `${API_BASE}/${data.profileImageUrl.replace(
              /^\/?storage/i,
              "storage"
            )}`;
      }

      setUser({
        id: data.id,
        firstName: data.firstName,
        lastName: data.lastName,
        name: `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim(),
        email: data.email,
        role: data.role,
        avatarUrl,
      });
    } catch (err) {
      // ✅ IMPORTANT: only handle auth failures here
      if (err.response?.status === 401) {
        clearToken();
        setUser(null);
      } else {
        console.error("Profile load failed", err);
      }

      // ⛔ Stop further execution
      throw err;
    }
  };

  // -------------------------
  // APP BOOTSTRAP
  // -------------------------
  const loadUser = async () => {
    const token = getToken();

    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      await refreshUser();
    } catch {
      // swallow error — handled above
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  // -------------------------
  // LOGOUT (used by UI)
  // -------------------------
  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
