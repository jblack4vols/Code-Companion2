import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, FileText, Award } from "lucide-react";
import { format } from "date-fns";
import type { Interaction, Referral, User } from "@shared/schema";

interface TimelineEvent {
  id: string;
  date: Date;
  type: "interaction" | "referral" | "stage";
  title: string;
  description: string;
  actor?: string;
}

interface Props {
  physicianId: string;
}

function EventIcon({ type }: { type: TimelineEvent["type"] }) {
  if (type === "interaction") {
    return (
      <div className="w-8 h-8 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center shrink-0 z-10 relative">
        <MessageSquare className="w-4 h-4" />
      </div>
    );
  }
  if (type === "referral") {
    return (
      <div className="w-8 h-8 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center shrink-0 z-10 relative">
        <FileText className="w-4 h-4" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-orange-500/15 text-orange-500 flex items-center justify-center shrink-0 z-10 relative">
      <Award className="w-4 h-4" />
    </div>
  );
}

function buildEvents(
  interactions: Interaction[] | undefined,
  referrals: Referral[] | undefined,
  users: User[] | undefined
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  (interactions ?? []).forEach((i) => {
    const actor = users?.find((u) => u.id === i.userId)?.name;
    events.push({
      id: `interaction-${i.id}`,
      date: new Date(i.occurredAt),
      type: "interaction",
      title: `${i.type[0]}${i.type.slice(1).toLowerCase()} logged`,
      description: i.summary,
      actor,
    });
  });

  (referrals ?? []).forEach((r) => {
    events.push({
      id: `referral-${r.id}`,
      date: new Date(r.referralDate + "T00:00:00"),
      type: "referral",
      title: "Referral received",
      description: r.patientFullName || r.patientInitialsOrAnonId || "Patient",
    });
  });

  return events.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 30);
}

export function ProviderRelationshipTimeline({ physicianId }: Props) {
  const { data: interactions, isLoading: loadingInteractions } = useQuery<Interaction[]>({
    queryKey: [`/api/interactions?physicianId=${physicianId}`],
    enabled: !!physicianId,
  });

  const { data: referrals, isLoading: loadingReferrals } = useQuery<Referral[]>({
    queryKey: [`/api/referrals?physicianId=${physicianId}`],
    enabled: !!physicianId,
  });

  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const isLoading = loadingInteractions || loadingReferrals;

  if (isLoading) {
    return (
      <div className="space-y-4 py-4" data-testid="timeline-skeleton">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex gap-3">
            <Skeleton className="w-8 h-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const events = buildEvents(interactions, referrals, users);

  if (!events.length) {
    return (
      <div
        className="text-center py-12 text-sm text-muted-foreground"
        data-testid="timeline-empty"
      >
        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
        No relationship events yet
      </div>
    );
  }

  return (
    <div className="relative" data-testid="provider-relationship-timeline">
      {/* vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" aria-hidden="true" />

      <ol className="space-y-6 pl-14">
        {events.map((event, idx) => (
          <li key={event.id} className="relative" data-testid={`timeline-event-${event.id}`}>
            {/* icon positioned over the line */}
            <div className="absolute -left-10 top-0">
              <EventIcon type={event.type} />
            </div>

            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{event.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {event.description}
                </p>
                {event.actor && (
                  <p className="text-xs text-muted-foreground mt-0.5">by {event.actor}</p>
                )}
              </div>
              <time
                className="text-xs text-muted-foreground whitespace-nowrap shrink-0"
                dateTime={event.date.toISOString()}
              >
                {format(event.date, "MMM d")}
              </time>
            </div>

            {idx < events.length - 1 && <div className="mt-6 border-b border-dashed border-border/40" />}
          </li>
        ))}
      </ol>
    </div>
  );
}
