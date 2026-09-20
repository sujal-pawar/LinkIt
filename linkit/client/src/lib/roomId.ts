// Room ID helpers shared by the "create" and "join" flows.

// Unambiguous alphabet: no 0/O or 1/I/L, so an ID read aloud or copied from a
// screenshot is hard to mistype.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const ROOM_ID_MIN = 4;   // matches the server-side schema (min 4)
export const ROOM_ID_MAX = 16;  // client cap; the server accepts up to 32

/**
 * Random 6-character ID (~10^9 combinations).
 * Uses crypto.getRandomValues instead of Math.random(): the room ID is the only
 * thing keeping strangers out of a room, so it shouldn't be predictable.
 * Modulo bias is negligible here (256 % 31 leaves a tiny skew) for a 6-char code.
 */
export function generateRoomId(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Uppercase and drop anything that isn't a letter, digit or hyphen. */
export function sanitizeRoomId(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, ROOM_ID_MAX);
}

export function isValidRoomId(id: string): boolean {
  return id.length >= ROOM_ID_MIN && id.length <= ROOM_ID_MAX && /^[A-Z0-9-]+$/.test(id);
}
