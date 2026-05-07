import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoonStar } from "lucide-react";
import { GoneDarkPanel, type GoneDarkSource } from "./referral-intelligence-gone-dark";

/**
 * Standalone "Providers Have Gone Dark" page — the same alert panel that
 * lives inside Referral Intelligence, but as its own route so it can be
 * linked directly from the Analytics sidebar nav.
 */
export default function ProvidersGoneDarkPage() {
  const { data: sources = [], isLoading } = useQuery<GoneDarkSource[]>({
    queryKey: ["/api/referral-intelligence/gone-dark"],
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
          <MoonStar className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-gone-dark-title">
            Providers Have Gone Dark
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Referring providers who have stopped sending cases. Prioritize outreach to these accounts.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>
      ) : sources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <MoonStar className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-gone-dark">
              No providers have gone dark.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              All active sources are referring within the expected window.
            </p>
          </CardContent>
        </Card>
      ) : (
        <GoneDarkPanel sources={sources} />
      )}
    </div>
  );
}
