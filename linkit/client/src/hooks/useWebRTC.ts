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
//  - AP/client isolation on the WiFi router (common on public/guest networks)

const STUN_ONLY: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// Shared, public demo credentials. These work for quick local testing but
// are rate-limited and shared across everyone who has ever copy-pasted
// this snippet — expect them to fail under real load. Kept ONLY as a
// last-resort fallback if you haven't set your own credentials yet.
const SHARED_DEMO_TURN: RTCIceServer[] = [
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turns:openrelay.metered.ca:443",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? window.location.origin;

/**
 * Fetches temporary TURN credentials through OUR OWN signaling server
 * (GET /api/turn-credentials) instead of calling Metered directly from
 * the browser.
 *
 * Why not call Metered from here like before: any VITE_-prefixed env var
 * gets baked into the built JS bundle, so a Metered *account* API key
 * held client-side would be readable by anyone in devtools — enough to
 * exhaust your quota or run up charges. The account key now lives only
 * as a server-side env var (METERED_API_KEY, no VITE_ prefix) and never
 * ships to the browser. This endpoint returns only the short-lived TURN
 * username/password the browser actually needs — those are meant to be
 * public-ish and expire, unlike the account key that mints them.
 *
 * Falls back to the shared demo TURN server if the server has no Metered
 * credentials configured, or the request fails for any reason.
 */
async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(`${SERVER_URL}/api/turn-credentials`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const iceServers = (await res.json()) as RTCIceServer[];

    if (iceServers.length === 0) {
      console.warn(
        "[WebRTC] Server has no TURN credentials configured — " +
        "using shared demo TURN credentials, which are frequently over quota. " +
        "See HOW_TO_FIX_TURN.md to set METERED_APP_NAME/METERED_API_KEY on the server."
      );
      return [...STUN_ONLY, ...SHARED_DEMO_TURN];
    }

    console.log(`[WebRTC] Fetched ${iceServers.length} ICE servers via signaling server`);
    return [...STUN_ONLY, ...iceServers];
  } catch (err) {
    console.error("[WebRTC] Failed to fetch TURN credentials from server, falling back to demo:", err);
    return [...STUN_ONLY, ...SHARED_DEMO_TURN];
  }
}

// DEBUG: set VITE_FORCE_RELAY=true in client/.env to force ALL traffic
// through TURN (iceTransportPolicy: "relay") - disables direct/STUN paths
// entirely. Use this to conclusively test "does TURN itself work" in
// isolation: if connection SUCCEEDS with this on, TURN is fine and your
// original failure was something else; if it FAILS with this on, the
// TURN server/credentials are the actual problem.
const FORCE_RELAY = import.meta.env.VITE_FORCE_RELAY === "true";

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
    // TS drops the null-narrowing on `socket` inside the nested closures below
    // (they run later, so TS can't prove it's still non-null). Capture the
    // narrowed value in a const so those closures type-check.
    const sock: Socket = socket;

    // Fetch ICE servers once when this hook mounts (room joined). By the
    // time makePC() is actually called (after peer-joined/offer arrives),
    // this will have resolved - if not, makePC falls back to STUN-only
    // rather than blocking the handshake.
    let iceServers: RTCIceServer[] = STUN_ONLY;
    getIceServers().then((servers) => { iceServers = servers; });

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

      const pc = new RTCPeerConnection({
        iceServers,
        // relay-only mode for isolating TURN failures - see FORCE_RELAY above
        ...(FORCE_RELAY ? { iceTransportPolicy: "relay" as RTCIceTransportPolicy } : {}),
      });
      pcRef.current = pc;

      if (FORCE_RELAY) {
        console.log("[WebRTC] FORCE_RELAY active — only TURN relay candidates allowed, direct/STUN disabled");
      }

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
          sock.emit("signal", {
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

        sock.emit("signal", {
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

          sock.emit("signal", {
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

    /**
     * peer-left → the OTHER peer disconnected cleanly (left the room /
     * closed the tab). Without this handler, our RTCPeerConnection has no
     * way to know that — it just sits waiting until ICE connectivity
     * checks time out on their own, which lands on connectionState
     * "failed" (triggering the misleading "STUN couldn't punch through
     * NAT" error card) before eventually settling on "closed". Closing
     * proactively here skips straight to "closed" with the correct
     * messaging, since this is an expected disconnect, not a NAT/TURN
     * failure.
     */
    function onPeerLeft() {
      console.log("[WebRTC] Peer left room — closing connection cleanly (not a failure)");
      closePC();
      setRtcState("closed");
    }

    socket.on("peer-joined", onPeerJoined);
    socket.on("peer-left",   onPeerLeft);
    socket.on("signal",      onSignal);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      socket.off("peer-joined", onPeerJoined);
      socket.off("peer-left",   onPeerLeft);
      socket.off("signal",      onSignal);
      closePC();
    };
  }, [socket, roomCode]);

  return { rtcState, dataChannel };
}
