import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

export async function fetchSafeRoutes(origin, destination, departureTime) {
  const { data } = await api.post("/routes/safe", { origin, destination, departureTime });
  return data;
}

export default api;
