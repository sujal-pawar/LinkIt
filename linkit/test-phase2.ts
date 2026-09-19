/**
 * Phase 2 verification script
 * Run from: d:\Projects\P2P Share\linkit\
 * Command:   npx tsx test-phase2.ts
 *
 * Tests:
 * 1. Client A joins a room → gets room-joined
 * 2. Client B joins same room → gets room-joined, Client A gets peer-joined
 * 3. Client A sends a valid signal → Client B receives it
 * 4. Client A sends a malformed signal → gets error, Client B gets nothing
 * 5. Client C tries to join a full room → gets room-full
 * 6. Client B disconnects → Client A gets peer-left
 */
import { io as ioClient, Socket } from "socket.io-client";

const SERVER = "http://localhost:3001";
const ROOM = "TEST" + Math.random().toString(36).slice(2, 6).toUpperCase();

let passed = 0;
let failed = 0;
const sockets: Socket[] = [];

function log(ok: boolean, label: string, extra = "") {
  if (ok) { console.log(`  ✅ ${label}`); passed++; }
  else     { console.error(`  ❌ ${label}${extra ? ": " + extra : ""}`); failed++; }
}

function connect(): Socket {
  const s = ioClient(SERVER, { transports: ["websocket"] });
  sockets.push(s);
  return s;
}

function waitFor(socket: Socket, event: string, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data: unknown) => { clearTimeout(t); resolve(data); });
  });
}

async function run() {
  console.log(`\n── Phase 2 signaling server tests (room: ${ROOM}) ──────`);

  const clientA = connect();
  const clientB = connect();
  const clientC = connect();

  await new Promise(r => setTimeout(r, 500)); // let sockets connect

  // ── Test 1: A joins room ───────────────────────────────────────────────────
  const joinedA = waitFor(clientA, "room-joined");
  clientA.emit("join-room", { roomCode: ROOM });
  try {
    const d = await joinedA as { roomCode: string };
    log(d.roomCode === ROOM, "Test 1: Client A joined room");
  } catch (e) { log(false, "Test 1: Client A joined room", String(e)); }

  // ── Test 2: B joins same room, A gets peer-joined ─────────────────────────
  const joinedB = waitFor(clientB, "room-joined");
  const peerJoinedA = waitFor(clientA, "peer-joined");
  clientB.emit("join-room", { roomCode: ROOM });
  try {
    const [b] = await Promise.all([joinedB, peerJoinedA]);
    log((b as { roomCode: string }).roomCode === ROOM, "Test 2: Client B joined room");
    log(true, "Test 2: Client A received peer-joined");
  } catch (e) { log(false, "Test 2: B joins / A gets peer-joined", String(e)); }

  // ── Test 3: A sends valid offer signal → B receives it ────────────────────
  const signalOnB = waitFor(clientB, "signal");
  clientA.emit("signal", {
    roomCode: ROOM,
    data: { type: "offer", sdp: { type: "offer", sdp: "v=0\r\n..." } }
  });
  try {
    const sig = await signalOnB as { data: { type: string } };
    log(sig.data.type === "offer", "Test 3: Valid offer signal relayed to B");
  } catch (e) { log(false, "Test 3: Signal relay", String(e)); }

  // ── Test 4: A sends malformed signal → gets error, B gets nothing ─────────
  let bGotBadSignal = false;
  clientB.once("signal", () => { bGotBadSignal = true; });
  const errorOnA = waitFor(clientA, "error");
  clientA.emit("signal", { roomCode: ROOM, data: { type: "INVALID_TYPE" } });
  try {
    await errorOnA;
    log(!bGotBadSignal, "Test 4: Malformed signal rejected (A got error, B got nothing)");
  } catch (e) { log(false, "Test 4: Malformed signal rejection", String(e)); }

  // ── Test 5: C tries to join full room → gets room-full ────────────────────
  const roomFull = waitFor(clientC, "room-full");
  clientC.emit("join-room", { roomCode: ROOM });
  try {
    await roomFull;
    log(true, "Test 5: Third client rejected with room-full");
  } catch (e) { log(false, "Test 5: room-full enforcement", String(e)); }

  // ── Test 6: B disconnects → A gets peer-left ─────────────────────────────
  const peerLeft = waitFor(clientA, "peer-left");
  clientB.disconnect();
  try {
    await peerLeft;
    log(true, "Test 6: Client A received peer-left on B disconnect");
  } catch (e) { log(false, "Test 6: peer-left on disconnect", String(e)); }

  // ── Cleanup & results ─────────────────────────────────────────────────────
  sockets.forEach(s => s.disconnect());
  console.log(`\n────────────────────────────────────────────────────────`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  else console.log("🎉 All Phase 2 signaling tests passed!");
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
