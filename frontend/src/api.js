import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

// Attach the JWT (if we have one) to every outgoing request automatically.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("saferoute_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function fetchSafeRoutes(origin, destination, departureTime, profile = "foot-walking") {
  const { data } = await api.post("/routes/safe", { origin, destination, departureTime, profile });
  return data;
}

export async function autocompletePlaces(text) {
  const { data } = await api.get("/routes/autocomplete", { params: { text } });
  return data.suggestions;
}

export async function login(email, password) {
  const { data } = await api.post("/auth/login", { email, password });
  return data;
}

export async function register(name, email, password) {
  const { data } = await api.post("/auth/register", { name, email, password });
  return data;
}

export async function fetchMe() {
  const { data } = await api.get("/users/me");
  return data;
}

export async function addContact({ name, phone, email }) {
  const { data } = await api.post("/users/me/contacts", { name, phone, email });
  return data;
}

export async function removeContact(contactId) {
  const { data } = await api.delete(`/users/me/contacts/${contactId}`);
  return data;
}

export default api;
