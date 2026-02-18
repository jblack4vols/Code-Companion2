import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { MapPin, Stethoscope, Filter, X, Building2, Search } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Physician } from "@shared/schema";
import { useLocation as useWouterLocation } from "wouter";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const CITY_COORDS: Record<string, [number, number]> = {
  "johnson city": [36.31, -82.35],
  "morristown": [36.21, -83.29],
  "newport": [35.97, -83.19],
  "rogersville": [36.41, -83.01],
  "maryville": [35.76, -83.97],
  "jefferson city": [36.12, -83.49],
  "new tazewell": [36.44, -83.60],
  "bean station": [36.34, -83.28],
};

const STAGE_COLORS: Record<string, string> = {
  NEW: "hsl(var(--chart-1))",
  DEVELOPING: "hsl(var(--chart-3))",
  STRONG: "hsl(var(--chart-4))",
  AT_RISK: "hsl(var(--chart-5))",
};

const STAGE_BADGE_CLASS: Record<string, string> = {
  NEW: "bg-chart-1/15 text-chart-1",
  DEVELOPING: "bg-chart-3/15 text-chart-3",
  STRONG: "bg-chart-4/15 text-chart-4",
  AT_RISK: "bg-chart-5/15 text-chart-5",
};

function createStageIcon(stage: string) {
  const color = STAGE_COLORS[stage] || STAGE_COLORS.NEW;
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

function getCoords(city: string | null | undefined): [number, number] | null {
  if (!city) return null;
  return CITY_COORDS[city.toLowerCase().trim()] || null;
}

export default function MapViewPage() {
  const [, navigate] = useWouterLocation();
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: physicians, isLoading } = useQuery<Physician[]>({
    queryKey: ["/api/physicians"],
  });

  const filtered = useMemo(() => {
    if (!physicians) return [];
    return physicians.filter((p) => {
      if (stageFilter !== "all" && p.relationshipStage !== stageFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
        if (!fullName.includes(q) && !(p.practiceName || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [physicians, stageFilter, statusFilter, search]);

  const { mapped, unmapped } = useMemo(() => {
    const m: Array<Physician & { coords: [number, number] }> = [];
    const u: Physician[] = [];
    for (const p of filtered) {
      const coords = getCoords(p.city);
      if (coords) {
        const jitter = (Math.random() - 0.5) * 0.01;
        m.push({ ...p, coords: [coords[0] + jitter, coords[1] + jitter] });
      } else {
        u.push(p);
      }
    }
    return { mapped: m, unmapped: u };
  }, [filtered]);

  const clearFilters = () => {
    setStageFilter("all");
    setStatusFilter("all");
    setSearch("");
  };

  const hasActiveFilters = stageFilter !== "all" || statusFilter !== "all" || search !== "";

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <div>
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-4" style={{ height: "calc(100vh - 3rem)" }}>
          <div className="w-80 shrink-0 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
          <Skeleton className="flex-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-map-title">
            Physician Map
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Geographic view of your physician network
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search physicians..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-48"
              data-testid="input-search-map"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-filter-stage">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              <SelectItem value="NEW">New</SelectItem>
              <SelectItem value="DEVELOPING">Developing</SelectItem>
              <SelectItem value="STRONG">Strong</SelectItem>
              <SelectItem value="AT_RISK">At Risk</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]" data-testid="select-filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="PROSPECT">Prospect</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 3rem)" }}>
        <Card className="w-80 shrink-0 flex flex-col overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Physicians</h3>
            </div>
            <Badge variant="secondary" className="text-[10px]" data-testid="badge-physician-count">
              {filtered.length}
            </Badge>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto">
            <div className="space-y-0.5 p-2">
              {mapped.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 font-medium">
                    On Map ({mapped.length})
                  </p>
                  {mapped.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => navigate(`/physicians/${p.id}`)}
                      data-testid={`link-physician-map-${p.id}`}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: STAGE_COLORS[p.relationshipStage] }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" data-testid={`text-physician-name-${p.id}`}>
                          Dr. {p.firstName} {p.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.city}{p.practiceName ? ` - ${p.practiceName}` : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {unmapped.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 font-medium">
                    No Location ({unmapped.length})
                  </p>
                  {unmapped.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => navigate(`/physicians/${p.id}`)}
                      data-testid={`link-physician-nomap-${p.id}`}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: STAGE_COLORS[p.relationshipStage] }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" data-testid={`text-physician-name-${p.id}`}>
                          Dr. {p.firstName} {p.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.practiceName || "No practice"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MapPin className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No physicians match filters</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex-1 rounded-md overflow-hidden border" data-testid="map-container">
          <MapContainer
            center={[36.3, -83.2]}
            zoom={9}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {mapped.map((p) => (
              <Marker
                key={p.id}
                position={p.coords}
                icon={createStageIcon(p.relationshipStage)}
              >
                <Popup>
                  <div className="space-y-1 min-w-[180px]">
                    <p className="font-semibold text-sm" data-testid={`popup-name-${p.id}`}>
                      Dr. {p.firstName} {p.lastName}
                    </p>
                    {p.practiceName && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building2 className="w-3 h-3 inline" />
                        {p.practiceName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3 inline" />
                      {p.city}{p.state ? `, ${p.state}` : ""}
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${STAGE_BADGE_CLASS[p.relationshipStage]}`}
                    >
                      {p.relationshipStage.replace("_", " ")}
                    </Badge>
                    <div className="pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => navigate(`/physicians/${p.id}`)}
                        data-testid={`button-view-physician-${p.id}`}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
