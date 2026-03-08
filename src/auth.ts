/**
 * Simple password-based authentication.
 *
 * - Single shared password stored in APP_PASSWORD env var
 * - On successful login, a random session token is issued
 * - Token is stored in-memory and sent as a cookie ("pz_token")
 * - Express middleware rejects unauthenticated requests
 * - WebSocket connections validate via query string token
 */

import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";

// ── Session store ────────────────────────────────────────────────────

const activeSessions = new Set<string>();

function getPassword(): string {
  return process.env.APP_PASSWORD ?? "Primalzone2026!!";
}

/** Create a new session token */
function createToken(): string {
  const token = randomBytes(32).toString("hex");
  activeSessions.add(token);
  return token;
}

/** Validate a session token */
export function isValidToken(token: string | undefined | null): boolean {
  if (!token) return false;
  return activeSessions.has(token);
}

/** Revoke a session token */
export function revokeToken(token: string): void {
  activeSessions.delete(token);
}

// ── Cookie helpers ───────────────────────────────────────────────────

const COOKIE_NAME = "pz_token";

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
  const { password } = req.body ?? {};
  if (!password || password !== getPassword()) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  const token = createToken();

  // Set HTTP-only cookie — works for both http (dev) and https (prod)
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === "production",
  });

  res.json({ ok: true, token });
}

// ── Logout endpoint handler ──────────────────────────────────────────

export function handleLogout(req: Request, res: Response): void {
  const token = getTokenFromRequest(req);
  if (token) revokeToken(token);
  res.clearCookie(COOKIE_NAME);
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
  // Try query string first (?token=xxx)
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;

  // Fall back to cookie
  return getTokenFromRequest(req);
}
