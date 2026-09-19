import { z } from "zod";

// ─── Room joining ────────────────────────────────────────────────────────────

export const JoinRoomSchema = z.object({ roomCode: z.string().min(4) });

// ─── WebRTC signaling payloads ────────────────────────────────────────────────

export const SignalOfferSchema = z.object({
  type: z.literal("offer"),
  sdp: z.any(), // RTCSessionDescriptionInit – not worth over-typing
});

export const SignalAnswerSchema = z.object({
  type: z.literal("answer"),
  sdp: z.any(),
});

export const SignalIceSchema = z.object({
  type: z.literal("ice-candidate"),
  candidate: z.any(),
});

// Discriminated union: TS narrows on `type` automatically after validation
export const SignalDataSchema = z.discriminatedUnion("type", [
  SignalOfferSchema,
  SignalAnswerSchema,
  SignalIceSchema,
]);

export const SignalMessageSchema = z.object({
  roomCode: z.string(),
  data: SignalDataSchema,
});

// ─── File-transfer control messages ──────────────────────────────────────────
// Sent over the DataChannel, not sockets — but validating them the same way
// keeps the protocol honest. Anything arriving from outside your function is
// untyped at runtime; Zod is cheap insurance.

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

// ─── Inferred TypeScript types ────────────────────────────────────────────────

export type JoinRoom = z.infer<typeof JoinRoomSchema>;
export type SignalOffer = z.infer<typeof SignalOfferSchema>;
export type SignalAnswer = z.infer<typeof SignalAnswerSchema>;
export type SignalIce = z.infer<typeof SignalIceSchema>;
export type SignalData = z.infer<typeof SignalDataSchema>;
export type SignalMessage = z.infer<typeof SignalMessageSchema>;
export type FileMeta = z.infer<typeof FileMetaSchema>;
export type FileControlMessage = z.infer<typeof FileControlSchema>;
