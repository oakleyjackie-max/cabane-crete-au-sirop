/**
 * Delete reservations by numero (requires JWT).
 * POST { numeros: [1, 2, 3] }
 * Validates that numeros is an array of numbers.
 */
import { getStore } from "@netlify/blobs";
import { requireAuth, jsonResponse } from "./auth-helpers.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authError = await requireAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();

    // Validate numeros is an array of numbers
    if (!Array.isArray(body.numeros) || body.numeros.length === 0) {
      return jsonResponse({ error: "Liste de numéros requise" }, 400);
    }

    const validNumeros = body.numeros.filter(n => typeof n === "number" && Number.isFinite(n));
    if (validNumeros.length === 0) {
      return jsonResponse({ error: "Numéros invalides" }, 400);
    }

    const numeros = new Set(validNumeros);
    const store = getStore("reservations");
    const raw = await store.get("all", { type: "json" });
    const reservations = raw || [];

    const filtered = reservations.filter((r) => !numeros.has(r.numero));
    await store.setJSON("all", filtered);

    return jsonResponse({ success: true, deleted: reservations.length - filtered.length });
  } catch (err) {
    console.error("Delete reservations error:", err);
    return jsonResponse({ error: "Une erreur interne est survenue" }, 500);
  }
};
