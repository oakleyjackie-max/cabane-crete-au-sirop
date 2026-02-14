/**
 * Change admin password endpoint.
 *
 * POST { currentPassword: "...", newPassword: "..." }
 * Requires JWT auth. Verifies current password, then stores new bcrypt hash
 * in Netlify Blobs (since env vars can't be changed at runtime).
 *
 * If the JWT was issued via security question reset (resetSession claim),
 * currentPassword is not required — identity was already verified.
 *
 * Rate limited: 5 attempts per 15-minute window per IP.
 */
import { getStore } from "@netlify/blobs";
import bcrypt from "bcryptjs";
import {
  verifyToken,
  jsonResponse,
  sanitizeString,
  verifyPassword,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
} from "./auth-helpers.mjs";

const MIN_PASSWORD_LENGTH = 8;

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Verify JWT and get payload (need to check resetSession claim)
  const payload = await verifyToken(request);
  if (!payload) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const isResetSession = payload.resetSession === true;

  const rateLimited = await checkRateLimit(request, "change-password");
  if (rateLimited) return rateLimited;

  try {
    const { currentPassword, newPassword } = await request.json();
    const current = sanitizeString(currentPassword, 200);
    const next = sanitizeString(newPassword, 200);

    if (!next) {
      return jsonResponse({ error: "Nouveau mot de passe requis." }, 400);
    }

    if (next.length < MIN_PASSWORD_LENGTH) {
      return jsonResponse(
        { error: `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` },
        400
      );
    }

    // If not a reset session, verify current password
    if (!isResetSession) {
      if (!current) {
        return jsonResponse({ error: "Mot de passe actuel requis." }, 400);
      }

      let valid = false;
      try {
        valid = await verifyPassword(current);
      } catch (err) {
        if (err.message === "NO_PASSWORD_CONFIGURED") {
          return jsonResponse({ error: "Erreur de configuration serveur" }, 500);
        }
        throw err;
      }

      if (!valid) {
        await recordFailedAttempt(request, "change-password");
        return jsonResponse({ error: "Mot de passe actuel incorrect." }, 401);
      }
    }

    // Hash and store new password
    const passwordHash = await bcrypt.hash(next, 10);
    const store = getStore("admin-settings");
    await store.setJSON("admin-password", { passwordHash });

    await clearRateLimit(request, "change-password");
    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Change password error:", err);
    return jsonResponse({ error: "Une erreur interne est survenue" }, 500);
  }
};
