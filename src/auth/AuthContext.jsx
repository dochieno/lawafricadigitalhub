// src/auth/AuthContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import api, { API_BASE_URL } from "../api/client";
import { getToken, logout as clearToken } from "./auth";

const AuthContext = createContext(null);

function getServerOrigin() {
  // API_BASE_URL is like https://lawafricaapi.onrender.com/api
  return String(API_BASE_URL || "").replace(/\/api\/?$/i, "");
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ prevents double profile fetch (React StrictMode / fast re-renders)
  const inFlightRef = useRef(null);

  // -------------------------
  // REFRESH USER PROFILE
  // -------------------------
  const refreshUser = async () => {
    // ✅ if a refresh is already happening, reuse it
    if (inFlightRef.current) return inFlightRef.current;

    const run = (async () => {
      try {
        const res = await api.get("/Profile/me", { __skipThrottle: true });
        const data = res.data;

        const API_ORIGIN = getServerOrigin();

        let avatarUrl = null;
        if (data?.profileImageUrl) {
          const p = String(data.profileImageUrl).trim();
          if (p) {
            avatarUrl = p.startsWith("http")
              ? p
              : `${API_ORIGIN}/${p.replace(/^\/?storage/i, "storage")}`;
          }
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

        return true;
      } catch (err) {
        // ✅ CRITICAL: ignore cancellations (throttle / route changes / aborted requests)
        if (axios.isCancel(err) || err?.code === "ERR_CANCELED") {
          return false;
        }

        // ✅ Only handle auth failures here
        if (err?.response?.status === 401) {
          clearToken();
          setUser(null);
          return false;
        }

        console.error("Profile load failed", err);
        // ✅ DO NOT throw — never block app mount
        return false;
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = run;
    return run;
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
