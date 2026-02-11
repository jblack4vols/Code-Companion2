import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, MapPin, Cloud, CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { Location } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";

export default function AdminSettingsPage() {
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const { data: integrationStatus, isLoading: loadingStatus } = useQuery<{ outlook: boolean; sharepoint: boolean }>({
    queryKey: ["/api/integrations/status"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Application configuration and compliance</p>
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

      <Card data-testid="card-integrations">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Cloud className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Microsoft Integrations</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingStatus ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking connection status...
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 p-3 rounded-md border" data-testid="status-outlook">
                <div className="w-8 h-8 rounded-md bg-chart-1/15 flex items-center justify-center">
                  <Cloud className="w-4 h-4 text-chart-1" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Outlook Calendar</p>
                  <p className="text-xs text-muted-foreground">Sync events to Microsoft Outlook</p>
                </div>
                {integrationStatus?.outlook ? (
                  <Badge variant="outline" className="bg-chart-4/15 text-chart-4 text-[10px] gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] gap-1">
                    <XCircle className="w-3 h-3" />
                    Not Connected
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 p-3 rounded-md border" data-testid="status-sharepoint">
                <div className="w-8 h-8 rounded-md bg-chart-2/15 flex items-center justify-center">
                  <Cloud className="w-4 h-4 text-chart-2" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">SharePoint</p>
                  <p className="text-xs text-muted-foreground">Access documents and files</p>
                </div>
                {integrationStatus?.sharepoint ? (
                  <Badge variant="outline" className="bg-chart-4/15 text-chart-4 text-[10px] gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] gap-1">
                    <XCircle className="w-3 h-3" />
                    Not Connected
                  </Badge>
                )}
              </div>
            </>
          )}
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
