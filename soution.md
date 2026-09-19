# solution.md — LinkIt-DIY (React + Express + Socket.IO + TypeScript + Zod)

Step-wise build plan. Each phase has a goal, the files it touches, and a
checkpoint to confirm it actually works before moving on. Concepts (WebRTC
handshake, backpressure, etc.) are the same as the vanilla-JS version we
already built and explained — this plan just rebuilds it on a stricter,
production-shaped stack.

## Stack & why
- **Express + Socket.IO** — signaling relay (unchanged role from before)
- **TypeScript everywhere** — catch signaling-payload shape bugs at
  compile time instead of discovering them mid-demo
- **Zod** — runtime validation at every socket message boundary. TS types
  only exist at compile time; once data comes off the wire (from a socket
  event), you're back to `any` unless you validate it. Zod schemas double
  as the source of truth for the TS types (`z.infer<...>`), so you define
  the shape once.
- **React** — the client UI, with the WebRTC logic isolated in a custom
  hook so it's testable/reusable separately from rendering

## Project structure
```
linkit/
├── package.json          (npm workspaces root)
├── shared/                (Zod schemas + inferred types, used by both sides)
│   └── src/schemas.ts
├── server/
│   └── src/
│       ├── index.ts
│       └── rooms.ts
└── client/                (React app, e.g. via Vite)
    └── src/
        ├── hooks/
        │   ├── useSocket.ts
        │   └── useWebRTC.ts
        ├── components/
        │   ├── JoinRoom.tsx
        │   └── FileTransfer.tsx
        └── App.tsx
```
Using **npm workspaces** so `shared` can be imported by both `server` and
`client` without publishing a package — one schema, no drift between
frontend/backend validation.

---

## Phase 0 — Scaffolding
**Goal:** empty but correctly wired workspace, all three packages build.
- Root `package.json` with `"workspaces": ["shared", "server", "client"]`
- `shared`: plain TS package (`tsconfig.json`, builds to `dist`)
- `server`: TS + `ts-node-dev` (or `tsx`) for hot reload
- `client`: Vite + React + TS template
**Checkpoint:** `npm run dev` in each workspace starts without errors.

---

## Phase 1 — Shared Zod schemas (do this before any logic)
**Goal:** one file that defines every message shape that crosses the
client↔server boundary, so both sides import the same source of truth.

`shared/src/schemas.ts`:
```ts
import { z } from "zod";

export const JoinRoomSchema = z.object({ roomCode: z.string().min(4) });

export const SignalOfferSchema = z.object({
  type: z.literal("offer"),
  sdp: z.any(), // RTCSessionDescriptionInit - not worth over-typing
});
export const SignalAnswerSchema = z.object({
  type: z.literal("answer"),
  sdp: z.any(),
});
export const SignalIceSchema = z.object({
  type: z.literal("ice-candidate"),
  candidate: z.any(),
});

// discriminated union: TS narrows on `type` automatically after validation
export const SignalDataSchema = z.discriminatedUnion("type", [
  SignalOfferSchema,
  SignalAnswerSchema,
  SignalIceSchema,
]);

export const SignalMessageSchema = z.object({
  roomCode: z.string(),
  data: SignalDataSchema,
});

// File-transfer control messages (sent over the DataChannel, not sockets -
// but validating them the same way keeps the protocol honest)
export const FileMetaSchema = z.object({
  type: z.literal("meta"),
  name: z.string(),
  size: z.number().positive(),
});
export const FileDoneSchema = z.object({ type: z.literal("done") });
export const FileControlSchema = z.discriminatedUnion("type", [
  FileMetaSchema,
  FileDoneSchema,
]);

export type SignalMessage = z.infer<typeof SignalMessageSchema>;
export type FileControlMessage = z.infer<typeof FileControlSchema>;
```
**Why validate DataChannel messages too, not just sockets?** Same reason:
anything arriving from outside your current function is untyped at
runtime. It's a cheap habit that pays off the moment you touch the
protocol again in three months.

**Checkpoint:** `shared` builds, exports schemas + inferred types cleanly.

---

## Phase 2 — Signaling server (Express + Socket.IO + TS)
**Goal:** same responsibility as the vanilla-JS server, rewritten with
validation at the boundary.

`server/src/rooms.ts` — the `Map<roomCode, Set<socketId>>` room tracking,
unchanged in concept from before (in-memory, max 2 peers per room).

