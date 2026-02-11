/**
 * Public reservation endpoint.
 * POST with reservation data.
 * Input validated, rate limited (10 per hour per IP).
 */
import { getStore } from "@netlify/blobs";
import { sanitizeString, jsonResponse, checkRateLimit, recordFailedAttempt, clearRateLimit } from "./auth-helpers.mjs";

const MAX_PRODUITS = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s().+-]{7,20}$/;

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Rate limit: max 10 reservations per IP per 15 min
  const rateLimited = await checkRateLimit(request, "reservation");
  if (rateLimited) return rateLimited;

  try {
    const body = await request.json();

    // --- Input validation ---
    const nom = sanitizeString(body.nom, 100);
    if (!nom) {
      return jsonResponse({ error: "Le nom est requis" }, 400);
    }

    const telephone = sanitizeString(body.telephone, 20);
    if (!telephone || !PHONE_RE.test(telephone)) {
      return jsonResponse({ error: "Numéro de téléphone invalide" }, 400);
    }

    const courriel = sanitizeString(body.courriel, 200);
    if (courriel && !EMAIL_RE.test(courriel)) {
      return jsonResponse({ error: "Adresse courriel invalide" }, 400);
    }

    const instructions = sanitizeString(body.instructions, 500);

    // Validate produits array
    let produits = [];
    if (Array.isArray(body.produits)) {
      produits = body.produits.slice(0, MAX_PRODUITS).map(p => ({
        nom: sanitizeString(p?.nom, 100),
        quantite: Math.min(Math.max(parseInt(p?.quantite) || 1, 1), 999),
      })).filter(p => p.nom);
    }

    if (produits.length === 0) {
      return jsonResponse({ error: "Au moins un produit est requis" }, 400);
    }

    const store = getStore("reservations");
    const raw = await store.get("all", { type: "json" });
    const reservations = raw || [];

    const maxNum = reservations.length > 0
      ? Math.max(...reservations.map((r) => r.numero))
      : 0;

    const newReservation = {
      numero: maxNum + 1,
      date: new Date().toISOString(),
      nom,
      telephone,
      courriel,
      produits,
      instructions,
      statut: "Réservé",
    };

    reservations.push(newReservation);
    await store.setJSON("all", reservations);

    // Record as attempt (for rate limiting) then clear since it succeeded
    await recordFailedAttempt(request, "reservation");

    return jsonResponse(newReservation);
  } catch (err) {
    console.error("Save reservation error:", err);
    return jsonResponse({ error: "Une erreur interne est survenue" }, 500);
  }
};
