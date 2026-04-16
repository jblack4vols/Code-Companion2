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
import { RoleGuard } from "@/components/role-guard";
import { User } from "@shared/schema";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ResetPasswordPage from "@/pages/reset-password";
import { IdleTimeout } from "@/components/idle-timeout";
import { ForcePasswordChange } from "@/components/force-password-change";
import { GlobalSearch } from "@/components/global-search";
import { MobileQuickActions } from "@/components/mobile-quick-actions";
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
const ProviderOfficeLinkerPage = lazy(() => import("@/pages/provider-office-linker"));
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
const RpvAnalyticsPage = lazy(() => import("@/pages/rpv-analytics"));
const ReferralIntelligencePage = lazy(() => import("@/pages/referral-intelligence"));
const RevenueDashboardPage = lazy(() => import("@/pages/revenue-dashboard"));
const RevenueClaimsPage = lazy(() => import("@/pages/revenue-claims"));
const RevenueDenialsPage = lazy(() => import("@/pages/revenue-denials"));
const RevenueBillingLagPage = lazy(() => import("@/pages/revenue-billing-lag"));
const RevenueAppealsPage = lazy(() => import("@/pages/revenue-appeals"));
const RevenueImportPage = lazy(() => import("@/pages/revenue-import"));
const FrontDeskPage = lazy(() => import("@/pages/frontdesk"));
const FeedbackPage = lazy(() => import("@/pages/feedback"));
const ProviderProductivityV2Page = lazy(() => import("@/pages/provider-productivity-v2"));
const LifecyclePage = lazy(() => import("@/pages/lifecycle"));
const CashFlowPage = lazy(() => import("@/pages/cash-flow"));

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

const ADMIN = ["OWNER", "DIRECTOR"];
const ANALYTICS = ["OWNER", "DIRECTOR", "ANALYST"];
const OUTREACH = ["OWNER", "DIRECTOR", "MARKETER"];

function guard(roles: string[], Page: React.ComponentType) {
  return () => (
    <RoleGuard roles={roles}>
      <Page />
    </RoleGuard>
  );
}