`server/src/index.ts` — on every incoming socket event, **parse with Zod
before trusting the payload**:
```ts
socket.on("signal", (raw) => {
  const parsed = SignalMessageSchema.safeParse(raw);
  if (!parsed.success) {
    socket.emit("error", { message: "Invalid signal payload" });
    return;
  }
  const { roomCode, data } = parsed.data;
  socket.to(roomCode).emit("signal", { from: socket.id, data });
});
```
**Why this matters for the interview:** validating socket payloads is
exactly the kind of "why not just trust the client" question that comes
up — a malformed or malicious payload from a compromised/hostile client
shouldn't be able to crash your server or corrupt room state.

**Checkpoint:** run the server, use `socket.io-client` in a throwaway
script (or `curl`-free manual test via two browser console tabs) to
confirm `join-room` and `signal` still relay correctly, and that a
deliberately malformed payload gets rejected, not crash the process.

---

## Phase 3 — React client: room join UI + socket connection
**Goal:** `useSocket` hook wraps the raw `socket.io-client` instance;
`JoinRoom.tsx` lets a user type a room code and join.
- `useSocket.ts`: connects once (via `useEffect` + a ref to avoid
  reconnecting on every render), exposes `socket` and connection state
- Validate *incoming* events with the same Zod schemas from `shared`
  before updating React state — never trust an unvalidated payload into
  `setState`
**Checkpoint:** two browser tabs can join the same room code and see
"peer joined" state update in React.

---

## Phase 4 — `useWebRTC` hook: the handshake
**Goal:** port the offer/answer/ICE logic from the vanilla version into a
hook that owns the `RTCPeerConnection` lifecycle.
- `useWebRTC(socket, roomCode)` returns `{ connectionState, dataChannel }`
- Internally: same initiator-on-`peer-joined` logic, same STUN-only
  config, same `onicecandidate` → emit `signal` flow
- Clean up the `RTCPeerConnection` on unmount (`pc.close()`) — a React-
  specific concern the vanilla version didn't have to worry about
**Checkpoint:** `connectionState` reaches `"connected"` in both tabs'
React DevTools/console.

---

## Phase 5 — File transfer protocol
**Goal:** port the chunking/backpressure logic from the vanilla version,
now validating control messages with `FileControlSchema`.
- `FileTransfer.tsx` — file picker, send button, progress bar (as React
  state, not direct DOM manipulation this time)
- Same constants: `CHUNK_SIZE = 16 * 1024`, `bufferedAmount` backpressure
  check before each `send()`
- On receive: same accumulate-chunks-then-`Blob` reassembly, exposed as a
  downloadable `<a>` once `type: "done"` is validated and received
**Checkpoint:** send a real file (try a few MB) between two tabs, confirm
byte-identical download (diff the file hash before/after if you want to
be rigorous — good interview answer: "I verified integrity with a hash
comparison, not just 'it opened fine'").

---

## Phase 6 — Error states & polish
- Room full / peer disconnected mid-transfer → user-visible message, not
  a silent hang
- Zod validation failures surfaced as toast/error text, not just console
- Basic loading/connecting states so the UI isn't blank while handshake
  is in progress

---

## Phase 7 — Manual QA pass
- Two tabs, same machine (localhost) — baseline
- Two devices, same network — tests real NAT behavior locally
- Two devices, different networks (e.g. phone on mobile data + laptop on
  wifi) — this is where STUN-only limitations may show up; if it fails,
  that's your live demonstration of *why* TURN exists

---

## Phase 8 — Stretch goals (only if time allows, don't scope-creep v1)
1. TURN server fallback (free tier from a provider, or self-hosted coturn)
2. Resumable transfer (track last-received chunk index, resume on
   reconnect instead of restarting)
3. Redis-backed room state for multi-instance signaling
4. Multi-file / folder transfer

---

## What changed vs. the vanilla-JS version (know this cold)
| | Vanilla JS version | This version |
|---|---|---|
| Payload safety | Trusted whatever arrived | Zod-validated at every boundary |
| Types | None | TS end-to-end, inferred from Zod schemas |
| UI state | Direct DOM manipulation | React state/hooks |
| Schema drift risk | Server/client shapes could silently diverge | Single shared schema, imported by both |

Being able to explain *why* you'd rebuild something on a stricter stack —
not just that you did — is itself a good interview answer: it shows you
understand the trade-off between "fast prototype" and "defensible
production shape."