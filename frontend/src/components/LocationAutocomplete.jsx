import { useEffect, useRef, useState } from "react";
import { autocompletePlaces } from "../api.js";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

// Requiring an explicit selection (not just typed text) is the actual fix
// for two problems at once: a typo gets caught immediately because nothing
// matches or the real place shows up in the list, and a correctly-spelled
// but ambiguous name can't silently resolve to the wrong city/area, because
// the user is choosing from real, labeled candidates with known coordinates.
export default function LocationAutocomplete({ label, placeholder, onSelect }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  function handleInput(e) {
    const text = e.target.value;
    setQuery(text);
    onSelect(null); // any manual edit invalidates a previously selected place

    clearTimeout(debounceRef.current);
    if (text.trim().length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await autocompletePlaces(text);
        setSuggestions(results);
        setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  }

  function handleSelect(place) {
    setQuery(place.label);
    onSelect(place);
    setSuggestions([]);
    setOpen(false);
  }

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return (
    <div className="relative">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        placeholder={placeholder}
        value={query}
        onChange={handleInput}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} // delay so a click on a suggestion registers first
        autoComplete="off"
        required
      />
      {open && (
        <ul className="absolute z-30 w-full bg-white border border-slate-200 rounded-lg mt-1 shadow-lg max-h-56 overflow-y-auto">
          {loading && <li className="px-3 py-2 text-sm text-slate-400">Searching...</li>}
          {!loading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">No matches in Chennai — check the spelling</li>
          )}
          {!loading &&
            suggestions.map((s, i) => (
              <li
                key={i}
                onMouseDown={() => handleSelect(s)}
                className="px-3 py-2 text-sm hover:bg-brand-50 cursor-pointer"
              >
                {s.label}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
