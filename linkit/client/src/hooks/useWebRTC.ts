import { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { SignalDataSchema } from "shared";

export type RTCState = "idle" | "connecting" | "connected" | "failed" | "closed";

export interface UseWebRTCReturn {
  rtcState: RTCState;
  dataChannel: RTCDataChannel | null;
}

// STUN-only for v1. If STUN fails on different networks,
// that's your live demo of *why* TURN exists (Phase 8 stretch goal).
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * useWebRTC — owns the RTCPeerConnection lifecycle for one room session.
 *
 * Initiator logic:
 *   The peer who was already in the room (host) receives `peer-joined` first.
 *   → Host creates the DataChannel + offer.
 *   The joining peer (responder) receives the `signal:offer`.
 *   → Responder creates the answer; gets the DataChannel via ondatachannel.
 *
 * ICE candidates that arrive before remote description is set are
 * buffered in `pendingCandidates` and flushed immediately after setRemoteDescription.
 *
 * Cleanup: pc.close() is called on unmount OR when roomCode changes,
 * preventing resource leaks (a React-specific concern the vanilla version
 * didn't have to worry about).
 */
export function useWebRTC(
  socket: Socket | null,
  roomCode: string
): UseWebRTCReturn {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [rtcState, setRtcState] = useState<RTCState>("idle");
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  // ICE candidates that arrive before remote description is ready
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    // Don't run until we have both a socket and a room
    if (!socket || !roomCode) return;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function closePC() {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      setDataChannel(null);
      setRtcState("idle");
      pendingCandidates.current = [];
    }

    function makePC(): RTCPeerConnection {
      closePC(); // ensure no stale connection

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Mirror RTCPeerConnection state → React state
      pc.onconnectionstatechange = () => {
        switch (pc.connectionState) {
          case "connecting":
          case "new":
            setRtcState("connecting");
            break;
          case "connected":
            setRtcState("connected");
            break;
          case "failed":
            setRtcState("failed");
            break;
          case "closed":
          case "disconnected":
            setRtcState("closed");
            break;
        }
      };

      // Trickle ICE: emit each candidate as it arrives
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket.emit("signal", {
            roomCode,
            data: { type: "ice-candidate", candidate },
          });
        }
      };

      return pc;
    }

    async function flushPendingCandidates(pc: RTCPeerConnection) {
      for (const c of pendingCandidates.current) {
        try {
          await pc.addIceCandidate(c);
        } catch {
          /* ignore stale candidates */
        }
      }
      pendingCandidates.current = [];
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    /**
     * peer-joined → WE are the INITIATOR (host, arrived first in room).
     * Create RTCPeerConnection, DataChannel, offer.
     */
    async function onPeerJoined() {
      const pc = makePC();
      setRtcState("connecting");

      // Initiator creates the DataChannel
      const dc = pc.createDataChannel("files", { ordered: true });
      setDataChannel(dc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("signal", {
        roomCode,
        data: { type: "offer", sdp: pc.localDescription },
      });

      console.log("[WebRTC] Offer sent (initiator)");
    }

    /**
     * signal → Validate with Zod, then handle offer / answer / ice-candidate.
     * Never trust an unvalidated payload into RTCPeerConnection — a malformed
     * SDP would throw and could corrupt the connection state.
     */
    async function onSignal(raw: { from: string; data: unknown }) {
      const parsed = SignalDataSchema.safeParse(raw.data);
      if (!parsed.success) {
        console.warn("[WebRTC] Invalid signal — ignoring:", parsed.error.flatten());
        return;
      }
      const data = parsed.data;

      if (data.type === "offer") {
        // WE are the RESPONDER (joined second)
        const pc = makePC();
        setRtcState("connecting");

        // Responder receives DataChannel via ondatachannel
        pc.ondatachannel = ({ channel }) => {
          setDataChannel(channel);
          console.log("[WebRTC] DataChannel received (responder)");
        };

        await pc.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
        await flushPendingCandidates(pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("signal", {
          roomCode,
          data: { type: "answer", sdp: pc.localDescription },
        });

        console.log("[WebRTC] Answer sent (responder)");
      } else if (data.type === "answer") {
        // We're the initiator receiving the answer
        if (!pcRef.current) return;
        await pcRef.current.setRemoteDescription(
          data.sdp as RTCSessionDescriptionInit
        );
        await flushPendingCandidates(pcRef.current);
        console.log("[WebRTC] Remote answer set");
      } else if (data.type === "ice-candidate") {
        const pc = pcRef.current;
        if (pc?.remoteDescription) {
          try {
            await pc.addIceCandidate(data.candidate as RTCIceCandidateInit);
          } catch {
            /* stale candidate, ignore */
          }
        } else {
          // Buffer until we have a remote description
          pendingCandidates.current.push(data.candidate as RTCIceCandidateInit);
        }
      }
    }

    socket.on("peer-joined", onPeerJoined);
    socket.on("signal", onSignal);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      socket.off("peer-joined", onPeerJoined);
      socket.off("signal", onSignal);
      closePC();
    };
  }, [socket, roomCode]); // re-run if room changes

  return { rtcState, dataChannel };
}
