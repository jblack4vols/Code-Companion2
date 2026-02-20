import { Switch, Route } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import PhysiciansPage from "@/pages/physicians";
import PhysicianDetailPage from "@/pages/physician-detail";
import InteractionsPage from "@/pages/interactions";
import ReferralsPage from "@/pages/referrals";
import TasksPage from "@/pages/tasks";
import AdminUsersPage from "@/pages/admin-users";
import AdminSettingsPage from "@/pages/admin-settings";
import CalendarPage from "@/pages/calendar";
import AdminLocationsPage from "@/pages/admin-locations";
import AuditLogPage from "@/pages/audit-log";
import PhysicianTieringPage from "@/pages/physician-tiering";
import DecliningReferralsPage from "@/pages/declining-referrals";
import TerritoriesPage from "@/pages/territories";
import ImportPage from "@/pages/import";
import SharePointSyncPage from "@/pages/sharepoint-sync";
import MapViewPage from "@/pages/map-view";
import DuplicateDetectionPage from "@/pages/duplicate-detection";
import UserActivityReportsPage from "@/pages/user-activity-reports";
import IntegrationsPage from "@/pages/integrations";
import ExecutiveDashboardPage from "@/pages/executive-dashboard";
import TerritoryDashboardPage from "@/pages/territory-dashboard";
import LocationDashboardPage from "@/pages/location-dashboard";
import ScheduledReportsPage from "@/pages/scheduled-reports";
import UnlinkedReferralsPage from "@/pages/unlinked-referrals";
import ProviderOfficesPage from "@/pages/provider-offices";
import { IdleTimeout } from "@/components/idle-timeout";
import { ForcePasswordChange } from "@/components/force-password-change";
import { GlobalSearch } from "@/components/global-search";
import { Loader2 } from "lucide-react";

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/physicians" component={PhysiciansPage} />
      <Route path="/physicians/:id">{(params) => <PhysicianDetailPage params={params} />}</Route>
      <Route path="/interactions" component={InteractionsPage} />
      <Route path="/referrals" component={ReferralsPage} />
      <Route path="/provider-offices" component={ProviderOfficesPage} />
      <Route path="/tasks" component={TasksPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/tiering" component={PhysicianTieringPage} />
      <Route path="/declining" component={DecliningReferralsPage} />
      <Route path="/territories" component={TerritoriesPage} />
      <Route path="/map" component={MapViewPage} />
      <Route path="/dashboards/executive" component={ExecutiveDashboardPage} />
      <Route path="/dashboards/territory" component={TerritoryDashboardPage} />
      <Route path="/dashboards/location" component={LocationDashboardPage} />
      <Route path="/import" component={ImportPage} />
      <Route path="/admin/sharepoint" component={SharePointSyncPage} />
      <Route path="/admin/duplicates" component={DuplicateDetectionPage} />
      <Route path="/admin/reports" component={UserActivityReportsPage} />
      <Route path="/admin/users" component={AdminUsersPage} />
      <Route path="/admin/locations" component={AdminLocationsPage} />
      <Route path="/admin/settings" component={AdminSettingsPage} />
      <Route path="/admin/audit-log" component={AuditLogPage} />
      <Route path="/admin/integrations" component={IntegrationsPage} />
      <Route path="/admin/scheduled-reports" component={ScheduledReportsPage} />
      <Route path="/admin/unlinked-referrals" component={UnlinkedReferralsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const showForcePasswordChange = !!(user as any).forcePasswordChange;

  const handlePasswordChanged = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-2 border-b h-12 shrink-0 sticky top-0 z-50 bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <GlobalSearch />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <AuthenticatedRouter />
          </main>
        </div>
      </div>
      <ForcePasswordChange open={showForcePasswordChange} onPasswordChanged={handlePasswordChanged} />
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <AppLayout />
            <IdleTimeout />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
