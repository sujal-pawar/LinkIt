import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { JoinRoomSchema, SignalMessageSchema } from "shared";
import { joinRoom, leaveRoom, findRoomBySocket, getRoomMembers, roomExists } from "./rooms.js";

const PORT = process.env.PORT ?? 3001;

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── TURN credentials proxy ────────────────────────────────────────────────────
// The browser needs TURN username/password to authenticate RTCPeerConnection
// to the TURN server — that part is unavoidable and fine, TURN credentials are
// meant to be short-lived and handed to clients. What must NOT reach the
// browser is the long-lived Metered *account* API key: since Vite inlines any
// VITE_-prefixed env var straight into the shipped JS bundle at build time,
// putting the key there means anyone can read it out of devtools — enough to
// burn your quota or rack up charges on your account, not just this session.
//
// So the key lives ONLY here (server-side env var, never VITE_-prefixed), and
// the client calls this endpoint instead of Metered directly. This endpoint
// fetches fresh temporary credentials on each call and returns just those —
// the account key itself never leaves the server process.
const METERED_APP_NAME = process.env.METERED_APP_NAME;
const METERED_API_KEY  = process.env.METERED_API_KEY;

app.get("/api/turn-credentials", async (_req, res) => {
  if (!METERED_APP_NAME || !METERED_API_KEY) {
    // Not configured — client falls back to its own STUN-only / shared demo
    // TURN defaults. Not an error case, just "nothing to offer here".
    res.json([]);
    return;
  }

  try {
    const metered = await fetch(
      `https://${METERED_APP_NAME}.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`
    );
    if (!metered.ok) {
      throw new Error(`Metered API returned ${metered.status}`);
    }
    const iceServers = await metered.json();
    res.json(iceServers); // only the temporary TURN creds leave this process
  } catch (err) {
    console.error("[TURN] Failed to fetch Metered credentials:", err);
    res.status(502).json({ error: "Failed to fetch TURN credentials" });
  }
});

// ─── Socket.IO signaling ──────────────────────────────────────────────────────
io.on("connection", (socket: Socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── join-room ──────────────────────────────────────────────────────────────
  socket.on("join-room", (raw: unknown) => {
    const parsed = JoinRoomSchema.safeParse(raw);
    if (!parsed.success) {
      socket.emit("error", { message: "Invalid room code (4-32 characters)" });
      return;
    }

    const { roomCode, intent } = parsed.data;

    // Enforce create-vs-join semantics (see RoomIntentSchema in shared).
    // Separate event from "error" so the client can react to each case
    // (e.g. quietly retry with a fresh random ID on a collision).
    if (intent === "create" && roomExists(roomCode)) {
      socket.emit("room-error", { code: "exists", message: "That room ID is already in use." });
      return;
    }
    if (intent === "join" && !roomExists(roomCode)) {
      socket.emit("room-error", { code: "not-found", message: "No room with that ID. Check the code and try again." });
      return;
    }
    const admitted = joinRoom(roomCode, socket.id);

    if (!admitted) {
      socket.emit("room-full", { roomCode });
      console.log(`[!] Room full: ${roomCode} — rejected ${socket.id}`);
      return;
    }

    socket.join(roomCode);
    socket.emit("room-joined", { roomCode });
    console.log(`    ${socket.id} joined room "${roomCode}"`);

    // Tell the existing peer(s) that someone new arrived → they become initiators
    socket.to(roomCode).emit("peer-joined", { peerId: socket.id });

    // Also tell the NEW joiner about any peer already in the room.
    // We use a DIFFERENT event name (peer-present) so the joiner's useWebRTC
    // hook knows it's the responder and does NOT create an offer.
    const existingPeers = [...getRoomMembers(roomCode)].filter(id => id !== socket.id);
    if (existingPeers.length > 0) {
      socket.emit("peer-present", { peerId: existingPeers[0] });
      console.log(`    Notified ${socket.id} of existing peer ${existingPeers[0]}`);
    }
  });

  // ── signal (offer / answer / ice-candidate) ────────────────────────────────
  socket.on("signal", (raw: unknown) => {
    const parsed = SignalMessageSchema.safeParse(raw);
    if (!parsed.success) {
      // Reject bad payload — never forward unvalidated data to other peers
      socket.emit("error", { message: "Invalid signal payload" });
      console.warn(`[!] Bad signal from ${socket.id}:`, parsed.error.flatten());
      return;
    }

    const { roomCode, data } = parsed.data;
    // Relay only to the other peer in the same room, not back to sender
    socket.to(roomCode).emit("signal", { from: socket.id, data });
    console.log(`    Signal [${data.type}] relayed in room "${roomCode}"`);
  });

  // ── leave-room (explicit, e.g. user clicks "Leave room") ──────────────────
  // Without this, clicking "Leave room" only resets the CLIENT's own local
  // UI state — the socket stays connected and still a member of the room
  // server-side, so the other peer never learns anything happened. They'd
  // just watch the connection go silent and eventually time out into a
  // misleading "failed" state instead of a clean "peer left" message.
  socket.on("leave-room", (raw: unknown) => {
    const parsed = JoinRoomSchema.safeParse(raw); // same shape: { roomCode }
    if (!parsed.success) return;

    const { roomCode } = parsed.data;
    leaveRoom(roomCode, socket.id);
    socket.leave(roomCode);
    socket.to(roomCode).emit("peer-left", { peerId: socket.id });
    console.log(`[-] ${socket.id} explicitly left room "${roomCode}"`);
  });

  // ── disconnect cleanup ─────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const roomCode = findRoomBySocket(socket.id);
    if (roomCode) {
      leaveRoom(roomCode, socket.id);
      // Notify the other peer so they can show a "disconnected" state
      socket.to(roomCode).emit("peer-left", { peerId: socket.id });
      console.log(`[-] ${socket.id} left room "${roomCode}"`);
    } else {
      console.log(`[-] Disconnected (no room): ${socket.id}`);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`✅ LinkIt server running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});