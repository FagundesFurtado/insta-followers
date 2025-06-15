import { useState, useEffect, useRef, useCallback } from "react";
import { useDebounce } from "@/hooks/use-debounce";

interface AutosuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function AutosuggestInput({
  value,
  onChange,
  onSelect,
  placeholder,
  className = "",
}: AutosuggestInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedValue = useDebounce(value, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/suggest-username?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("Failed to fetch suggestions");
      
      const data = await response.json();
      setSuggestions(data.suggestions);
    } catch (err) {
      setError("Failed to load suggestions");
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions(debouncedValue);
  }, [debouncedValue, fetchSuggestions]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSuggestionClick = (suggestion: string) => {
    onSelect(suggestion);
    setShowSuggestions(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
      />
      
      {showSuggestions && (value.trim() || isLoading) && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          {isLoading ? (
            <div className="p-2 text-sm text-gray-500">Loading suggestions...</div>
          ) : error ? (
            <div className="p-2 text-sm text-red-500">{error}</div>
          ) : suggestions.length > 0 ? (
            <ul className="py-1">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                >
                  @{suggestion}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-2 text-sm text-gray-500">No suggestions found</div>
          )}
        </div>
      )}
    </div>
  );
} 