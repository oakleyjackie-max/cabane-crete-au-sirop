/**
 * Shared JWT authentication helpers for Netlify Functions.
 *
 * Uses HMAC-SHA256 (HS256) with a secret derived from ADMIN_JWT_SECRET env var.
 * Tokens expire after 8 hours for security.
 *
 * jose is used because it works in all JS runtimes (Edge, Node, Deno).
 */
import { SignJWT, jwtVerify } from "jose";
import { getStore } from "@netlify/blobs";

const TOKEN_EXPIRY = "8h";
const ISSUER = "cabane-crete";
const AUDIENCE = "cabane-admin";

// Rate limiting: max attempts per window
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Valid status values (shared constant for validation)
export const VALID_STATUTS = [
  'Réservé',
  'En traitement',
  'Prêt pour ramassage/livraison',
  'Client contacté',
  'Complété',
];

/** Get the HS256 secret as a CryptoKey-compatible Uint8Array */
function getSecret() {
  const raw = Netlify.env.get("ADMIN_JWT_SECRET");
  if (!raw) throw new Error("ADMIN_JWT_SECRET is not set");
  return new TextEncoder().encode(raw);
}

/** Create a signed JWT for an authenticated admin session */
export async function createToken() {
  const secret = getSecret();
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(secret);
}

/** Verify a JWT from the Authorization header. Returns the payload or null. */
export async function verifyToken(request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload;
  } catch {
    return null;
  }
}

/** Standard JSON response helper */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Verify request is authenticated, return error Response if not */
export async function requireAuth(request) {
  const payload = await verifyToken(request);
  if (!payload) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  return null; // null means auth passed
}

/**
 * IP-based rate limiting using Netlify Blobs.
 * Returns null if allowed, or an error Response if rate limited.
 */
export async function checkRateLimit(request, action) {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",").pop().trim() : null)
    || request.headers.get("client-ip")
    || "unknown";
  const key = `ratelimit-${action}-${ip.replace(/[^a-zA-Z0-9.:]/g, "_")}`;

  try {
    const store = getStore("admin-settings");
    const raw = await store.get(key, { type: "json" });
    const now = Date.now();

    if (raw && raw.lockUntil && now < raw.lockUntil) {
      const retryAfter = Math.ceil((raw.lockUntil - now) / 1000);
      return jsonResponse(
        { error: `Trop de tentatives. Réessayez dans ${Math.ceil(retryAfter / 60)} minute(s).` },
        429
      );
    }

    // Clean old attempts outside the window
    const attempts = (raw?.attempts || []).filter(t => now - t < WINDOW_MS);

    if (attempts.length >= MAX_ATTEMPTS) {
      // Lock out for the remainder of the window
      const lockUntil = now + WINDOW_MS;
      await store.setJSON(key, { attempts, lockUntil });
      return jsonResponse(
        { error: `Trop de tentatives. Réessayez dans 15 minute(s).` },
        429
      );
    }

    return null; // Allowed
  } catch {
    // If rate limit check fails, allow the request (fail open)
    return null;
  }
}

/** Record a failed attempt for rate limiting */
export async function recordFailedAttempt(request, action) {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",").pop().trim() : null)
    || request.headers.get("client-ip")
    || "unknown";
  const key = `ratelimit-${action}-${ip.replace(/[^a-zA-Z0-9.:]/g, "_")}`;

  try {
    const store = getStore("admin-settings");
    const raw = await store.get(key, { type: "json" });
    const now = Date.now();
    const attempts = (raw?.attempts || []).filter(t => now - t < WINDOW_MS);
    attempts.push(now);
    await store.setJSON(key, { attempts, lockUntil: raw?.lockUntil || 0 });
  } catch {
    // Ignore storage errors
  }
}

/** Clear rate limit record on successful auth */
export async function clearRateLimit(request, action) {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",").pop().trim() : null)
    || request.headers.get("client-ip")
    || "unknown";
  const key = `ratelimit-${action}-${ip.replace(/[^a-zA-Z0-9.:]/g, "_")}`;

  try {
    const store = getStore("admin-settings");
    await store.delete(key);
  } catch {
    // Ignore
  }
}

/** Sanitize a string: trim + enforce max length */
export function sanitizeString(val, maxLen = 500) {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, maxLen);
}
