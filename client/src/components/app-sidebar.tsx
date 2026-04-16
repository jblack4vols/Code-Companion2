import { useState, useEffect } from "react";
import {
  LayoutDashboard, Users, Stethoscope, MessageSquare, FileText, ClipboardList, Settings, LogOut, ChevronDown, ChevronRight, Calendar, CalendarClock, MapPin, ScrollText, Award, TrendingDown, UserCheck, Upload, Cloud, Map, Copy, BarChart3, PieChart, Building2, Compass, ShieldCheck, LineChart, Crosshair, Plug, Link2, Code2, Target, DollarSign, Trophy, Zap, FileStack, Activity, ListChecks, AlertTriangle, XCircle, Clock, Scale, Search, Lightbulb,
} from "lucide-react";
import tristarLogo from "@assets/tristar-logo-transparent.png";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth, hasPermission } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const coreItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
  { title: "Hit List", url: "/hit-list", icon: ListChecks, roles: ["OWNER", "DIRECTOR", "MARKETER"] as string[] },
  { title: "Referring Providers", url: "/physicians", icon: Stethoscope },
  { title: "Patients", url: "/referrals", icon: FileText },
  { title: "Calendar", url: "/calendar", icon: Calendar, roles: ["OWNER", "DIRECTOR", "MARKETER"] as string[] },
];

