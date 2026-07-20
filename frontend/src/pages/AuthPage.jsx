import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuthPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register(form.name, form.email, form.password);
      }
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-9 w-9 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold">
            S
          </div>
          <h1 className="text-xl font-bold text-slate-800">SafeRoute</h1>
        </div>

        <div className="flex mb-5 rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 text-sm font-semibold py-1.5 rounded-md transition ${
              mode === "login" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"
            }`}
          >
            Log in
          </button>
          <button
            onClick={() => setMode("register")}
            className={`flex-1 text-sm font-semibold py-1.5 rounded-md transition ${
              mode === "register" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "register" && (
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Full name"
              value={form.name}
              onChange={update("name")}
              required
            />
          )}
          <input
            type="email"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Email"
            value={form.email}
            onChange={update("email")}
            required
          />
          <input
            type="password"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Password"
            value={form.password}
            onChange={update("password")}
            required
            minLength={6}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
