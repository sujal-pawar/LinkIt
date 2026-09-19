import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { JoinRoomSchema, SignalMessageSchema } from "shared";
import { joinRoom, leaveRoom, findRoomBySocket } from "./rooms.js";

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

// ─── Socket.IO signaling ──────────────────────────────────────────────────────
io.on("connection", (socket: Socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── join-room ──────────────────────────────────────────────────────────────
  socket.on("join-room", (raw: unknown) => {
    const parsed = JoinRoomSchema.safeParse(raw);
    if (!parsed.success) {
      socket.emit("error", { message: "Invalid room code (min 4 chars)" });
      return;
    }

    const { roomCode } = parsed.data;
    const admitted = joinRoom(roomCode, socket.id);

    if (!admitted) {
      socket.emit("room-full", { roomCode });
      console.log(`[!] Room full: ${roomCode} — rejected ${socket.id}`);
      return;
    }

    socket.join(roomCode);
    socket.emit("room-joined", { roomCode });
    console.log(`    ${socket.id} joined room "${roomCode}"`);

    // Tell the other peer (if already present) that someone new arrived
    socket.to(roomCode).emit("peer-joined", { peerId: socket.id });
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