const outreachItems = [
  { title: "Quick Log", url: "/quick-log", icon: Zap, roles: ["OWNER", "DIRECTOR", "MARKETER"] as string[] },
  { title: "Interactions", url: "/interactions", icon: MessageSquare, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
  { title: "Tasks", url: "/tasks", icon: ClipboardList, roles: ["OWNER", "DIRECTOR", "MARKETER"] as string[] },
  { title: "Recent Activity", url: "/activity", icon: Activity, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
];

const analyticsItems = [
  { title: "Executive", url: "/dashboards/executive", icon: PieChart, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
  { title: "Territory", url: "/dashboards/territory", icon: Compass, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
  { title: "Location", url: "/dashboards/location", icon: Building2, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
  { title: "RPV Analytics", url: "/rpv-analytics", icon: BarChart3, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
  { title: "Referral Intelligence", url: "/referral-intelligence", icon: Search, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
  { title: "ROI Calculator", url: "/roi-calculator", icon: DollarSign, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
  { title: "Leaderboard", url: "/leaderboard", icon: Trophy, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
  { title: "Tiering", url: "/tiering", icon: Award, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
  { title: "Declining", url: "/declining", icon: TrendingDown, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
  { title: "Practice Intelligence", url: "/practices", icon: Building2, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
  { title: "Provider Productivity", url: "/provider-productivity-v2", icon: Activity, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
  { title: "Patient Lifecycle", url: "/lifecycle", icon: ListChecks, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
  { title: "Cash Flow", url: "/cash-flow", icon: DollarSign, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
];

const opsItems = [
  { title: "Front Desk", url: "/frontdesk", icon: UserCheck, roles: ["OWNER", "DIRECTOR", "FRONT_DESK"] as string[] },
  { title: "Goals", url: "/goals", icon: Target, roles: ["OWNER", "DIRECTOR", "MARKETER"] as string[] },
  { title: "Map", url: "/map", icon: Map, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
  { title: "Territories", url: "/territories", icon: UserCheck, roles: ["OWNER", "DIRECTOR"] as string[] },
  { title: "Referral Explorer", url: "/referral-explorer", icon: Search },
  { title: "Provider Offices", url: "/provider-offices", icon: Building2 },
  { title: "Office Linker", url: "/provider-office-linker", icon: Link2 },
];

const financeItems = [
  { title: "Unit Economics", url: "/unit-economics", icon: DollarSign },
  { title: "Provider Productivity", url: "/unit-economics/providers", icon: Activity },
  { title: "Econ Alerts", url: "/unit-economics/alerts", icon: AlertTriangle },
  { title: "Econ Targets", url: "/unit-economics/targets", icon: Target },
  { title: "Revenue Dashboard", url: "/revenue", icon: Scale },
  { title: "Claims", url: "/revenue/claims", icon: FileText },
  { title: "Denials", url: "/revenue/denials", icon: XCircle },
  { title: "Billing Lag", url: "/revenue/billing-lag", icon: Clock },
  { title: "Appeals", url: "/revenue/appeals", icon: Scale },
];

const adminItems = [
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Locations", url: "/admin/locations", icon: MapPin },
  { title: "Duplicates", url: "/admin/duplicates", icon: Copy },
  { title: "Unlinked Referrals", url: "/admin/unlinked-referrals", icon: Link2 },
  { title: "Templates", url: "/admin/templates", icon: FileStack },
  { title: "Team Reports", url: "/admin/reports", icon: BarChart3 },
  { title: "Import Data", url: "/import", icon: Upload },
  { title: "SharePoint Sync", url: "/admin/sharepoint", icon: Cloud },
  { title: "Integrations", url: "/admin/integrations", icon: Plug },
  { title: "Scheduled Reports", url: "/admin/scheduled-reports", icon: CalendarClock },
  { title: "Audit Log", url: "/admin/audit-log", icon: ScrollText },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

const roleLabels: Record<string, string> = {
  OWNER: "Owner",
  DIRECTOR: "Director",
  MARKETER: "Marketer",
  FRONT_DESK: "Front Desk",
  ANALYST: "Analyst",
};

const roleBadgeVariant: Record<string, string> = {
  OWNER: "bg-chart-5/15 text-chart-5 dark:bg-chart-5/20 dark:text-chart-5",
  DIRECTOR: "bg-chart-1/15 text-chart-1 dark:bg-chart-1/20 dark:text-chart-1",
  MARKETER: "bg-chart-2/15 text-chart-2 dark:bg-chart-2/20 dark:text-chart-2",
  FRONT_DESK: "bg-chart-3/15 text-chart-3 dark:bg-chart-3/20 dark:text-chart-3",
  ANALYST: "bg-chart-4/15 text-chart-4 dark:bg-chart-4/20 dark:text-chart-4",
};

const outreachUrls = ["/quick-log", "/interactions", "/tasks", "/activity"];
const analyticsUrls = ["/dashboards/", "/rpv-analytics", "/referral-intelligence", "/roi-calculator", "/leaderboard", "/tiering", "/declining", "/practices", "/provider-productivity-v2", "/lifecycle", "/cash-flow"];
const opsUrls = ["/frontdesk", "/goals", "/map", "/territories", "/referral-explorer", "/provider-offices", "/provider-office-linker"];
const financeUrls = ["/unit-economics", "/revenue"];
const adminUrls = ["/admin/", "/import"];

function CollapsibleGroup({
  label,
  icon: Icon,
  items,
  isActive,
  open,
  onOpenChange,
  groupClass,
  userRole,
  location,
  closeMobileMenu,
}: {
  label: string;
  icon: any;
  items: { title: string; url: string; icon: any; roles?: string[] }[];
  isActive: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupClass: string;
  userRole: string;
  location: string;
  closeMobileMenu: () => void;
}) {
  const filtered = items.filter((item) => !item.roles || item.roles.includes(userRole));
  if (filtered.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <Collapsible open={open || isActive} onOpenChange={onOpenChange} className={groupClass}>
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  isActive={isActive}
                  data-testid={`button-${label.toLowerCase().replace(/\s+/g, "-")}-dropdown`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                  <ChevronRight className={`ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/${groupClass.replace("group/", "")}:rotate-90`} />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {filtered.map((item) => (
                    <SidebarMenuSubItem key={item.title}>
                      <SidebarMenuSubButton
                        asChild
                        isActive={location === item.url || (item.url !== "/" && location.startsWith(item.url + "/")) || (item.url !== "/" && location === item.url)}
                      >
                        <Link href={item.url} onClick={closeMobileMenu} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="w-3.5 h-3.5" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobileMenu = () => {
    if (isMobile) setOpenMobile(false);
  };

  const isOutreachActive = outreachUrls.some((u) => location === u || location.startsWith(u + "/"));
  const isAnalyticsActive = analyticsUrls.some((u) => location === u || location.startsWith(u));
  const isOpsActive = opsUrls.some((u) => location === u || location.startsWith(u + "/"));
  const isFinanceActive = financeUrls.some((u) => location === u || location.startsWith(u));
  const isAdminActive = adminUrls.some((u) => location === u || location.startsWith(u));

  const [outreachOpen, setOutreachOpen] = useState(isOutreachActive);
  const [analyticsOpen, setAnalyticsOpen] = useState(isAnalyticsActive);
  const [opsOpen, setOpsOpen] = useState(isOpsActive);
  const [financeOpen, setFinanceOpen] = useState(isFinanceActive);
  const [adminOpen, setAdminOpen] = useState(isAdminActive);

  useEffect(() => { if (!isOutreachActive) setOutreachOpen(false); }, [isOutreachActive]);
  useEffect(() => { if (!isAnalyticsActive) setAnalyticsOpen(false); }, [isAnalyticsActive]);
  useEffect(() => { if (!isOpsActive) setOpsOpen(false); }, [isOpsActive]);
  useEffect(() => { if (!isFinanceActive) setFinanceOpen(false); }, [isFinanceActive]);
  useEffect(() => { if (!isAdminActive) setAdminOpen(false); }, [isAdminActive]);

  if (!user) return null;

  const canManage = hasPermission(user.role, "manage_users") || user.role === "OWNER";
  const initials = user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const showAnalytics = ["OWNER", "DIRECTOR", "ANALYST", "MARKETER"].includes(user.role);
  const showFinance = ["OWNER", "DIRECTOR", "ANALYST"].includes(user.role);

  return (
    <Sidebar data-testid="sidebar">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <img src={tristarLogo} alt="Tristar Physical Therapy" className="h-9 w-auto object-contain" data-testid="img-logo" />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold truncate" data-testid="text-app-title">Tristar 360</span>
            <span className="text-[11px] text-muted-foreground tracking-wide uppercase">Provider CRM</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Core</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {coreItems
                .filter((item) => !item.roles || item.roles.includes(user.role))
                .map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url || (item.url !== "/" && location.startsWith(item.url))}
                  >
                    <Link href={item.url} onClick={closeMobileMenu} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <CollapsibleGroup
          label="Outreach"
          icon={MessageSquare}
          items={outreachItems}
          isActive={isOutreachActive}
          open={outreachOpen}
          onOpenChange={setOutreachOpen}
          groupClass="group/outreach"
          userRole={user.role}
          location={location}
          closeMobileMenu={closeMobileMenu}
        />

        {showAnalytics && (
          <CollapsibleGroup
            label="Analytics"
            icon={LineChart}
            items={analyticsItems}
            isActive={isAnalyticsActive}
            open={analyticsOpen}
            onOpenChange={setAnalyticsOpen}
            groupClass="group/analytics"
            userRole={user.role}
            location={location}
            closeMobileMenu={closeMobileMenu}
          />
        )}

        <CollapsibleGroup
          label="Operations"
          icon={Crosshair}
          items={opsItems}
          isActive={isOpsActive}
          open={opsOpen}
          onOpenChange={setOpsOpen}
          groupClass="group/ops"
          userRole={user.role}
          location={location}
          closeMobileMenu={closeMobileMenu}
        />

        {showFinance && (
          <CollapsibleGroup
            label="Finance"
            icon={DollarSign}
            items={financeItems}
            isActive={isFinanceActive}
            open={financeOpen}
            onOpenChange={setFinanceOpen}
            groupClass="group/finance"
            userRole={user.role}
            location={location}
            closeMobileMenu={closeMobileMenu}
          />
        )}

        {canManage && (
          <CollapsibleGroup
            label="Administration"
            icon={ShieldCheck}
            items={adminItems}
            isActive={isAdminActive}
            open={adminOpen}
            onOpenChange={setAdminOpen}
            groupClass="group/admin"
            userRole={user.role}
            location={location}
            closeMobileMenu={closeMobileMenu}
          />
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-3 w-full rounded-md p-2 text-left hover-elevate"
              data-testid="button-user-menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium truncate" data-testid="text-user-name">{user.name}</span>
                <Badge variant="outline" className={`w-fit text-[10px] px-1.5 py-0 ${roleBadgeVariant[user.role] || ""}`}>
                  {roleLabels[user.role] || user.role}
                </Badge>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="text-xs text-muted-foreground" disabled>
              {user.email}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/feedback" onClick={closeMobileMenu} data-testid="link-nav-feedback">
                <Lightbulb className="w-4 h-4 mr-2" />
                Feedback & Support
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
