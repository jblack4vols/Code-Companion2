import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Clock } from "lucide-react";

const WARN_BEFORE_MS = 2 * 60 * 1000;
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

export function IdleTimeout() {
  const { user, logout } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const warningRef = useRef<ReturnType<typeof setTimeout>>();
  const countdownRef = useRef<ReturnType<typeof setInterval>>();
  const lastActivityRef = useRef(Date.now());

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const handleLogout = useCallback(async () => {
    clearTimers();
    setShowWarning(false);
    try {
      await logout();
    } catch {}
  }, [clearTimers, logout]);

  const resetTimers = useCallback(() => {
    if (!user) return;
    clearTimers();
    setShowWarning(false);
    lastActivityRef.current = Date.now();

    warningRef.current = setTimeout(() => {
      setShowWarning(true);
      const expiry = Date.now() + WARN_BEFORE_MS;
      setSecondsLeft(Math.ceil(WARN_BEFORE_MS / 1000));
      countdownRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          handleLogout();
        }
      }, 1000);
    }, SESSION_TIMEOUT_MS - WARN_BEFORE_MS);

    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, SESSION_TIMEOUT_MS);
  }, [user, clearTimers, handleLogout]);

  useEffect(() => {
    if (!user) return;

    const events = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    const handleActivity = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => { throttleTimer = null; }, 5000);
      if (!showWarning) {
        resetTimers();
      }
    };

    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    resetTimers();

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity));
      clearTimers();
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [user, resetTimers, clearTimers, showWarning]);

  const handleStayLoggedIn = () => {
    setShowWarning(false);
    resetTimers();
    fetch("/api/auth/me", { credentials: "include" }).catch(() => {});
  };

  if (!user) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-destructive" />
            Session Expiring
          </AlertDialogTitle>
          <AlertDialogDescription>
            Your session will expire due to inactivity in{" "}
            <span className="font-bold text-destructive">
              {minutes}:{seconds.toString().padStart(2, "0")}
            </span>
            . For security purposes, you will be automatically logged out. Click below to stay signed in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          <AlertDialogAction onClick={handleLogout} className="bg-destructive text-destructive-foreground" data-testid="button-session-logout">
            Log Out Now
          </AlertDialogAction>
          <AlertDialogAction onClick={handleStayLoggedIn} data-testid="button-session-continue">
            Stay Signed In
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
