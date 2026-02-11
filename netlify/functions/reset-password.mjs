/**
 * Password reset via security question.
 *
 * POST { answer: "..." }
 * If the answer matches the stored hashed answer, returns a valid JWT token.
 * Rate limited: 5 attempts per 15-minute window per IP.
 *
 * Note: This does NOT change the ADMIN_PASSWORD — it issues a new JWT session.
 */
import { getStore } from "@netlify/blobs";
import bcrypt from "bcryptjs";
import {
  createToken,
  jsonResponse,
  sanitizeString,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
} from "./auth-helpers.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rateLimited = await checkRateLimit(request, "reset");
  if (rateLimited) return rateLimited;

  try {
    const { answer } = await request.json();
    const a = sanitizeString(answer, 100);

    if (!a) {
      return jsonResponse({ error: "Réponse requise" }, 400);
    }

    const store = getStore("admin-settings");
    const raw = await store.get("security-qa", { type: "json" });

    if (!raw) {
      return jsonResponse(
        { error: "Aucune question de sécurité n'a été configurée." },
        400
      );
    }

    // Support both hashed (new) and plaintext (legacy) answer formats
    let correct = false;
    if (raw.answerHash) {
      correct = await bcrypt.compare(a.toLowerCase(), raw.answerHash);
    } else if (raw.answer) {
      correct = a.toLowerCase() === raw.answer;
    } else {
      return jsonResponse(
        { error: "Aucune question de sécurité n'a été configurée." },
        400
      );
    }

    if (!correct) {
      await recordFailedAttempt(request, "reset");
      return jsonResponse({ error: "Réponse incorrecte." }, 401);
    }

    await clearRateLimit(request, "reset");
    const token = await createToken();
    return jsonResponse({ token });
  } catch (err) {
    console.error("Reset password error:", err);
    return jsonResponse({ error: "Une erreur interne est survenue" }, 500);
  }
};
