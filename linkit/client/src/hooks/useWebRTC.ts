import { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { SignalDataSchema } from "shared";
import { toast } from "./useToast";

export type RTCState = "idle" | "connecting" | "connected" | "failed" | "closed";

export interface UseWebRTCReturn {
  rtcState: RTCState;
  dataChannel: RTCDataChannel | null;
}

// STUN resolves public IPs. TURN relays traffic when direct/STUN paths fail:
//  - Windows Firewall blocks inbound WebRTC ports from other devices
//  - Chrome mDNS hides LAN IPs as xxxxxx.local (unresolvable by remote peer)
//  - Symmetric NAT (hairpin issue) on same-network peers
// Multiple providers listed — ICE picks the first that works.
// Replace with paid credentials (Metered / Twilio / Coturn) for production.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // Option A: openrelay (free, ~100MB/month quota)
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turns:openrelay.metered.ca:443",       // TLS on 443 — passes almost any firewall
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  // Option B: freestun (free, no account needed)
  {
    urls: [
      "turn:freestun.net:3478",
      "turns:freestun.net:5349",
    ],
    username: "free",
    credential: "free",
  },
];

/**
 * useWebRTC — owns the RTCPeerConnection lifecycle for one room session.
 *
 * Initiator (host, was in room first):
 *   Receives `peer-joined` → creates DataChannel + offer.
 *
 * Responder (joiner, second to arrive):
 *   Receives `signal:offer` → creates answer, gets DC via ondatachannel.
 *
 * ICE candidates arriving before remote description is set are buffered
 * in pendingCandidates and flushed after setRemoteDescription.
 *
 * Cleanup: pc.close() on unmount/roomCode change — a React-specific concern
 * the vanilla version never had to handle.
 */
export function useWebRTC(
  socket: Socket | null,
  roomCode: string
): UseWebRTCReturn {
  const pcRef             = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const [rtcState, setRtcState]       = useState<RTCState>("idle");
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);

  useEffect(() => {
    if (!socket || !roomCode) return;

    // ── Helpers ───────────────────────────────────────────────────────────────

    function closePC() {
      pcRef.current?.close();
      pcRef.current = null;
      setDataChannel(null);
      setRtcState("idle");
      pendingCandidates.current = [];
    }

    function makePC(): RTCPeerConnection {
      closePC(); // tear down any stale connection first

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Mirror RTCPeerConnection state → React state + toast on failure
      pc.onconnectionstatechange = () => {
        switch (pc.connectionState) {
          case "new":
          case "connecting":
            setRtcState("connecting");
            break;
          case "connected":
            setRtcState("connected");
            break;
          case "failed":
            setRtcState("failed");
            toast(
              "P2P connection failed — STUN couldn't punch through the NAT. " +
              "On different networks? That's the live demo of why TURN exists.",
              "error"
            );
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
          // Log candidate type so you can confirm relay (TURN) candidates appear
          console.log(`[WebRTC] ICE candidate: ${candidate.type} ${candidate.protocol} ${candidate.address}`);
          socket.emit("signal", {
            roomCode,
            data: { type: "ice-candidate", candidate },
          });
        } else {
          console.log("[WebRTC] ICE gathering complete");
        }
      };

      // Shows checking → connected or failed — key diagnostic step
      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE connection state: ${pc.iceConnectionState}`);
      };

      // Shows error code + URL for each TURN server that fails
      // 401 = bad credentials, 600-699 = server error, timeout = unreachable
      pc.onicecandidateerror = (e: Event) => {
        const ev = e as RTCPeerConnectionIceErrorEvent;
        console.warn(`[WebRTC] ICE candidate error — url: ${ev.url}  code: ${ev.errorCode}  msg: ${ev.errorText}`);
      };

      return pc;
    }

    async function flushPendingCandidates(pc: RTCPeerConnection) {
      for (const c of pendingCandidates.current) {
        try { await pc.addIceCandidate(c); } catch { /* stale, ignore */ }
      }
      pendingCandidates.current = [];
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    /**
     * peer-joined → WE are the INITIATOR (host, arrived first).
     * Create RTCPeerConnection, DataChannel, and the offer.
     */
    async function onPeerJoined() {
      try {
        const pc = makePC();
        setRtcState("connecting");

        const dc = pc.createDataChannel("files", { ordered: true });
        setDataChannel(dc);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("signal", {
          roomCode,
          data: { type: "offer", sdp: pc.localDescription },
        });

        console.log("[WebRTC] Offer sent (initiator)");
      } catch (err) {
        toast(`WebRTC handshake error: ${err instanceof Error ? err.message : String(err)}`, "error");
        console.error("[WebRTC] onPeerJoined error:", err);
      }
    }

    /**
     * signal → Validate with Zod, then handle offer / answer / ice-candidate.
     * Zod rejects malformed payloads before they can corrupt RTCPeerConnection state.
     */
    async function onSignal(raw: { from: string; data: unknown }) {
      const parsed = SignalDataSchema.safeParse(raw.data);
      if (!parsed.success) {
        // Surface Zod failure as a toast — not just a console.warn
        const msg = parsed.error.issues.map(i => i.message).join("; ");
        toast(`Rejected invalid signal: ${msg}`, "warning");
        console.warn("[WebRTC] Invalid signal ignored:", parsed.error.flatten());
        return;
      }
      const data = parsed.data;

      try {
        if (data.type === "offer") {
          // WE are the RESPONDER
          const pc = makePC();
          setRtcState("connecting");

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
          if (!pcRef.current) return;
          await pcRef.current.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
          await flushPendingCandidates(pcRef.current);
          console.log("[WebRTC] Remote answer set");

        } else if (data.type === "ice-candidate") {
          const pc = pcRef.current;
          if (pc?.remoteDescription) {
            await pc.addIceCandidate(data.candidate as RTCIceCandidateInit).catch(() => {});
          } else {
            pendingCandidates.current.push(data.candidate as RTCIceCandidateInit);
          }
        }
      } catch (err) {
        toast(`Signal handling error: ${err instanceof Error ? err.message : String(err)}`, "error");
        console.error("[WebRTC] onSignal error:", err);
      }
    }

    socket.on("peer-joined", onPeerJoined);
    socket.on("signal",      onSignal);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      socket.off("peer-joined", onPeerJoined);
      socket.off("signal",      onSignal);
      closePC();
    };
  }, [socket, roomCode]);

  return { rtcState, dataChannel };
}
