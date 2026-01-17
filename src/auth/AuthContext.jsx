import { createContext, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import api from "../api/client";
import { getToken, logout as clearToken } from "./auth";

const AuthContext = createContext(null);

// NOTE: This is used for building avatar URLs only
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "https://lawafricaapi.onrender.com")
  .trim()
  .replace(/\/$/, "");

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ Prevent double in-flight profile loads (helps StrictMode / fast re-renders)
  const inFlightRef = useRef(null);

  // -------------------------
  // REFRESH USER PROFILE
  // -------------------------
  const refreshUser = async () => {
    // If one is already running, reuse it
    if (inFlightRef.current) return inFlightRef.current;

    inFlightRef.current = (async () => {
      try {
        // ✅ Never throttle profile load
        const res = await api.get("/Profile/me", { __skipThrottle: true });
        const data = res.data;

        let avatarUrl = null;
        if (data?.profileImageUrl) {
          avatarUrl = String(data.profileImageUrl).startsWith("http")
            ? data.profileImageUrl
            : `${API_BASE}/${String(data.profileImageUrl).replace(/^\/?storage/i, "storage")}`;
        }

        setUser({
          id: data?.id,
          firstName: data?.firstName,
          lastName: data?.lastName,
          name: `${data?.firstName ?? ""} ${data?.lastName ?? ""}`.trim(),
          email: data?.email,
          role: data?.role,
          avatarUrl,
        });

        return data;
      } catch (err) {
        // ✅ Treat request cancels (throttle, route change, abort) as non-errors
        if (axios.isCancel(err) || err?.code === "ERR_CANCELED") {
          return null;
        }

        // ✅ Only handle auth failures here
        if (err?.response?.status === 401) {
          clearToken();
          setUser(null);
          return null;
        }

        // ✅ Log but DO NOT crash app boot
        console.error("Profile load failed", err);
        return null;
      } finally {
        inFlightRef.current = null;
      }
    })();

    return inFlightRef.current;
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
