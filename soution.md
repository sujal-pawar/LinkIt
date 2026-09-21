# solution.md — LinkIt (React + Express + Socket.IO + TypeScript + Zod)

This is the full build plan, phase by phase, plus the real problems we
hit while building it and how we fixed them. Written in simple language
on purpose — this file is your interview prep notes.

**Status: Phases 0–8 complete.** (Phase 8 partially — TURN and resumable
transfer done; Redis and multi-file transfer intentionally skipped.)

---

## The stack, in plain words

- **Express + Socket.IO** — a small "matchmaking" server. It does NOT
  carry the file. It only helps two browsers find each other and swap a
  few setup messages, then gets out of the way.
- **TypeScript** — catches typo-style bugs (wrong field name, wrong
  type) while writing code, before ever running it.
- **Zod** — checks that data arriving from outside (a socket message, a
  file-transfer control message) is actually shaped the way we expect,
  *at the moment it arrives*. TypeScript types disappear once the code
  is running — Zod is the real-time version of that safety check.
- **React** — the UI. All the WebRTC connection logic lives in one
  reusable function (a "hook") so the screen code stays simple.

## Project structure
```
linkit/
├── package.json          (ties the 3 folders together — "workspaces")
├── shared/                (Zod schemas both client and server use)
│   └── src/schemas.ts
├── server/
│   └── src/
│       ├── index.ts       (the matchmaking server + TURN credentials proxy)
│       └── rooms.ts       (tracks who's in which room)
└── client/                 (the React app)
    └── src/
        ├── hooks/
        │   ├── useSocket.ts    (talks to the server)
        │   └── useWebRTC.ts    (the actual peer-to-peer connection)
        ├── components/
        │   ├── JoinRoom.tsx
        │   └── FileTransfer.tsx
        └── App.tsx
```
One schema file, used by both the client and the server, so they can
never quietly disagree about what a message looks like.

---

## Phase 0 — Set up the project skeleton
**Goal:** three empty folders (`shared`, `server`, `client`) that are
properly linked together, all able to start with no errors.
**Checkpoint:** `npm run dev` works in every folder.

---

## Phase 1 — Define every message shape up front (Zod schemas)
**Goal:** one file, `shared/src/schemas.ts`, listing every kind of
message that will ever travel between client and server — before
writing any real logic.

