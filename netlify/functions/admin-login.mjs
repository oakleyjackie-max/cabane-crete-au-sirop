/**
 * Admin login endpoint.
 * POST { password: "..." }
 * Returns { token: "jwt..." } on success, 401 on failure.
 *
 * Checks blob-stored password first (from in-app change), then env vars.
 * Rate limited: 5 attempts per 15-minute window per IP.
 */
import {
  createToken,
  jsonResponse,
  verifyPassword,
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

    let valid = false;
    try {
      valid = await verifyPassword(password);
    } catch (err) {
      if (err.message === "NO_PASSWORD_CONFIGURED") {
        console.error("No password configured in blob store or env vars");
        return jsonResponse({ error: "Erreur de configuration serveur" }, 500);
      }
      throw err;
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
