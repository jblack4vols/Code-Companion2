/**
 * Best-effort Microsoft Graph calls that mirror local CalendarEvent
 * mutations into the organizer's Outlook calendar.
 *
 * "Best effort" = these never throw. If the user has no token, or Graph
 * returns a non-2xx, we log and return null so the local mutation
 * (which is the source of truth) still succeeds.
 */
import { getValidAccessToken } from "./outlook-oauth-token-helpers";
import type { CalendarEvent } from "@shared/schema";

const GRAPH_EVENTS = "https://graph.microsoft.com/v1.0/me/events";

function buildOutlookEventBody(event: Pick<CalendarEvent, "title" | "description" | "startAt" | "endAt" | "allDay">) {
  return {
    subject: event.title,
    body: { contentType: "Text", content: event.description ?? "" },
    start: { dateTime: event.startAt.toISOString(), timeZone: "UTC" },
    end: { dateTime: event.endAt.toISOString(), timeZone: "UTC" },
    isAllDay: event.allDay,
  };
}

async function tryGetToken(userId: string): Promise<string | null> {
  try {
    return await getValidAccessToken(userId);
  } catch {
    // User hasn't connected Outlook — that's fine, just skip sync.
    return null;
  }
}

/** Push a newly-created event to Outlook. Returns the Graph event id, or null on failure. */
export async function pushEventToOutlook(
  userId: string,
  event: Pick<CalendarEvent, "title" | "description" | "startAt" | "endAt" | "allDay">,
): Promise<string | null> {
  const token = await tryGetToken(userId);
  if (!token) return null;
  try {
    const res = await fetch(GRAPH_EVENTS, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildOutlookEventBody(event)),
    });
    if (!res.ok) {
      console.error(`[Outlook auto-sync] create failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    return data.id ?? null;
  } catch (err: any) {
    console.error("[Outlook auto-sync] create threw:", err?.message);
    return null;
  }
}

/** Push an event update to Outlook. No-op if no outlookEventId is set. */
export async function updateEventInOutlook(
  userId: string,
  outlookEventId: string,
  event: Pick<CalendarEvent, "title" | "description" | "startAt" | "endAt" | "allDay">,
): Promise<boolean> {
  const token = await tryGetToken(userId);
  if (!token) return false;
  try {
    const res = await fetch(`${GRAPH_EVENTS}/${outlookEventId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildOutlookEventBody(event)),
    });
    if (!res.ok) {
      console.error(`[Outlook auto-sync] update failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[Outlook auto-sync] update threw:", err?.message);
    return false;
  }
}

/** Delete an event from Outlook. No-op if no outlookEventId is set. */
export async function deleteEventFromOutlook(userId: string, outlookEventId: string): Promise<boolean> {
  const token = await tryGetToken(userId);
  if (!token) return false;
  try {
    const res = await fetch(`${GRAPH_EVENTS}/${outlookEventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    // 204 = deleted, 404 = already gone (still success from our POV)
    if (!res.ok && res.status !== 404) {
      console.error(`[Outlook auto-sync] delete failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[Outlook auto-sync] delete threw:", err?.message);
    return false;
  }
}
