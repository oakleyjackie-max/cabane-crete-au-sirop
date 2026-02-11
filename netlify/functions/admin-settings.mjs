/**
 * Shared admin settings stored in Netlify Blobs.
 *
 * GET  — returns current settings (requires JWT)
 * POST — updates settings (requires JWT)
 *
 * Settings stored:
 *   { outOfStock: boolean, notifEnabled: boolean }
 */
import { getStore } from "@netlify/blobs";
import { requireAuth, jsonResponse } from "./auth-helpers.mjs";

const DEFAULTS = {
  outOfStock: false,
  notifEnabled: true,
};

async function loadSettings() {
  const store = getStore("admin-settings");
  const raw = await store.get("config", { type: "json" });
  return { ...DEFAULTS, ...(raw || {}) };
}

async function saveSettings(settings) {
  const store = getStore("admin-settings");
  await store.setJSON("config", settings);
}

export default async (request) => {
  const authError = await requireAuth(request);
  if (authError) return authError;

  if (request.method === "GET") {
    try {
      const settings = await loadSettings();
      return jsonResponse(settings);
    } catch (err) {
      console.error("Load settings error:", err);
      return jsonResponse({ error: "Une erreur interne est survenue" }, 500);
    }
  }

  if (request.method === "POST") {
    try {
      const body = await request.json();
      const current = await loadSettings();

      if (typeof body.outOfStock === "boolean") {
        current.outOfStock = body.outOfStock;
      }
      if (typeof body.notifEnabled === "boolean") {
        current.notifEnabled = body.notifEnabled;
      }

      await saveSettings(current);
      return jsonResponse(current);
    } catch (err) {
      console.error("Save settings error:", err);
      return jsonResponse({ error: "Une erreur interne est survenue" }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
