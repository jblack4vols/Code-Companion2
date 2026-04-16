import { useLocation, Link } from "wouter";
import { LayoutDashboard, MessageSquare, Stethoscope, ClipboardList } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  testId: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: LayoutDashboard, testId: "mobile-nav-home" },
  { label: "Log", href: "/quick-log", icon: MessageSquare, testId: "mobile-nav-log" },
  { label: "Providers", href: "/physicians", icon: Stethoscope, testId: "mobile-nav-providers" },
  { label: "Tasks", href: "/tasks", icon: ClipboardList, testId: "mobile-nav-tasks" },
];

export function MobileQuickActions() {
  const [location] = useLocation();

  function isActive(href: string) {
    if (href === "/") return location === "/" || location === "/dashboard";
    return location.startsWith(href);
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-background/80 backdrop-blur-md border-t border-border pb-[env(safe-area-inset-bottom)]"
      data-testid="mobile-quick-actions"
      aria-label="Mobile quick navigation"
    >
      <ul className="flex items-stretch">
        {NAV_ITEMS.map(({ label, href, icon: Icon, testId }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1 relative">
              <Link
                href={href}
                className={`flex flex-col items-center justify-center gap-1 py-2 w-full text-[10px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={testId}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
              {active && (
                <span
                  className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
