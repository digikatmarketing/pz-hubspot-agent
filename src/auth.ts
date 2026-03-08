/**
 * Simple password-based authentication.
 *
 * - Single shared password stored in APP_PASSWORD env var
 * - On successful login, a random opaque session ID is issued
 * - Session IDs are stored server-side and sent only as a cookie ("pz_token")
 * - Express middleware rejects unauthenticated requests
 * - WebSocket connections authenticate via the same cookie
 */

import { randomBytes, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import type { Request, Response, NextFunction } from "express";

// ── Session store ────────────────────────────────────────────────────

interface SessionRecord {
  expiresAt: number;
}

interface LoginRateLimitRecord {
  attempts: number[];
  blockedUntil: number;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_FILE = resolve(process.cwd(), process.env.AUTH_SESSION_FILE ?? ".auth-sessions.json");
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS ?? 5),
);
const LOGIN_RATE_LIMIT_WINDOW_MS = Math.max(
  1000,
  Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
);
const LOGIN_RATE_LIMIT_LOCKOUT_MS = Math.max(
  LOGIN_RATE_LIMIT_WINDOW_MS,
  Number(process.env.AUTH_RATE_LIMIT_LOCKOUT_MS ?? LOGIN_RATE_LIMIT_WINDOW_MS),
);
const activeSessions = new Map<string, SessionRecord>();
const loginRateLimits = new Map<string, LoginRateLimitRecord>();

function getPassword(): string {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password) {
    throw new Error("APP_PASSWORD env var not set");
  }
  return password;
}

function cleanupExpiredSessions(): void {
  const now = Date.now();
  let changed = false;
  for (const [token, session] of activeSessions.entries()) {
    if (session.expiresAt <= now) {
      activeSessions.delete(token);
      changed = true;
    }
  }
  if (changed) persistSessions();
}

function passwordsMatch(input: string, expected: string): boolean {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  if (inputBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(inputBuffer, expectedBuffer);
}

function ensureSessionFileDir(): void {
  mkdirSync(dirname(SESSION_FILE), { recursive: true });
}

function persistSessions(): void {
  ensureSessionFileDir();
  const tempFile = `${SESSION_FILE}.tmp`;
  const payload = JSON.stringify(Object.fromEntries(activeSessions), null, 2);
  writeFileSync(tempFile, payload, { mode: 0o600 });
  renameSync(tempFile, SESSION_FILE);
}

function loadPersistedSessions(): void {
  if (!existsSync(SESSION_FILE)) return;

  try {
    const raw = readFileSync(SESSION_FILE, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as Record<string, SessionRecord>;
    const now = Date.now();

    for (const [token, session] of Object.entries(parsed)) {
      if (session && typeof session.expiresAt === "number" && session.expiresAt > now) {
        activeSessions.set(token, { expiresAt: session.expiresAt });
      }
    }

    cleanupExpiredSessions();
  } catch (err: any) {
    console.warn(`[AUTH] Failed to load persisted sessions: ${err?.message ?? err}`);
  }
}

function getClientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0];
  }
  return req.socket.remoteAddress ?? "unknown";
}

function cleanupRateLimitRecord(clientKey: string, now = Date.now()): LoginRateLimitRecord {
  const current = loginRateLimits.get(clientKey) ?? { attempts: [], blockedUntil: 0 };
  const attempts = current.attempts.filter((ts) => now - ts <= LOGIN_RATE_LIMIT_WINDOW_MS);
  const blockedUntil = current.blockedUntil > now ? current.blockedUntil : 0;
  const next = { attempts, blockedUntil };

  if (attempts.length === 0 && blockedUntil === 0) {
    loginRateLimits.delete(clientKey);
  } else {
    loginRateLimits.set(clientKey, next);
  }

  return next;
}

