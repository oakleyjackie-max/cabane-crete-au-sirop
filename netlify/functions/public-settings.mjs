/**
 * Public settings endpoint (no auth required).
 * Returns only publicly-relevant settings (outOfStock).
 * This allows non-admin visitors to see if the store is out of stock.
 */
import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const store = getStore("admin-settings");
    const raw = await store.get("config", { type: "json" });
    const settings = raw || {};

    return new Response(
      JSON.stringify({ outOfStock: settings.outOfStock ?? false }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=30",
        },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ outOfStock: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};