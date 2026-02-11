/**
 * Security question management endpoint.
 *
 * GET  (public) — returns the current security question (without answer)
 * POST (auth required) — sets the security question and answer
 *
 * The answer is hashed with bcrypt for secure storage.
 */
import { getStore } from "@netlify/blobs";
import bcrypt from "bcryptjs";
import { requireAuth, jsonResponse, sanitizeString } from "./auth-helpers.mjs";

export default async (request) => {
  if (request.method === "GET") {
    try {
      const store = getStore("admin-settings");
      const raw = await store.get("security-qa", { type: "json" });
      if (!raw || !raw.question) {
        return jsonResponse({ configured: false, question: "" });
      }
      return jsonResponse({ configured: true, question: raw.question });
    } catch {
      return jsonResponse({ configured: false, question: "" });
    }
  }

  if (request.method === "POST") {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
      const { question, answer } = await request.json();
      const q = sanitizeString(question, 200);
      const a = sanitizeString(answer, 100);

      if (!q || !a) {
        return jsonResponse({ error: "Question et réponse requises" }, 400);
      }

      // Hash the answer with bcrypt
      const answerHash = await bcrypt.hash(a.toLowerCase(), 10);

      const store = getStore("admin-settings");
      await store.setJSON("security-qa", {
        question: q,
        answerHash,
      });

      return jsonResponse({ success: true });
    } catch (err) {
      console.error("Security question error:", err);
      return jsonResponse({ error: "Une erreur interne est survenue" }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
