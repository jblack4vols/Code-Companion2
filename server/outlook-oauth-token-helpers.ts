/**
 * Microsoft OAuth token exchange + refresh helpers for Outlook calendar integration.
 * Handles Azure AD token lifecycle: code exchange, refresh, and per-user token retrieval.
 */
import { db } from "./db";
import { eq } from "drizzle-orm";
import { userOauthTokens } from "@shared/schema";

const AZURE_CLIENT_ID = process.env.AZURE_AD_CLIENT_ID!;
const AZURE_TENANT_ID = process.env.AZURE_AD_TENANT_ID!;
const AZURE_CLIENT_SECRET = process.env.AZURE_AD_CLIENT_SECRET!;

export const IS_DEV = process.env.NODE_ENV !== "production";
export const REDIRECT_URI = IS_DEV
  ? "http://localhost:5000/api/outlook/callback"
  : "https://crm.tristarpt.com/api/outlook/callback";

export const SSO_REDIRECT_URI = IS_DEV
  ? "http://localhost:5000/api/auth/microsoft/callback"
  : "https://crm.tristarpt.com/api/auth/microsoft/callback";

export const SCOPES = ["Calendars.ReadWrite", "User.Read", "offline_access"];
export const AUTH_URL = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize`;

const TOKEN_URL = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/** Exchange authorization code for access + refresh tokens */
export async function exchangeCodeForTokens(code: string, redirectUri: string = REDIRECT_URI): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

/** Use a refresh token to obtain a new access token */
async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: SCOPES.join(" "),
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return res.json();
}

/**
 * Returns a valid access token for the given user.
 * Automatically refreshes via refresh_token if the stored token is expired or near-expiry.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const [tokenRow] = await db
    .select()
    .from(userOauthTokens)
    .where(eq(userOauthTokens.userId, userId));

  if (!tokenRow) throw new Error("No OAuth token found for user — connect Outlook first");

  const isExpired = tokenRow.expiresAt && tokenRow.expiresAt <= new Date(Date.now() + 60_000);
  if (!isExpired) return tokenRow.accessToken;

  if (!tokenRow.refreshToken) throw new Error("Access token expired and no refresh token available");

  const tokens = await refreshAccessToken(tokenRow.refreshToken);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await db
    .update(userOauthTokens)
    .set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? tokenRow.refreshToken,
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(userOauthTokens.userId, userId));

  return tokens.access_token;
}
