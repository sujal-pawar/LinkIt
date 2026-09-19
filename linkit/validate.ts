/**
 * Phase 1 verification script
 * Run from: d:\Projects\P2P Share\linkit\
 * Command:   npx tsx validate.ts
 */
import { 
  JoinRoomSchema,
  SignalMessageSchema,
  FileControlSchema,
  FileMetaSchema,
  FileDoneSchema
} from "./shared/src/schemas.js";

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${label}`);
    passed++;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ❌ ${label}: ${msg}`);
    failed++;
  }
}

function shouldPass(label: string, schema: { safeParse: (v: unknown) => { success: boolean; error?: { message: string } } }, value: unknown) {
  test(`PASS  │ ${label}`, () => {
    const result = schema.safeParse(value);
    if (!result.success) throw new Error(result.error!.message);
  });
}

function shouldFail(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) {
  test(`REJECT│ ${label}`, () => {
    const result = schema.safeParse(value);
    if (result.success) throw new Error(`Expected rejection but schema accepted: ${JSON.stringify(value)}`);
  });
}

console.log("\n── JoinRoomSchema ───────────────────────────────────────");
shouldPass("valid 4-char code",    JoinRoomSchema, { roomCode: "ABCD" });
shouldPass("valid 6-char code",    JoinRoomSchema, { roomCode: "XYZABC" });
shouldFail("code too short (3)",   JoinRoomSchema, { roomCode: "ABC" });
shouldFail("missing roomCode",     JoinRoomSchema, {});
shouldFail("non-string roomCode",  JoinRoomSchema, { roomCode: 1234 });

console.log("\n── SignalMessageSchema ───────────────────────────────────");
shouldPass("valid offer signal", SignalMessageSchema, {
  roomCode: "ROOM",
  data: { type: "offer", sdp: { type: "offer", sdp: "v=0..." } }
});
shouldPass("valid answer signal", SignalMessageSchema, {
  roomCode: "ROOM",
  data: { type: "answer", sdp: { type: "answer", sdp: "v=0..." } }
});
shouldPass("valid ice-candidate signal", SignalMessageSchema, {
  roomCode: "ROOM",
  data: { type: "ice-candidate", candidate: { candidate: "..." } }
});
shouldFail("unknown signal type", SignalMessageSchema, {
  roomCode: "ROOM",
  data: { type: "unknown", sdp: {} }
});
shouldFail("missing roomCode in signal", SignalMessageSchema, {
  data: { type: "offer", sdp: {} }
});

console.log("\n── FileControlSchema ────────────────────────────────────");
shouldPass("valid meta message", FileMetaSchema, {
  type: "meta", name: "photo.jpg", size: 1024000
});
shouldPass("valid done message", FileDoneSchema, { type: "done" });
shouldPass("meta via FileControlSchema", FileControlSchema, {
  type: "meta", name: "video.mp4", size: 50000000
});
shouldFail("meta with negative size", FileMetaSchema, {
  type: "meta", name: "x.txt", size: -1
});
shouldFail("meta with zero size", FileMetaSchema, {
  type: "meta", name: "x.txt", size: 0
});
shouldFail("unknown control type", FileControlSchema, { type: "pause" });

console.log(`\n────────────────────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("🎉 All Phase 1 schema validations passed!");
