import { z } from "zod";
export declare const JoinRoomSchema: z.ZodObject<{
    roomCode: z.ZodString;
}, "strip", z.ZodTypeAny, {
    roomCode: string;
}, {
    roomCode: string;
}>;
export declare const SignalOfferSchema: z.ZodObject<{
    type: z.ZodLiteral<"offer">;
    sdp: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    type: "offer";
    sdp?: any;
}, {
    type: "offer";
    sdp?: any;
}>;
export declare const SignalAnswerSchema: z.ZodObject<{
    type: z.ZodLiteral<"answer">;
    sdp: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    type: "answer";
    sdp?: any;
}, {
    type: "answer";
    sdp?: any;
}>;
export declare const SignalIceSchema: z.ZodObject<{
    type: z.ZodLiteral<"ice-candidate">;
    candidate: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    type: "ice-candidate";
    candidate?: any;
}, {
    type: "ice-candidate";
    candidate?: any;
}>;
export declare const SignalDataSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"offer">;
    sdp: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    type: "offer";
    sdp?: any;
}, {
    type: "offer";
    sdp?: any;
}>, z.ZodObject<{
    type: z.ZodLiteral<"answer">;
    sdp: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    type: "answer";
    sdp?: any;
}, {
    type: "answer";
    sdp?: any;
}>, z.ZodObject<{
    type: z.ZodLiteral<"ice-candidate">;
    candidate: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    type: "ice-candidate";
    candidate?: any;
}, {
    type: "ice-candidate";
    candidate?: any;
}>]>;
export declare const SignalMessageSchema: z.ZodObject<{
    roomCode: z.ZodString;
    data: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"offer">;
        sdp: z.ZodAny;
    }, "strip", z.ZodTypeAny, {
        type: "offer";
        sdp?: any;
    }, {
        type: "offer";
        sdp?: any;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"answer">;
        sdp: z.ZodAny;
    }, "strip", z.ZodTypeAny, {
        type: "answer";
        sdp?: any;
    }, {
        type: "answer";
        sdp?: any;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"ice-candidate">;
        candidate: z.ZodAny;
    }, "strip", z.ZodTypeAny, {
        type: "ice-candidate";
        candidate?: any;
    }, {
        type: "ice-candidate";
        candidate?: any;
    }>]>;
}, "strip", z.ZodTypeAny, {
    roomCode: string;
    data: {
        type: "offer";
        sdp?: any;
    } | {
        type: "answer";
        sdp?: any;
    } | {
        type: "ice-candidate";
        candidate?: any;
    };
}, {
    roomCode: string;
    data: {
        type: "offer";
        sdp?: any;
    } | {
        type: "answer";
        sdp?: any;
    } | {
        type: "ice-candidate";
        candidate?: any;
    };
}>;
export declare const FileMetaSchema: z.ZodObject<{
    type: z.ZodLiteral<"meta">;
    name: z.ZodString;
    size: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "meta";
    name: string;
    size: number;
}, {
    type: "meta";
    name: string;
    size: number;
}>;
export declare const FileDoneSchema: z.ZodObject<{
    type: z.ZodLiteral<"done">;
}, "strip", z.ZodTypeAny, {
    type: "done";
}, {
    type: "done";
}>;
export declare const FileControlSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"meta">;
    name: z.ZodString;
    size: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "meta";
    name: string;
    size: number;
}, {
    type: "meta";
    name: string;
    size: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"done">;
}, "strip", z.ZodTypeAny, {
    type: "done";
}, {
    type: "done";
}>]>;
export type JoinRoom = z.infer<typeof JoinRoomSchema>;
export type SignalOffer = z.infer<typeof SignalOfferSchema>;
export type SignalAnswer = z.infer<typeof SignalAnswerSchema>;
export type SignalIce = z.infer<typeof SignalIceSchema>;
export type SignalData = z.infer<typeof SignalDataSchema>;
export type SignalMessage = z.infer<typeof SignalMessageSchema>;
export type FileMeta = z.infer<typeof FileMetaSchema>;
export type FileControlMessage = z.infer<typeof FileControlSchema>;
//# sourceMappingURL=schemas.d.ts.map