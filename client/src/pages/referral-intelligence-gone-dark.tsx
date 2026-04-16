/**
 * Referral Intelligence — gone-dark alert panel sub-component.
 * Red banner listing providers who have stopped referring.
 */
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export interface GoneDarkSource {
  id: string;
  name: string;
  practice: string;
  daysSinceReferral: number;
  casesYtd: number;
}

interface Props {
  sources: GoneDarkSource[];
}

export function GoneDarkPanel({ sources }: Props) {
  if (sources.length === 0) return null;

  return (
    <Alert
      className="border-destructive/50 bg-destructive/5 mb-5"
      data-testid="panel-gone-dark"
    >
      <AlertTriangle className="h-4 w-4 text-destructive" />
      <AlertTitle className="text-destructive font-semibold">
        {sources.length} provider{sources.length !== 1 ? "s" : ""} have gone dark
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 space-y-1">
          {sources.map((s) => (
            <li key={s.id} className="text-sm flex items-center gap-2" data-testid={`item-gone-dark-${s.id}`}>
              <span className="font-medium text-foreground">{s.name}</span>
              <span className="text-muted-foreground">— {s.practice}</span>
              <span className="ml-auto text-destructive text-xs whitespace-nowrap">
                {s.daysSinceReferral}d since last referral
              </span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