function AuthenticatedRouter() {
  return (
    <Suspense fallback={<LazyFallback />}>
      <Switch>
        {/* Open to all authenticated users */}
        <Route path="/" component={DashboardPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/physicians" component={PhysiciansPage} />
        <Route path="/physicians/:id">{(params) => <PhysicianDetailPage params={params} />}</Route>
        <Route path="/scorecard/:id">{(params) => <ProviderScorecardPage params={params} />}</Route>
        <Route path="/interactions" component={InteractionsPage} />
        <Route path="/referrals" component={ReferralsPage} />
        <Route path="/referral-explorer" component={ReferralExplorerPage} />
        <Route path="/provider-offices" component={ProviderOfficesPage} />
        <Route path="/provider-office-linker" component={ProviderOfficeLinkerPage} />
        <Route path="/activity" component={RecentActivityPage} />
        <Route path="/tiering" component={PhysicianTieringPage} />
        <Route path="/declining" component={DecliningReferralsPage} />
        <Route path="/practices" component={PracticeIntelligencePage} />
        <Route path="/practices/:name" component={PracticeIntelligencePage} />
        <Route path="/map" component={MapViewPage} />
        <Route path="/feedback" component={FeedbackPage} />

        {/* Outreach: OWNER, DIRECTOR, MARKETER */}
        <Route path="/quick-log" component={guard(OUTREACH, QuickLogPage)} />
        <Route path="/tasks" component={guard(OUTREACH, TasksPage)} />
        <Route path="/calendar" component={guard(OUTREACH, CalendarPage)} />
        <Route path="/hit-list" component={guard(OUTREACH, HitListPage)} />
        <Route path="/goals" component={guard(OUTREACH, GoalTrackingPage)} />

        {/* Analytics: OWNER, DIRECTOR, ANALYST */}
        <Route path="/dashboards/executive" component={guard(ANALYTICS, ExecutiveDashboardPage)} />
        <Route path="/dashboards/territory" component={guard(ANALYTICS, TerritoryDashboardPage)} />
        <Route path="/dashboards/location" component={guard(ANALYTICS, LocationDashboardPage)} />
        <Route path="/roi-calculator" component={guard(ANALYTICS, ROICalculatorPage)} />
        <Route path="/leaderboard" component={guard(ANALYTICS, TeamLeaderboardPage)} />

        {/* Analytics: RPV + Referral Intelligence */}
        <Route path="/rpv-analytics" component={guard(ANALYTICS, RpvAnalyticsPage)} />
        <Route path="/referral-intelligence" component={guard(ANALYTICS, ReferralIntelligencePage)} />
        <Route path="/provider-productivity-v2" component={guard(ANALYTICS, ProviderProductivityV2Page)} />
        <Route path="/lifecycle" component={guard(ANALYTICS, LifecyclePage)} />
        <Route path="/cash-flow" component={guard(ANALYTICS, CashFlowPage)} />

        {/* Finance: OWNER, DIRECTOR, ANALYST */}
        <Route path="/unit-economics" component={guard(ANALYTICS, UnitEconomicsDashboardPage)} />
        <Route path="/unit-economics/location/:id" component={guard(ANALYTICS, UnitEconomicsLocationDetailPage)} />
        <Route path="/unit-economics/providers" component={guard(ANALYTICS, UnitEconomicsProviderProductivityPage)} />
        <Route path="/unit-economics/alerts" component={guard(ANALYTICS, UnitEconomicsAlertsPage)} />
        <Route path="/unit-economics/targets" component={guard(ANALYTICS, UnitEconomicsTargetsPage)} />
        <Route path="/unit-economics/import" component={guard(ANALYTICS, UnitEconomicsDataImportPage)} />
        <Route path="/revenue" component={guard(ANALYTICS, RevenueDashboardPage)} />
        <Route path="/revenue/claims" component={guard(ANALYTICS, RevenueClaimsPage)} />
        <Route path="/revenue/denials" component={guard(ANALYTICS, RevenueDenialsPage)} />
        <Route path="/revenue/billing-lag" component={guard(ANALYTICS, RevenueBillingLagPage)} />
        <Route path="/revenue/appeals" component={guard(ANALYTICS, RevenueAppealsPage)} />
        <Route path="/revenue/import" component={guard(ANALYTICS, RevenueImportPage)} />

        {/* Admin: OWNER, DIRECTOR */}
        <Route path="/import" component={guard(ADMIN, ImportPage)} />
        <Route path="/admin/users" component={guard(ADMIN, AdminUsersPage)} />
        <Route path="/admin/locations" component={AdminLocationsPage} />
        <Route path="/admin/settings" component={guard(ADMIN, AdminSettingsPage)} />
        <Route path="/admin/audit-log" component={guard(ADMIN, AuditLogPage)} />
        <Route path="/admin/duplicates" component={guard(ADMIN, DuplicateDetectionPage)} />
        <Route path="/admin/unlinked-referrals" component={guard(ADMIN, UnlinkedReferralsPage)} />
        <Route path="/admin/scheduled-reports" component={guard(ADMIN, ScheduledReportsPage)} />
        <Route path="/admin/reports" component={guard(ADMIN, UserActivityReportsPage)} />
        <Route path="/admin/integrations" component={guard(ADMIN, IntegrationsPage)} />
        <Route path="/admin/sharepoint" component={guard(ADMIN, SharePointSyncPage)} />
        <Route path="/admin/templates" component={guard(ADMIN, InteractionTemplatesPage)} />
        <Route path="/admin/developer-guide" component={guard(ADMIN, DeveloperGuidePage)} />

        {/* Operations with specific role restrictions */}
        <Route path="/territories" component={guard(ADMIN, TerritoriesPage)} />
        <Route path="/frontdesk" component={guard([...ADMIN, "FRONT_DESK"], FrontDeskPage)} />

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

  const showForcePasswordChange = !!(user as User & { forcePasswordChange?: boolean }).forcePasswordChange;

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
          <main className="flex-1 overflow-auto pb-16 md:pb-0">
            <AuthenticatedRouter />
          </main>
          <MobileQuickActions />
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
