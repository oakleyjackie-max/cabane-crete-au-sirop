/**
 * Update reservation status (requires JWT).
 * POST { numero: N, statut: "..." }
 * Validates statut against allowed values.
 */
import { getStore } from "@netlify/blobs";
import { requireAuth, jsonResponse, VALID_STATUTS } from "./auth-helpers.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authError = await requireAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();

    // Validate statut against allowed values
    if (!body.statut || !VALID_STATUTS.includes(body.statut)) {
      return jsonResponse({ error: "Statut invalide" }, 400);
    }

    if (typeof body.numero !== "number") {
      return jsonResponse({ error: "Numéro de réservation invalide" }, 400);
    }

    const store = getStore("reservations");
    const raw = await store.get("all", { type: "json" });
    const reservations = raw || [];

    const index = reservations.findIndex((r) => r.numero === body.numero);
    if (index === -1) {
      return jsonResponse({ error: "Réservation introuvable" }, 404);
    }

    reservations[index].statut = body.statut;
    await store.setJSON("all", reservations);

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Update status error:", err);
    return jsonResponse({ error: "Une erreur interne est survenue" }, 500);
  }
};
