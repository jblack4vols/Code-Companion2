import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, MapPin, Cloud, CheckCircle, XCircle, Loader2, Lock, Timer, KeyRound, ShieldCheck, Eye } from "lucide-react";
import type { Location } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";
import { Link } from "wouter";

export default function AdminSettingsPage() {
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const { data: integrationStatus, isLoading: loadingStatus } = useQuery<{ outlook: boolean; sharepoint: boolean }>({
    queryKey: ["/api/integrations/status"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const securityFeatures = [
    {
      icon: Timer,
      title: "Auto Session Timeout",
      description: "Sessions expire after 15 minutes of inactivity with a 2-minute warning",
      status: "Active",
    },
    {
      icon: Lock,
      title: "Account Lockout",
      description: "Accounts lock for 15 minutes after 5 failed login attempts",
      status: "Active",
    },
    {
      icon: KeyRound,
      title: "Password Strength Policy",
      description: "Minimum 8 characters with uppercase, lowercase, number, and special character required",
      status: "Active",
    },
    {
      icon: Eye,
      title: "Audit Logging",
      description: "All data access, logins, and modifications are logged with IP address and timestamp",
      status: "Active",
    },
    {
      icon: ShieldCheck,
      title: "Security Headers",
      description: "X-Frame-Options, HSTS, CSP, XSS Protection, and Referrer-Policy headers enforced",
      status: "Active",
    },
    {
      icon: Shield,
      title: "Role-Based Access Control",
      description: "5 role levels (Owner, Director, Marketer, Front Desk, Analyst) with granular permissions",
      status: "Active",
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Application configuration, security, and compliance</p>
      </div>

      <Card className="border-chart-3/30" data-testid="card-hipaa-banner">
        <CardContent className="p-4 flex gap-3">
          <div className="w-10 h-10 rounded-md bg-chart-3/15 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-chart-3" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-chart-3">HIPAA Compliance Status</h3>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>All data access is logged with audit trail (IP, timestamp, user, action)</li>
              <li>Sessions auto-expire after 15 minutes of inactivity</li>
              <li>Account lockout after 5 failed login attempts</li>
              <li>Strong password policy enforced (8+ chars, complexity requirements)</li>
              <li>Role-based access control limits data visibility by user role</li>
              <li>Security headers protect against XSS, clickjacking, and data leaks</li>
              <li>All connections encrypted via HTTPS/TLS</li>
              <li>Import tools block columns that appear to contain PHI (DOB, SSN, MRN)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-security-safeguards">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Security Safeguards</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          {securityFeatures.map((feature) => (
            <div key={feature.title} className="flex items-center gap-3 p-3 rounded-md border" data-testid={`security-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="w-8 h-8 rounded-md bg-chart-4/15 flex items-center justify-center shrink-0">
                <feature.icon className="w-4 h-4 text-chart-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{feature.title}</p>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
              <Badge variant="outline" className="bg-chart-4/15 text-chart-4 text-[10px] gap-1 shrink-0">
                <CheckCircle className="w-3 h-3" />
                {feature.status}
              </Badge>
            </div>
          ))}
          <div className="pt-2">
            <Link href="/admin/audit-log" className="text-xs text-primary hover:underline" data-testid="link-view-audit-log">
              View Full Audit Log
            </Link>
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
