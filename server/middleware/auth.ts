// Re-export auth utilities from the canonical location to avoid duplication
export {
  requireAuth,
  requireRole,
  getClientIp,
  qstr,
  qstrReq,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  SESSION_TIMEOUT_MS,
} from "../routes/shared";
