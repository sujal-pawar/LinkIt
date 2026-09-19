"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileControlSchema = exports.FileDoneSchema = exports.FileMetaSchema = exports.SignalMessageSchema = exports.SignalDataSchema = exports.SignalIceSchema = exports.SignalAnswerSchema = exports.SignalOfferSchema = exports.JoinRoomSchema = void 0;
const zod_1 = require("zod");
// ─── Room joining ────────────────────────────────────────────────────────────
exports.JoinRoomSchema = zod_1.z.object({ roomCode: zod_1.z.string().min(4) });
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
exports.FileControlSchema = zod_1.z.discriminatedUnion("type", [
    exports.FileMetaSchema,
    exports.FileDoneSchema,
]);
//# sourceMappingURL=schemas.js.map