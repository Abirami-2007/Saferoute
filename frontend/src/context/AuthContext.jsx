import { createContext, useContext, useState, useEffect } from "react";
import { login as apiLogin, register as apiRegister, fetchMe } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("saferoute_token"));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On first load, if we have a stored token, fetch the full profile
  // (including populated emergency contacts) rather than trusting stale
  // localStorage user data.
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then(setUser)
      .catch(() => {
        // Token expired/invalid — clear it so the app falls back to logged-out.
        localStorage.removeItem("saferoute_token");
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function login(email, password) {
    const data = await apiLogin(email, password);
    localStorage.setItem("saferoute_token", data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function register(name, email, password) {
    const data = await apiRegister(name, email, password);
    localStorage.setItem("saferoute_token", data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem("saferoute_token");
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    const fresh = await fetchMe();
    setUser(fresh);
    return fresh;
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
