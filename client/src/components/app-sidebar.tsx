import { useState, useEffect } from "react";
import {
  LayoutDashboard, Users, Stethoscope, MessageSquare, FileText, ClipboardList, Settings, LogOut, ChevronDown, ChevronRight, Calendar, CalendarClock, MapPin, ScrollText, Award, TrendingDown, UserCheck, Upload, Cloud, Map, Copy, BarChart3, PieChart, Building2, Compass, ShieldCheck, LineChart, Crosshair, Plug,
} from "lucide-react";
import tristarLogo from "@assets/Jordan_Black_-_Transparent_Bacground_PNG_File.638e6192486320._1770818919661.jpeg";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth, hasPermission } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
  { title: "Referring Providers", url: "/physicians", icon: Stethoscope, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
  { title: "Interactions", url: "/interactions", icon: MessageSquare, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
  { title: "Referrals", url: "/referrals", icon: FileText },
  { title: "Calendar", url: "/calendar", icon: Calendar, roles: ["OWNER", "DIRECTOR", "MARKETER"] as string[] },
];

const opsItems = [
  { title: "Tiering", url: "/tiering", icon: Award, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
  { title: "Declining", url: "/declining", icon: TrendingDown, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
  { title: "Tasks", url: "/tasks", icon: ClipboardList, roles: ["OWNER", "DIRECTOR", "MARKETER"] as string[] },
  { title: "Map", url: "/map", icon: Map, roles: ["OWNER", "DIRECTOR", "MARKETER", "ANALYST"] as string[] },
  { title: "Territories", url: "/territories", icon: UserCheck, roles: ["OWNER", "DIRECTOR"] as string[] },
];

const dashboardItems = [
  { title: "Executive", url: "/dashboards/executive", icon: PieChart, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
  { title: "Territory", url: "/dashboards/territory", icon: Compass, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
  { title: "Location", url: "/dashboards/location", icon: Building2, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] },
];

const adminItems = [
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Locations", url: "/admin/locations", icon: MapPin },
  { title: "Duplicates", url: "/admin/duplicates", icon: Copy },
  { title: "Team Reports", url: "/admin/reports", icon: BarChart3 },
  { title: "Import", url: "/import", icon: Upload },
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

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const isAdminActive = location.startsWith("/admin/") || location === "/import";
  const isIntelActive = location.startsWith("/dashboards/");
  const opsUrls = ["/tiering", "/declining", "/tasks", "/map", "/territories"];
  const isOpsActive = opsUrls.some((u) => location === u || location.startsWith(u + "/"));
  const [adminOpen, setAdminOpen] = useState(isAdminActive);
  const [intelOpen, setIntelOpen] = useState(isIntelActive);
  const [opsOpen, setOpsOpen] = useState(isOpsActive);

  useEffect(() => {
    if (!isAdminActive) setAdminOpen(false);
  }, [isAdminActive]);

  useEffect(() => {
    if (!isIntelActive) setIntelOpen(false);
  }, [isIntelActive]);

  useEffect(() => {
    if (!isOpsActive) setOpsOpen(false);
  }, [isOpsActive]);

  if (!user) return null;

  const canManage = hasPermission(user.role, "manage_users") || user.role === "OWNER";
  const initials = user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Sidebar data-testid="sidebar">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={tristarLogo} alt="Tristar Physical Therapy" className="h-9 w-auto object-contain" data-testid="img-logo" />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold truncate" data-testid="text-app-title">Tristar 360</span>
            <span className="text-xs text-muted-foreground">Provider CRM</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems
                .filter((item) => !item.roles || item.roles.includes(user.role))
                .map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url || (item.url !== "/" && location.startsWith(item.url))}
                  >
                    <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase()}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <Collapsible open={opsOpen || isOpsActive} onOpenChange={setOpsOpen} className="group/ops">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={isOpsActive}
                      data-testid="button-operations-dropdown"
                    >
                      <Crosshair className="w-4 h-4" />
                      <span>Operations</span>
                      <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/ops:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {opsItems
                        .filter((item) => !item.roles || item.roles.includes(user.role))
                        .map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={location === item.url || location.startsWith(item.url + "/")}
                          >
                            <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase()}`}>
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

        {(user.role === "OWNER" || user.role === "DIRECTOR" || user.role === "ANALYST") && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible open={intelOpen || isIntelActive} onOpenChange={setIntelOpen} className="group/intel">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        isActive={isIntelActive}
                        data-testid="button-intelligence-dropdown"
                      >
                        <LineChart className="w-4 h-4" />
                        <span>Intelligence</span>
                        <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/intel:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {dashboardItems
                          .filter((item) => !item.roles || item.roles.includes(user.role))
                          .map((item) => (
                          <SidebarMenuSubItem key={item.title}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location === item.url || location.startsWith(item.url)}
                            >
                              <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase()}`}>
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
        )}

        {canManage && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible open={adminOpen || isAdminActive} onOpenChange={setAdminOpen} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        isActive={isAdminActive}
                        data-testid="button-admin-dropdown"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Administration</span>
                        <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {adminItems.map((item) => (
                          <SidebarMenuSubItem key={item.title}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location.startsWith(item.url)}
                            >
                              <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
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
        )}
      </SidebarContent>

      <SidebarFooter className="p-3">
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
