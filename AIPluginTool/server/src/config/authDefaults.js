/** Default local dev credentials (override with AUTH_EMAIL / AUTH_PASSWORD in server/.env). */
export const DEMO_ADMIN_EMAIL = "admin@demo.local";
export const DEMO_ADMIN_PASSWORD = "Admin12345!";

/** Minimum 32 characters — required for session HMAC. */
export const DEFAULT_AUTH_SECRET = "dev-only-change-me-use-32-char-secret-min";
