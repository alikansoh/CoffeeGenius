import crypto from "crypto";

/** How long a manage-subscription link stays valid after being (re)issued. Comfortably covers
 *  the longest delivery frequency (4 weeks) with a buffer — and a fresh one is emailed on every
 *  payment anyway, so this only matters if a customer needs the link between renewals. */
export const MANAGE_TOKEN_TTL_MS = 45 * 24 * 60 * 60 * 1000; // 45 days

export function mintManageToken(): { token: string; expiresAt: Date } {
  return {
    token: crypto.randomBytes(24).toString("hex"),
    expiresAt: new Date(Date.now() + MANAGE_TOKEN_TTL_MS),
  };
}
