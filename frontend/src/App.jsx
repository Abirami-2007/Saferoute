import { BrowserRouter, Routes, Route } from "react-router-dom";
import RouteFinder from "./pages/RouteFinder.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RouteFinder />} />
      </Routes>
    </BrowserRouter>
  );
}
