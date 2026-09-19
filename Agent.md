# agent.md

You are building LinkIt-DIY following `solution.md`, phase by phase, in
order. Do not skip ahead or generate multiple phases at once — each phase
has a checkpoint that must pass before the next begins.

## Stack (fixed, do not substitute)
React + Vite, Express, Socket.IO, TypeScript (strict mode on in every
workspace), Zod. npm workspaces monorepo: `shared/`, `server/`, `client/`.

## Non-negotiable conventions
1. **Every socket event payload and every DataChannel control message
   must be parsed with a Zod schema from `shared/src/schemas.ts` before
   its data is used.** Never trust an incoming payload's shape via a TS
   type assertion alone — TS types vanish at runtime, Zod parsing doesn't.
2. **Zod schemas are the source of truth for types.** Derive TS types with
   `z.infer<typeof Schema>`, don't hand-write a parallel interface that
   can drift out of sync.
3. **One schema file, two consumers.** `shared` is imported by both
   `server` and `client` via the workspace — never duplicate a schema
   definition in both places.
4. **Comment every WebRTC/networking decision inline**, not just in
   `solution.md` — future-reader (the human building this) needs to
   understand *why* at the point where the code makes the decision:
   why STUN-only, why 16KB chunks, why the backpressure check, why
   ordered/reliable delivery means no manual ack protocol is needed.
5. **Clean up resources.** Every `RTCPeerConnection` must be closed on
   component unmount or peer disconnect. Every socket listener registered
   in a `useEffect` must be removed in its cleanup function.
6. **No premature scope.** Do not add TURN, resumable transfer, or Redis
   in phases 0–7 even if it seems easy — those are Phase 8 stretch goals
   by design, so the v1 stays small enough to fully explain.

## Working style — after every phase
1. Generate only that phase's files.
2. Give a short plain-English summary of what was built and the specific
   decisions made (mirroring the "why" sections in `solution.md`).
3. State the phase's checkpoint and how to verify it manually.
4. Stop and wait — do not proceed to the next phase automatically. The
   human needs to actually run the checkpoint and understand what was
   built before more code exists, or they end up holding code they can't
   defend in an interview. That defeats the entire point of this build.

## If asked to "just generate everything at once"
Push back once: explain that the phased, checkpoint-by-checkpoint
approach exists specifically so the person building this can explain
every decision later, not just have working code. If they still want it
all at once after that, proceed — but keep every inline comment and the
full Phase-by-Phase structure of `solution.md` intact regardless, so the
reasoning is still recoverable afterward.

## Definition of done
All 7 core phases complete (Phase 8 optional), two browsers on different
networks can complete a real file transfer end to end, and every
non-obvious decision in the code has an inline comment explaining why —
not just what.
## Status update (post Phase 5 + TURN fix + resumable transfer)
- TURN credentials are now fetched dynamically per-user from Metered's
  API (see `getIceServers()` in `useWebRTC.ts`), not hardcoded shared
  demo credentials. Falls back to shared demo TURN if no `.env` is set.
- `VITE_FORCE_RELAY=true` debug flag added for isolating TURN failures.
- Resumable transfer (Phase 8, item 2) is now implemented: `onClose`
  preserves buffered chunks (receiver) and the in-flight File reference
  (sender) instead of discarding them; `onOpen` triggers a
  `resume-request` control message; `resumeSend()` seeks into the same
  File object and continues from the reported byte offset. See
  `ResumeRequestSchema` in `shared/src/schemas.ts`.
- Still not implemented: Redis-backed room state, multi-file/folder
  transfer. Do not build these without being asked — see "No premature
  scope" above.
