import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, MapPin, AlertTriangle } from "lucide-react";
import type { Location } from "@shared/schema";

export default function AdminSettingsPage() {
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
        <p className="text-sm text-muted-foreground">Application configuration and compliance</p>
      </div>

      <Card className="border-chart-3/30" data-testid="card-hipaa-banner">
        <CardContent className="p-4 flex gap-3">
          <div className="w-10 h-10 rounded-md bg-chart-3/15 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-chart-3" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-chart-3">HIPAA Safety Notice</h3>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>This application is for Physician Relationship Management (PRM) only</li>
              <li>Do NOT enter Protected Health Information (PHI)</li>
              <li>Referrals use anonymized patient IDs only (initials or generated codes)</li>
              <li>Import tools will block columns that appear to contain PHI (DOB, SSN, MRN, etc.)</li>
              <li>Contact your compliance officer with questions about data handling</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Clinic Locations</h3>
        </CardHeader>
        <CardContent className="space-y-2">
          {locations?.map(l => (
            <div key={l.id} className="flex items-center gap-3 p-3 rounded-md border" data-testid={`card-location-${l.id}`}>
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
                {l.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{l.name}</p>
                <p className="text-xs text-muted-foreground">{l.address}, {l.city}, {l.state}</p>
              </div>
              <Badge variant="outline" className={`text-[10px] ${l.isActive ? "bg-chart-4/15 text-chart-4" : "bg-muted text-muted-foreground"}`}>
                {l.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
