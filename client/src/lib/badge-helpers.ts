/**
 * Shared badge styling helpers for tier, days-since, and ROI badges.
 * Used across referral intelligence, dashboard, and analytics pages.
 */

/** Badge class for payer tier letters (A/B/C) */
export function tierBadgeClass(tier: string): string {
  if (tier === "A") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (tier === "B") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-muted text-muted-foreground";
}

/** Badge class for days-since-last-referral values */
export function daysBadgeClass(days: number): string {
  if (days <= 30) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (days <= 60) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

/** Badge class for ROI score values (0-100) */
export function roiBadgeClass(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (score >= 50) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}
