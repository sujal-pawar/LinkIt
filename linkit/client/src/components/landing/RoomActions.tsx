import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { JoinRoomSchema } from "shared";
import type { RoomIntent } from "shared";
import {
  ROOM_ID_MAX,
  generateRoomId,
  isValidRoomId,
  sanitizeRoomId,
} from "../../lib/roomId";

interface Props {
  socket: Socket | null;
  connectionState: string;
  onJoined: (roomCode: string) => void;
}

interface Pending {
  intent: RoomIntent;
  code: string;
  /** True when the app picked the ID (so a collision can be retried silently). */
  random: boolean;
  retries: number;
}

// How long we wait for the server before telling the user something is wrong.
const RESPONSE_TIMEOUT_MS = 8000;
const MAX_RANDOM_RETRIES = 3;

/**
 * The two ways into a room, side by side:
 *  - Create: random ID by default, or the user's own ID.
 *  - Join:   enter an existing ID.
 * Both go through the same "join-room" socket event; `intent` tells the server
 * whether the room must be new (create) or already exist (join).
 */
export function RoomActions({ socket, connectionState, onJoined }: Props) {
  const [randomId, setRandomId] = useState(() => generateRoomId());
  const [useOwnId, setUseOwnId] = useState(false);
  const [ownId, setOwnId] = useState("");
  const [joinId, setJoinId] = useState("");
  const [pending, setPending] = useState<RoomIntent | null>(null);
  const [error, setError] = useState<{ scope: RoomIntent; message: string } | null>(null);

  // The in-flight request lives in a ref: socket callbacks are registered once
  // per socket, so they must read the latest value rather than a stale closure.
  const pendingRef = useRef<Pending | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const onJoinedRef = useRef(onJoined);
  useEffect(() => { onJoinedRef.current = onJoined; }, [onJoined]);

  const isConnected = connectionState === "connected";

  const clearTimer = () => { if (timerRef.current) clearTimeout(timerRef.current); };

  const fail = (message: string) => {
    clearTimer();
    const scope = pendingRef.current?.intent ?? "join";
    pendingRef.current = null;
    setPending(null);
    setError({ scope, message });
  };

  const send = (req: Pending) => {
    if (!socket?.connected) {
      setError({ scope: req.intent, message: "Not connected to the server yet. Try again in a moment." });
      return;
    }
    // Same Zod schema the server uses — catch bad input before it hits the wire.
    const payload = { roomCode: req.code, intent: req.intent };
    if (!JoinRoomSchema.safeParse(payload).success) {
      setError({ scope: req.intent, message: "That room ID isn't valid." });
      return;
    }
    pendingRef.current = req;
    setPending(req.intent);
    setError(null);
    clearTimer();
    timerRef.current = setTimeout(
      () => fail("The server didn't respond. Check your connection and try again."),
      RESPONSE_TIMEOUT_MS
    );
    socket.emit("join-room", payload);
  };

  // ── Socket events ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onRoomJoined = (data: { roomCode: string }) => {
      clearTimer();
      pendingRef.current = null;
      setPending(null);
      onJoinedRef.current(data.roomCode);
    };
    const onRoomFull = () => fail("That room already has two people in it.");
    const onRoomError = (data: { code: "exists" | "not-found"; message: string }) => {
      const req = pendingRef.current;
      // A randomly generated ID collided with a live room (very unlikely):
      // quietly pick another instead of bothering the user.
      if (req && req.random && data.code === "exists" && req.retries < MAX_RANDOM_RETRIES) {
        const next = generateRoomId();
        setRandomId(next);
        send({ ...req, code: next, retries: req.retries + 1 });
        return;
      }
      fail(data.code === "exists" ? "That room ID is already in use. Try another." : data.message);
    };
    const onServerError = (data: { message: string }) => fail(data.message);

    socket.on("room-joined", onRoomJoined);
    socket.on("room-full", onRoomFull);
    socket.on("room-error", onRoomError);
    socket.on("error", onServerError);
    return () => {
      socket.off("room-joined", onRoomJoined);
      socket.off("room-full", onRoomFull);
      socket.off("room-error", onRoomError);
      socket.off("error", onServerError);
      clearTimer();
    };
    // `send`/`fail` only touch refs and setState, so they're safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleCreate = () => {
    const code = useOwnId ? ownId : randomId;
    if (!isValidRoomId(code)) {
      setError({ scope: "create", message: "Use 4–16 letters, numbers or hyphens." });
      return;
    }
    send({ intent: "create", code, random: !useOwnId, retries: 0 });
  };

  const handleJoin = () => {
    if (!isValidRoomId(joinId)) {
      setError({ scope: "join", message: "Enter the room ID you were given (at least 4 characters)." });
      return;
    }
    send({ intent: "join", code: joinId, random: false, retries: 0 });
  };

  const busy = pending !== null;
  const createDisabled = !isConnected || busy;
  const joinDisabled = !isConnected || busy || joinId.length < 4;
  const createError = error?.scope === "create" ? error.message : "";
  const joinError = error?.scope === "join" ? error.message : "";

  const statusLabel =
    connectionState === "connected" ? "Connected to the server"
    : connectionState === "connecting" ? "Connecting to the server…"
    : connectionState === "error" ? "Can't reach the server"
    : "Disconnected from the server";

  return (
    <div id="start">
      {/* ── Create ── */}
      <section aria-labelledby="create-h">
        <h2 id="create-h" className="font-display text-xl font-semibold">Create a room</h2>
        <p className="mt-1 mb-4 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Get an ID and share it with one other person.
        </p>

        <label htmlFor={useOwnId ? "own-id" : undefined} className="block text-xs font-medium mb-1.5"
               style={{ color: "var(--color-text-secondary)" }}>
          {useOwnId ? "Your room ID" : "Room ID"}
        </label>
        <div className="flex gap-2">
          {useOwnId ? (
            <input
              id="own-id"
              className="field"
              value={ownId}
              onChange={(e) => { setOwnId(sanitizeRoomId(e.target.value)); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && !createDisabled && handleCreate()}
              placeholder="e.g. TEAM-42"
              maxLength={ROOM_ID_MAX}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy}
              aria-invalid={!!createError}
              aria-describedby="own-id-hint"
            />
          ) : (
            <>
              <output className="field flex items-center" aria-live="polite">{randomId}</output>
              <button type="button" className="icon-btn" aria-label="Generate a different room ID"
                      onClick={() => { setRandomId(generateRoomId()); setError(null); }} disabled={busy}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
                </svg>
              </button>
            </>
          )}
        </div>

        <div className="mt-2 mb-4 min-h-5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
          {useOwnId && <span id="own-id-hint" className="mr-3">4–16 letters, numbers or hyphens.</span>}
          <button type="button" className="link-btn"
                  onClick={() => { setUseOwnId((v) => !v); setError(null); }}>
            {useOwnId ? "Use a random ID instead" : "Choose my own ID"}
          </button>
        </div>

        {createError && (
          <p role="alert" className="mb-3 text-sm" style={{ color: "var(--color-error)" }}>{createError}</p>
        )}

        <button id="create-room-btn" type="button" className="btn btn--primary"
                onClick={handleCreate} disabled={createDisabled} aria-busy={pending === "create"}>
          {pending === "create" ? (<><Spinner /> Creating…</>) : "Create room"}
        </button>
      </section>

      {/* ── Divider ── */}
      <div className="my-6 flex items-center gap-3 text-xs" style={{ color: "var(--color-text-tertiary)" }} aria-hidden="true">
        <span className="h-px flex-1" style={{ background: "var(--color-border)" }} />
        or
        <span className="h-px flex-1" style={{ background: "var(--color-border)" }} />
      </div>

      {/* ── Join ── */}
      <section aria-labelledby="join-h">
        <h2 id="join-h" className="font-display text-xl font-semibold">Join a room</h2>
        <p className="mt-1 mb-4 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Someone sent you an ID? Enter it here.
        </p>

        <label htmlFor="join-id" className="block text-xs font-medium mb-1.5"
               style={{ color: "var(--color-text-secondary)" }}>
          Room ID
        </label>
        <input
          id="join-id"
          className="field mb-3"
          value={joinId}
          onChange={(e) => { setJoinId(sanitizeRoomId(e.target.value)); setError(null); }}
          onKeyDown={(e) => e.key === "Enter" && !joinDisabled && handleJoin()}
          placeholder="Enter the room ID"
          maxLength={ROOM_ID_MAX}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={busy}
          aria-invalid={!!joinError}
        />
        {joinError && (
          <p role="alert" className="mb-3 text-sm" style={{ color: "var(--color-error)" }}>{joinError}</p>
        )}
        <button type="button" className="btn btn--secondary" onClick={handleJoin}
                disabled={joinDisabled} aria-busy={pending === "join"}>
          {pending === "join" ? (<><Spinner /> Joining…</>) : "Join room"}
        </button>
      </section>

      {/* ── Connection status ── */}
      <p className="mt-5 flex items-center gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }} role="status">
        <span className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: isConnected ? "var(--color-success)" : connectionState === "connecting" ? "var(--color-warning)" : "var(--color-error)" }} />
        {statusLabel}
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true" />
  );
}
