import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { addContact, removeContact } from "../api.js";

export default function ContactsPage() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [message, setMessage] = useState(null);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage(null);
    try {
      const result = await addContact(form);
      await refreshUser();
      setForm({ name: "", phone: "", email: "" });
      setMessage(
        result.linked
          ? "Contact added and linked — they'll receive real-time alerts."
          : "Contact added, but no SafeRoute account matches that email yet. They won't get real-time alerts until they sign up with it."
      );
    } catch (err) {
      setError(err.response?.data?.message || "Could not add contact");
    }
  }

  async function handleRemove(contactId) {
    await removeContact(contactId);
    await refreshUser();
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-lg mx-auto">
        <Link to="/" className="text-sm text-brand-600 font-semibold">
          ← Back to routes
        </Link>
        <h1 className="text-2xl font-bold text-slate-800 mt-2 mb-1">Emergency contacts</h1>
        <p className="text-sm text-slate-500 mb-6">
          Contacts linked to a SafeRoute account receive real-time SOS and live-location
          alerts. Add them by the email they used to sign up.
        </p>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 mb-6">
          <input
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Contact's name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <input
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Phone (optional)"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <input
            type="email"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Their SafeRoute email (for real-time alerts)"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-brand-700">{message}</p>}
          <button className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 rounded-lg transition">
            Add contact
          </button>
        </form>

        <div className="space-y-2">
          {user.emergencyContacts?.length === 0 && (
            <p className="text-sm text-slate-400">No emergency contacts yet.</p>
          )}
          {user.emergencyContacts?.map((contact) => (
            <div
              key={contact._id}
              className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between"
            >
              <div>
                <p className="font-medium text-slate-800">{contact.name}</p>
                <p className="text-xs text-slate-500">
                  {contact.phone || "no phone"} ·{" "}
                  {contact.contactUserId ? (
                    <span className="text-green-600 font-semibold">Linked — gets live alerts</span>
                  ) : (
                    <span className="text-amber-600">Not linked to an account</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => handleRemove(contact._id)}
                className="text-xs text-red-500 hover:text-red-700 font-semibold"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
