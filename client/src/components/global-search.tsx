import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Search, User, FileText, X } from "lucide-react";

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results } = useQuery<{ physicians: any[]; referrals: any[] }>({
    queryKey: ["/api/search", query],
    queryFn: async () => {
      if (query.length < 2) return { physicians: [], referrals: [] };
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    enabled: query.length >= 2,
    staleTime: 500,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const hasResults = results && (results.physicians.length > 0 || results.referrals.length > 0);

  const navigateTo = (path: string) => {
    setLocation(path);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-sm" data-testid="global-search-container">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search providers, referrals... (Ctrl+K)"
          className="pl-9 pr-8 h-8 text-sm"
          data-testid="input-global-search"
        />
        {query && (
          <button onClick={() => { setQuery(""); setOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && query.length >= 2 && (
        <div className="absolute top-full mt-1 w-full bg-popover border rounded-md shadow-lg z-[100] max-h-80 overflow-y-auto" data-testid="search-results-dropdown">
          {!hasResults && <p className="p-3 text-sm text-muted-foreground">No results found</p>}
          {results && results.physicians.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">Referring Providers</p>
              {results.physicians.map((p) => (
                <button key={p.id} onClick={() => navigateTo(`/physicians/${p.id}`)} className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 text-sm" data-testid={`search-result-physician-${p.id}`}>
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <span className="font-medium">{p.lastName}, {p.firstName}</span>
                    {p.credentials && <span className="text-muted-foreground">, {p.credentials}</span>}
                    {p.npi && <span className="text-xs text-muted-foreground ml-2">NPI: {p.npi}</span>}
                    {p.practiceName && <span className="block text-xs text-muted-foreground truncate">{p.practiceName}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {results && results.referrals.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">Referrals</p>
              {results.referrals.map((r) => (
                <button key={r.id} onClick={() => navigateTo("/referrals")} className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 text-sm" data-testid={`search-result-referral-${r.id}`}>
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <span className="font-medium">{r.patientFullName || r.patientAccountNumber || "Unknown"}</span>
                    {r.referringProviderName && <span className="text-xs text-muted-foreground ml-2">from {r.referringProviderName}</span>}
                    {r.referralDate && <span className="block text-xs text-muted-foreground">{r.referralDate}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}