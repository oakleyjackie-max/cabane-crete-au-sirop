/**
 * Get all reservations (requires JWT).
 */
import { getStore } from "@netlify/blobs";
import { requireAuth, jsonResponse } from "./auth-helpers.mjs";

export default async (request) => {
  const authError = await requireAuth(request);
  if (authError) return authError;

  try {
    const store = getStore("reservations");
    const raw = await store.get("all", { type: "json" });
    const reservations = raw || [];

    return jsonResponse(reservations);
  } catch (err) {
    console.error("Get reservations error:", err);
    return jsonResponse({ error: "Une erreur interne est survenue" }, 500);
  }
};
