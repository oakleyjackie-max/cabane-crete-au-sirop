/**
 * Admin login endpoint.
 * POST { password: "..." }
 * Returns { token: "jwt..." } on success, 401 on failure.
 *
 * Supports ADMIN_PASSWORD_HASH (bcrypt) or falls back to ADMIN_PASSWORD (plaintext).
 * Rate limited: 5 attempts per 15-minute window per IP.
 */
import bcrypt from "bcryptjs";
import {
  createToken,
  jsonResponse,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
} from "./auth-helpers.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rateLimited = await checkRateLimit(request, "login");
  if (rateLimited) return rateLimited;

  try {
    const { password } = await request.json();

    if (!password || typeof password !== "string") {
      await recordFailedAttempt(request, "login");
      return jsonResponse({ error: "Mot de passe incorrect" }, 401);
    }

    const passwordHash = Netlify.env.get("ADMIN_PASSWORD_HASH");
    const adminPassword = Netlify.env.get("ADMIN_PASSWORD");

    if (!passwordHash && !adminPassword) {
      console.error("Neither ADMIN_PASSWORD_HASH nor ADMIN_PASSWORD is set");
      return jsonResponse({ error: "Erreur de configuration serveur" }, 500);
    }

    let valid = false;
    if (passwordHash) {
      valid = await bcrypt.compare(password, passwordHash);
    } else if (adminPassword) {
      valid = password === adminPassword;
    }

    if (!valid) {
      await recordFailedAttempt(request, "login");
      return jsonResponse({ error: "Mot de passe incorrect" }, 401);
    }

    await clearRateLimit(request, "login");
    const token = await createToken();
    return jsonResponse({ token });
  } catch (err) {
    console.error("Login error:", err);
    return jsonResponse({ error: "Une erreur interne est survenue" }, 500);
  }
};