What it defines:
- `JoinRoomSchema` — joining a room (also carries `intent`: "create" or
  "join", so a typo'd room code fails with a clear error instead of
  silently creating an empty room, and creating with a taken ID fails
  instead of dropping you into a stranger's room)
- `SignalDataSchema` — the three WebRTC handshake message types
  (offer / answer / ice-candidate)
- `FileControlSchema` — file-transfer messages (meta / done /
  resume-request)

**Why this matters:** once data comes from outside your code (a network
message), TypeScript can't guarantee its shape anymore — only Zod can,
because Zod actually checks at the moment the data arrives, not just
while you're writing the code.

**Checkpoint:** the `shared` package builds and both other packages can
import from it.

---

## Phase 2 — Build the matchmaking server
**Goal:** a small Express + Socket.IO server that lets two browsers find
each other in the same "room" and pass handshake messages back and
forth. It never sees or touches the actual file being sent.

Every message coming into the server is checked with Zod first
(`safeParse`) before being trusted or forwarded — a broken or malicious
message gets rejected instead of crashing the server or corrupting room
state.

**Checkpoint:** two people can join the same room code, and a
deliberately broken message gets rejected cleanly instead of crashing
anything.

---

## Phase 3 — Build the React screen (join room + connect to server)

Also in this phase: styled the whole app with **Tailwind CSS**, using a
clean, minimal look inspired by X/Twitter — proper spacing, simple
typography, a blue accent color, and consistent hover/focus/loading/
error/disabled states across every button and input. Fully responsive,
no functionality changed — purely visual polish layered on top of the
working app.

**Goal:** a `useSocket` hook that connects once and stays connected, and
a `JoinRoom` screen where someone types a room code and joins.

**Checkpoint:** two browser tabs can join the same room code and each
see "peer joined" show up on screen.

---

## Phase 4 — Build the actual peer-to-peer connection (`useWebRTC`)
**Goal:** the real WebRTC handshake — this is the core of the whole
project.

In plain terms: two browsers can't just start talking to each other out
of nowhere. They first exchange a bit of setup information (through our
matchmaking server) — what kind of connection they want (an "offer" and
an "answer"), and their possible network paths ("ICE candidates",
discovered partly with the help of a public STUN server). Once that's
done, the two browsers connect **directly** — the server's job is over.

One subtlety: ICE candidates can arrive *before* the offer/answer
exchange has finished. Using one too early throws an error, so early
candidates get held in a small waiting list and applied right after the
offer/answer step completes.

**Checkpoint:** two tabs actually reach a "connected" state.

---

## Phase 5 — Send an actual file
**Goal:** once connected, send a real file directly between the two
browsers, not through the server.

How it works:
1. Sender tells the receiver "here's a file coming" (name + size)
2. Sender cuts the file into small 16KB pieces and sends them one by one
3. Sender watches how full the connection's internal buffer is and
   pauses if it gets too full (otherwise a big file can flood memory) —
   using two thresholds, not one: pause above 256KB, don't resume until
   drained all the way down to 64KB, so it doesn't pause/resume rapidly
   back-to-back right at one number
4. Sender sends a "done" message at the end
5. Receiver collects every piece in order and reassembles the full file
   once "done" arrives, then offers it as a download

**Checkpoint:** send a real multi-MB file between two tabs and confirm
the downloaded file is identical to the original.

---

## Phase 6 — Handle errors properly, not silently
- Room full, or peer disconnects → show a clear message, never a silent
  freeze
- A broken/invalid message → shown as a visible warning, not just hidden
  in the browser console
- Clear "connecting…" state so the screen isn't blank while the
  handshake is happening

---

## Phase 7 — Actually test it on real devices
- Two tabs, same laptop — the easy baseline (barely tests anything real)
- Two different devices, same WiFi — the first REAL test
- Two devices on different networks (phone on mobile data, laptop on
  WiFi) — the strongest test, closest to how real users connect

---

## Phase 8 — Extra features, only after everything above works
1. TURN server (a relay server for when a direct connection fails) — **done**
2. Resumable transfer (pick up where it left off after a disconnect) — **done**
3. Redis-based room storage (only needed with multiple servers) — not done, not needed yet
4. Sending multiple files at once — not done
5. Server-side TURN credentials proxy (keep the Metered account key off
   the client entirely) — **done**, see Problem 5 below

---

## Problems we actually ran into, and how we fixed them

This is the most useful section for an interview — real bugs, in plain
language.

### 1. Phone and laptop wouldn't connect, even on the same WiFi
**What we saw:** Worked fine in two tabs on one laptop. Failed the
moment we tried phone + laptop, even though TURN was already set up.

**Why:** Two tabs on one laptop never really leave the machine — no real
network involved, so that test proved nothing. The TURN server we were
using was a free, public, shared one used by thousands of other
projects — it was simply overloaded/out of quota when we needed it.

**How we found it:** Checked the browser console on both devices —
saw the TURN server directly rejecting our connection requests (error
code 400).

**Fix:** Got our own personal, private TURN credentials instead of
sharing the public demo ones.

### 2. Our own TURN credentials also failed at first ("Invalid API Key")
**Why:** The dashboard had two different kinds of keys. We copied the
wrong one — a general account key instead of the specific key meant for
this exact feature.

**How we found it:** Tested the credentials link directly in the
browser — it gave back a plain error message confirming it wasn't a
code problem, just the wrong key.

**Fix:** Used the correct key from the right page on the dashboard.

### 3. Two tabs on one laptop suddenly stopped connecting too
**Why:** While debugging problem 1, we'd turned on a testing-only switch
that forces every connection through the relay server only (to prove
the relay itself works). We forgot to turn it back off — and two tabs
on the same machine don't handle that mode well.

**Fix:** Turned the testing switch back off once we'd confirmed the
relay server worked.

### 4. When one person left, the other saw a scary "connection failed" error
This one had **two separate causes** behind the exact same-looking bug —
a good story to tell in an interview.

**First cause:** Our connection code had no way of knowing when the
other person left — it just waited, and eventually gave up with a
"failed" message meant for real network problems, not a normal goodbye.
**First fix:** Made the server immediately tell the other person the
moment someone disconnects, and made our code close the connection
cleanly right away when it hears that, instead of waiting around.

**Second cause (found after the first fix, same symptom still showed
up):** Turned out the actual "Leave room" button never told the server
anything at all — it only reset the leaving person's own screen. So
clicking it looked like nothing happened from the server's point of
view, and the same slow, confusing error showed up again.
**Second fix:** Made the "Leave room" button actually message the server
before leaving, so the server can tell the other person right away.

**The lesson:** the same visible bug had two unrelated causes underneath
it. Fixing the first one didn't fix the second — they just happened to
look identical on screen. Good reminder to test a bug through *every*
way it can actually happen, not just one.

### 5. The Metered API key was sitting in plain text in the shipped app
**What we saw:** Opened Chrome DevTools → Sources → Search, searched the
whole codebase for the key name. It showed up as a plain string, twice —
once inside the compiled `useSocket.ts` output and once inside
`useWebRTC.ts`, sitting right in an object literal at the very top of
the bundled file, alongside `VITE_FORCE_RELAY` and `VITE_METERED_APP_NAME`.

**Why:** Vite does a **build-time find-and-replace** on every
`import.meta.env.VITE_*` reference — it's not a runtime lookup, it's a
literal string baked directly into the JavaScript file the browser
downloads. Any env var prefixed `VITE_` is guaranteed to end up
readable by anyone who opens devtools, no exploit needed — it's not a
bug in the traditional sense, it's exactly what that prefix is
documented to do.

**Two different kinds of "credential" were being confused:**
- The **TURN username/password** — these *are* meant to reach the
  browser. `RTCPeerConnection` needs them client-side to talk to the
  TURN server, and providers issue them short-lived specifically because
  they expect them to be semi-public.
- The **Metered account API key** — this mints those TURN credentials
  and should never leave the server. Leaking it doesn't expose file
  transfers (those are end-to-end encrypted and mostly go direct, not
  through TURN); it exposes your account's quota and, depending on the
  plan, billing.

**How we found it:** searched the actual built bundle a browser
downloads — not the source code we wrote — the same way an attacker
would look for it.

**Fix:** moved the key to a server-only env var (`METERED_API_KEY`, no
`VITE_` prefix) and added a `GET /api/turn-credentials` route on the
signaling server. The client now calls that route instead of Metered
directly; the server calls Metered with the key held server-side and
returns only the short-lived TURN credentials. The account key never
ships to the browser at all. Re-running the same DevTools search
afterward turns up nothing.

### Quick recap table

| Problem | Looked like | Actually was | Fixed by |
|---|---|---|---|
| Phone/laptop won't connect | Network/NAT issue | Shared TURN server out of quota | Our own private TURN credentials |
| "Invalid API Key" | Broken code | Wrong key copied from dashboard | Used the correct key |
| Tabs stopped connecting | New bug | Leftover testing-only switch left on | Turned the switch off |
| "Connection failed" on leaving (1st time) | Real failure | Nobody told our code the peer left | Server now notifies instantly, we close cleanly |
| Same error again (2nd time) | Same bug, unfixed | "Leave" button never told the server anything | Button now messages the server first |
| Metered API key visible in DevTools | A prototype convenience, not a "real bug" | `VITE_`-prefixed env vars get baked into the public bundle at build time | Server-side proxy endpoint; key never leaves the server |

---

## What to be able to explain cold in the interview
- The full WebRTC handshake, in your own words: offer → answer → ICE
  candidates → connected — and why a "matchmaking" server is needed at
  all for something that's supposedly peer-to-peer.
- Why passing the two-tabs test proved almost nothing, and why the real
  test only happened once two separate devices were involved.
- The difference between STUN failing and TURN failing, and why the fix
  for each is different.
- The full "Problem 4" story above, start to finish — two different
  root causes, same visible symptom. This is your strongest "tell me
  about a bug you debugged" answer in the whole project.
- The "Problem 5" story — the difference between a credential that's
  *supposed* to reach the browser (TURN username/password) and one that
  never should (the account API key), and how you actually verified the
  leak (searching the built bundle, not the source) rather than just
  assuming it based on a rule you'd read somewhere.