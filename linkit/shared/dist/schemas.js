"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileControlSchema = exports.ResumeRequestSchema = exports.FileDoneSchema = exports.FileMetaSchema = exports.SignalMessageSchema = exports.SignalDataSchema = exports.SignalIceSchema = exports.SignalAnswerSchema = exports.SignalOfferSchema = exports.JoinRoomSchema = exports.RoomIntentSchema = void 0;
const zod_1 = require("zod");
// ─── Room joining ────────────────────────────────────────────────────────────
// `intent` is optional so older clients (which send only { roomCode }) still work.
//   "create" -> the room must NOT already have someone in it. Without this check,
//               choosing a custom ID that a stranger is already using would silently
//               drop you into THEIR room instead of telling you the ID is taken.
//   "join"   -> the room MUST already exist. Without this check, mistyping a code
//               would quietly create an empty room and leave you "waiting for peer"
//               forever, with no hint that the code was wrong.
// Max length keeps arbitrary-size strings out of the in-memory room registry.
exports.RoomIntentSchema = zod_1.z.enum(["create", "join"]);
exports.JoinRoomSchema = zod_1.z.object({
    roomCode: zod_1.z.string().min(4).max(32),
    intent: exports.RoomIntentSchema.optional(),
});
// ─── WebRTC signaling payloads ────────────────────────────────────────────────
exports.SignalOfferSchema = zod_1.z.object({
    type: zod_1.z.literal("offer"),
    sdp: zod_1.z.any(), // RTCSessionDescriptionInit – not worth over-typing
});
exports.SignalAnswerSchema = zod_1.z.object({
    type: zod_1.z.literal("answer"),
    sdp: zod_1.z.any(),
});
exports.SignalIceSchema = zod_1.z.object({
    type: zod_1.z.literal("ice-candidate"),
    candidate: zod_1.z.any(),
});
// Discriminated union: TS narrows on `type` automatically after validation
exports.SignalDataSchema = zod_1.z.discriminatedUnion("type", [
    exports.SignalOfferSchema,
    exports.SignalAnswerSchema,
    exports.SignalIceSchema,
]);
exports.SignalMessageSchema = zod_1.z.object({
    roomCode: zod_1.z.string(),
    data: exports.SignalDataSchema,
});
// ─── File-transfer control messages ──────────────────────────────────────────
// Sent over the DataChannel, not sockets — but validating them the same way
// keeps the protocol honest. Anything arriving from outside your function is
// untyped at runtime; Zod is cheap insurance.
exports.FileMetaSchema = zod_1.z.object({
    type: zod_1.z.literal("meta"),
    name: zod_1.z.string(),
    size: zod_1.z.number().positive(),
});
exports.FileDoneSchema = zod_1.z.object({ type: zod_1.z.literal("done") });
// Phase 8 — resumable transfer. Sent by the RECEIVER after reconnecting
// with partially-buffered chunks still in memory, telling the sender
// exactly how many bytes it already has so the sender can seek forward
// instead of restarting from byte 0.
exports.ResumeRequestSchema = zod_1.z.object({
    type: zod_1.z.literal("resume-request"),
    name: zod_1.z.string(),
    receivedBytes: zod_1.z.number().nonnegative(),
});
exports.FileControlSchema = zod_1.z.discriminatedUnion("type", [
    exports.FileMetaSchema,
    exports.FileDoneSchema,
    exports.ResumeRequestSchema,
]);
//# sourceMappingURL=schemas.js.map