import { lazy, Suspense } from "react";
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
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ResetPasswordPage from "@/pages/reset-password";
import { IdleTimeout } from "@/components/idle-timeout";
import { ForcePasswordChange } from "@/components/force-password-change";
import { GlobalSearch } from "@/components/global-search";
import { Loader2 } from "lucide-react";

const DashboardPage = lazy(() => import("@/pages/dashboard"));
const PhysiciansPage = lazy(() => import("@/pages/physicians"));
const PhysicianDetailPage = lazy(() => import("@/pages/physician-detail"));
const InteractionsPage = lazy(() => import("@/pages/interactions"));
const ReferralsPage = lazy(() => import("@/pages/referrals"));
const ReferralExplorerPage = lazy(() => import("@/pages/referral-explorer"));
const TasksPage = lazy(() => import("@/pages/tasks"));
const AdminUsersPage = lazy(() => import("@/pages/admin-users"));
const AdminSettingsPage = lazy(() => import("@/pages/admin-settings"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const AdminLocationsPage = lazy(() => import("@/pages/admin-locations"));
const AuditLogPage = lazy(() => import("@/pages/audit-log"));
const PhysicianTieringPage = lazy(() => import("@/pages/physician-tiering"));
const DecliningReferralsPage = lazy(() => import("@/pages/declining-referrals"));
const TerritoriesPage = lazy(() => import("@/pages/territories"));
const ImportPage = lazy(() => import("@/pages/import"));
const SharePointSyncPage = lazy(() => import("@/pages/sharepoint-sync"));
const MapViewPage = lazy(() => import("@/pages/map-view"));
const DuplicateDetectionPage = lazy(() => import("@/pages/duplicate-detection"));
const UserActivityReportsPage = lazy(() => import("@/pages/user-activity-reports"));
const IntegrationsPage = lazy(() => import("@/pages/integrations"));
const ExecutiveDashboardPage = lazy(() => import("@/pages/executive-dashboard"));
const TerritoryDashboardPage = lazy(() => import("@/pages/territory-dashboard"));
const LocationDashboardPage = lazy(() => import("@/pages/location-dashboard"));
const ScheduledReportsPage = lazy(() => import("@/pages/scheduled-reports"));
const UnlinkedReferralsPage = lazy(() => import("@/pages/unlinked-referrals"));
const ProviderOfficesPage = lazy(() => import("@/pages/provider-offices"));
const DeveloperGuidePage = lazy(() => import("@/pages/developer-guide"));
const ProviderScorecardPage = lazy(() => import("@/pages/provider-scorecard"));
const GoalTrackingPage = lazy(() => import("@/pages/goal-tracking"));
const InteractionTemplatesPage = lazy(() => import("@/pages/interaction-templates"));
const QuickLogPage = lazy(() => import("@/pages/quick-log"));
const ROICalculatorPage = lazy(() => import("@/pages/roi-calculator"));
const TeamLeaderboardPage = lazy(() => import("@/pages/team-leaderboard"));
const RecentActivityPage = lazy(() => import("@/pages/recent-activity"));
const HitListPage = lazy(() => import("@/pages/hit-list"));
const PracticeIntelligencePage = lazy(() => import("@/pages/practice-intelligence"));
const UnitEconomicsDashboardPage = lazy(() => import("@/pages/unit-economics-dashboard"));
const UnitEconomicsLocationDetailPage = lazy(() => import("@/pages/unit-economics-location-detail"));
const UnitEconomicsProviderProductivityPage = lazy(() => import("@/pages/unit-economics-provider-productivity"));
const UnitEconomicsAlertsPage = lazy(() => import("@/pages/unit-economics-alerts"));
const UnitEconomicsTargetsPage = lazy(() => import("@/pages/unit-economics-targets"));
const UnitEconomicsDataImportPage = lazy(() => import("@/pages/unit-economics-data-import"));
const RevenueDashboardPage = lazy(() => import("@/pages/revenue-dashboard"));
const RevenueClaimsPage = lazy(() => import("@/pages/revenue-claims"));
const RevenueDenialsPage = lazy(() => import("@/pages/revenue-denials"));
const RevenueBillingLagPage = lazy(() => import("@/pages/revenue-billing-lag"));
const RevenueAppealsPage = lazy(() => import("@/pages/revenue-appeals"));
const RevenueImportPage = lazy(() => import("@/pages/revenue-import"));
const FrontDeskPage = lazy(() => import("@/pages/frontdesk"));

function LazyFallback() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function AuthenticatedRouter() {
  return (
    <Suspense fallback={<LazyFallback />}>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/physicians" component={PhysiciansPage} />
        <Route path="/physicians/:id">{(params) => <PhysicianDetailPage params={params} />}</Route>
        <Route path="/scorecard/:id">{(params) => <ProviderScorecardPage params={params} />}</Route>
        <Route path="/interactions" component={InteractionsPage} />
        <Route path="/referrals" component={ReferralsPage} />
        <Route path="/referral-explorer" component={ReferralExplorerPage} />
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
        <Route path="/admin/developer-guide" component={DeveloperGuidePage} />
        <Route path="/goals" component={GoalTrackingPage} />
        <Route path="/quick-log" component={QuickLogPage} />
        <Route path="/roi-calculator" component={ROICalculatorPage} />
        <Route path="/leaderboard" component={TeamLeaderboardPage} />
        <Route path="/activity" component={RecentActivityPage} />
        <Route path="/hit-list" component={HitListPage} />
        <Route path="/practices" component={PracticeIntelligencePage} />
        <Route path="/practices/:name" component={PracticeIntelligencePage} />
        <Route path="/admin/templates" component={InteractionTemplatesPage} />
        <Route path="/unit-economics" component={UnitEconomicsDashboardPage} />
        <Route path="/unit-economics/location/:id" component={UnitEconomicsLocationDetailPage} />
        <Route path="/unit-economics/providers" component={UnitEconomicsProviderProductivityPage} />
        <Route path="/unit-economics/alerts" component={UnitEconomicsAlertsPage} />
        <Route path="/unit-economics/targets" component={UnitEconomicsTargetsPage} />
        <Route path="/unit-economics/import" component={UnitEconomicsDataImportPage} />
        <Route path="/revenue" component={RevenueDashboardPage} />
        <Route path="/revenue/claims" component={RevenueClaimsPage} />
        <Route path="/revenue/denials" component={RevenueDenialsPage} />
        <Route path="/revenue/billing-lag" component={RevenueBillingLagPage} />
        <Route path="/revenue/appeals" component={RevenueAppealsPage} />
        <Route path="/revenue/import" component={RevenueImportPage} />
        <Route path="/frontdesk" component={FrontDeskPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
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
    const path = window.location.pathname;
    if (path === "/reset-password") {
      return <ResetPasswordPage />;
    }
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
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

export default App;
