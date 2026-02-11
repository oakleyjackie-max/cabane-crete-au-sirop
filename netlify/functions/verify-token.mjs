/**
 * Token verification endpoint.
 * GET with Authorization: Bearer <token>
 * Returns { valid: true } or 401.
 *
 * Used by the frontend to check if a stored token is still valid on page load.
 */
import { requireAuth, jsonResponse } from "./auth-helpers.mjs";

export default async (request) => {
  const authError = await requireAuth(request);
  if (authError) return authError;

  return jsonResponse({ valid: true });
};