function getRateLimitState(clientKey: string): { blocked: boolean; retryAfterMs: number } {
  const record = cleanupRateLimitRecord(clientKey);
  if (record.blockedUntil > Date.now()) {
    return { blocked: true, retryAfterMs: record.blockedUntil - Date.now() };
  }
  return { blocked: false, retryAfterMs: 0 };
}

function recordFailedLogin(clientKey: string): { retryAfterMs: number } {
  const now = Date.now();
  const record = cleanupRateLimitRecord(clientKey, now);
  record.attempts.push(now);

  if (record.attempts.length >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    record.blockedUntil = now + LOGIN_RATE_LIMIT_LOCKOUT_MS;
  }

  loginRateLimits.set(clientKey, record);
  return { retryAfterMs: Math.max(record.blockedUntil - now, 0) };
}

function clearFailedLogins(clientKey: string): void {
  loginRateLimits.delete(clientKey);
}

loadPersistedSessions();

/** Create a new session token */
function createToken(): string {
  const token = randomBytes(32).toString("hex");
  activeSessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
  persistSessions();
  return token;
}

/** Validate a session token */
export function isValidToken(token: string | undefined | null): boolean {
  if (!token) return false;
  cleanupExpiredSessions();
  const session = activeSessions.get(token);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

/** Revoke a session token */
export function revokeToken(token: string): void {
  if (activeSessions.delete(token)) {
    persistSessions();
  }
}

// ── Cookie helpers ───────────────────────────────────────────────────

const COOKIE_NAME = "pz_token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_MS,
};

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key.trim()] = decodeURIComponent(rest.join("="));
  }
  return cookies;
}

function getTokenFromRequest(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] ?? null;
}

// ── Login endpoint handler ───────────────────────────────────────────

export function handleLogin(req: Request, res: Response): void {
  const clientKey = getClientKey(req);
  const rateLimit = getRateLimitState(clientKey);
  if (rateLimit.blocked) {
    const retryAfterSeconds = Math.ceil(rateLimit.retryAfterMs / 1000);
    res.setHeader("Retry-After", retryAfterSeconds.toString());
    res.status(429).json({
      error: `Too many login attempts. Try again in ${retryAfterSeconds} seconds.`,
    });
    return;
  }

  const { password } = req.body ?? {};
  const expectedPassword = getPassword();
  if (typeof password !== "string" || !passwordsMatch(password, expectedPassword)) {
    const { retryAfterMs } = recordFailedLogin(clientKey);
    if (retryAfterMs > 0) {
      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
    }
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  clearFailedLogins(clientKey);
  const token = createToken();

  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

  res.json({ ok: true });
}

// ── Logout endpoint handler ──────────────────────────────────────────

export function handleLogout(req: Request, res: Response): void {
  const token = getTokenFromRequest(req);
  if (token) revokeToken(token);
  res.clearCookie(COOKIE_NAME, {
    httpOnly: COOKIE_OPTIONS.httpOnly,
    sameSite: COOKIE_OPTIONS.sameSite,
    secure: COOKIE_OPTIONS.secure,
    path: COOKIE_OPTIONS.path,
  });
  res.json({ ok: true });
}

// ── Auth check endpoint (is the current session valid?) ──────────────

export function handleAuthCheck(req: Request, res: Response): void {
  const token = getTokenFromRequest(req);
  res.json({ authenticated: isValidToken(token) });
}

// ── Express middleware — protects all routes except public ones ───────

const PUBLIC_PATHS = ["/api/auth/login", "/api/auth/check", "/health"];

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Allow public paths
  if (PUBLIC_PATHS.includes(req.path)) {
    next();
    return;
  }

  // The root page (/) always serves the HTML — the login gate is in-page
  if (req.path === "/") {
    next();
    return;
  }

  // Check token
  const token = getTokenFromRequest(req);
  if (isValidToken(token)) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}

// ── WebSocket auth — extract token from upgrade request ──────────────

export function getTokenFromUpgrade(req: Request): string | null {
  return getTokenFromRequest(req);
}
