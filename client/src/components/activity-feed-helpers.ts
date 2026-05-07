// Shared helpers for activity feed components
import { MessageSquare, FileText, CheckCircle, UserPlus, Activity } from "lucide-react";

export type ActivityItem = {
  id: string;
  activity_type: string;
  user_name?: string;
  type?: string;
  physician_last_name?: string;
  physician_name?: string;
  location_name?: string;
  summary?: string;
  timestamp?: string;
};

// Map activity type to icon component and Tailwind color/border classes
export function getActivityMeta(type: string): {
  Icon: typeof Activity;
  color: string;
  border: string;
} {
  switch (type) {
    case "interaction":
      return { Icon: MessageSquare, color: "text-chart-2 bg-chart-2/10", border: "border-chart-2/40" };
    case "referral":
      return { Icon: FileText, color: "text-chart-1 bg-chart-1/10", border: "border-chart-1/40" };
    case "task":
      return { Icon: CheckCircle, color: "text-chart-4 bg-chart-4/10", border: "border-chart-4/40" };
    case "provider":
      return { Icon: UserPlus, color: "text-chart-3 bg-chart-3/10", border: "border-chart-3/40" };
    default:
      return { Icon: Activity, color: "text-muted-foreground bg-muted/50", border: "border-border" };
  }
}

// Build human-readable description from an activity item
export function getActivityDescription(activity: ActivityItem): string {
  switch (activity.activity_type) {
    case "interaction":
      return `${activity.user_name ?? "Someone"} logged a ${activity.type?.toLowerCase() ?? "contact"} with Dr. ${activity.physician_last_name ?? "Unknown"}`;
    case "referral":
      return `New referral from ${activity.physician_name ?? "Unknown"} at ${activity.location_name ?? ""}`.trim();
    case "task":
      return `${activity.user_name ?? "Someone"} completed: ${activity.summary ?? "a task"}`;
    case "provider":
      return `${activity.user_name ?? "Someone"} added a new provider`;
    default:
      return "Team activity recorded";
  }
}

// Derive uppercase initials from a full name string
export function getInitials(name: string | undefined | null): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
