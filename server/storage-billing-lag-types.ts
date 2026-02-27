/**
 * Shared type definitions for billing lag tracker storage methods.
 * Extracted to keep storage-billing-lag.ts under 200 lines.
 */

export interface ARAgingBucket {
  bucket: string; // "0-30" | "31-60" | "61-90" | "90+"
  claimCount: number;
  totalBilled: number;
  totalOutstanding: number;
}

export interface BillingLagMetrics {
  avgDaysToSubmission: number;
  avgDaysToPayment: number;
  avgTotalCycleTime: number;
  totalOutstandingClaims: number;
  totalOutstandingAmount: number;
}

export interface PayerLagStat {
  payer: string;
  claimCount: number;
  avgDaysToSubmission: number;
  avgDaysToPayment: number;
  avgCycleTime: number;
  totalOutstanding: number;
}

export interface LocationLagStat {
  locationId: string;
  locationName: string;
  claimCount: number;
  avgDaysToSubmission: number;
  avgDaysToPayment: number;
  avgCycleTime: number;
  totalOutstanding: number;
}

export interface StaleClaim {
  claimId: string;
  claimNumber: string;
  dos: string;
  payer: string;
  billedAmount: number;
  daysSinceDos: number;
  locationId: string;
}
