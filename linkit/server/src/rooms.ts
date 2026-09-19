/**
 * rooms.ts — in-memory room registry
 *
 * Design decisions:
 * - Map<roomCode, Set<socketId>>: O(1) lookup, natural Set semantics for members
 * - Max 2 peers per room: enforced at join-time so the caller gets a clear error
 * - No persistence: rooms are ephemeral — if the server restarts, all rooms clear.
 *   Acceptable for v1; Phase 8 stretch goal adds Redis-backed state.
 */

type RoomCode = string;
type SocketId = string;

const rooms = new Map<RoomCode, Set<SocketId>>();

/** Returns true if the socket was added, false if the room is full (≥ 2). */
export function joinRoom(roomCode: RoomCode, socketId: SocketId): boolean {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, new Set());
  }
  const members = rooms.get(roomCode)!;
  if (members.size >= 2) return false;
  members.add(socketId);
  return true;
}

/** Remove a socket from whatever room it's in (called on disconnect). */
export function leaveRoom(roomCode: RoomCode, socketId: SocketId): void {
  const members = rooms.get(roomCode);
  if (!members) return;
  members.delete(socketId);
  if (members.size === 0) rooms.delete(roomCode); // GC empty rooms
}

/** Returns all socketIds in a room (excluding the caller if needed). */
export function getRoomMembers(roomCode: RoomCode): Set<SocketId> {
  return rooms.get(roomCode) ?? new Set();
}

/** Find which room a socket is currently in (for disconnect cleanup). */
export function findRoomBySocket(socketId: SocketId): RoomCode | undefined {
  for (const [code, members] of rooms) {
    if (members.has(socketId)) return code;
  }
  return undefined;
}
