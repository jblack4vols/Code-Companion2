import { Link, useLocation } from "wouter";
import { CalendarDays } from "lucide-react";

/**
 * Floating action button that links to /calendar from any authenticated page.
 *
 * Positioning:
 * - Desktop: bottom-right, 1rem from edges.
 * - Mobile: bottom-right but lifted above the MobileQuickActions bottom
 *   nav (~4rem tall) plus safe-area inset, so it doesn't overlap.
 *
 * Hidden on the calendar page itself — pointless when you're already there.
 */
export function CalendarQuickLink() {
  const [location] = useLocation();
  if (location.startsWith("/calendar")) return null;

  return (
    <Link
      href="/calendar"
      className="fixed right-4 z-50 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover-elevate active-elevate-2 transition-shadow"
      data-testid="quicklink-calendar"
      aria-label="Open calendar"
      title="Open calendar"
    >
      <CalendarDays className="w-5 h-5" aria-hidden="true" />
    </Link>
  );
}
