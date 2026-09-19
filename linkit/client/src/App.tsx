import { useState, useEffect } from "react";
import { useSocket } from "./hooks/useSocket";
import { useWebRTC } from "./hooks/useWebRTC";
import { JoinRoom } from "./components/JoinRoom";
import { FileTransfer } from "./components/FileTransfer";

// Socket-level state (room membership)
type RoomState = "join" | "waiting" | "in-room";

export default function App() {
  const { socket, connectionState } = useSocket();
  const [roomState, setRoomState] = useState<RoomState>("join");
  const [roomCode, setRoomCode] = useState("");
  const [peerId, setPeerId] = useState("");

  // useWebRTC runs whenever we're in a room — idle when roomCode is ""
  const { rtcState, dataChannel } = useWebRTC(socket, roomCode);

  // ── Socket-level events ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onPeerJoined = (data: { peerId: string }) => {
      // We are the HOST (existing member) — a new peer just joined
      setPeerId(data.peerId);
      setRoomState("in-room");
    };
    const onPeerPresent = (data: { peerId: string }) => {
      // We are the JOINER (new member) — server tells us who is already there
      // useWebRTC handles the responder handshake; we just advance the UI
      setPeerId(data.peerId);
      setRoomState("in-room");
    };
    const onPeerLeft = () => {
      setPeerId("");
      setRoomState("waiting");
    };

    socket.on("peer-joined",  onPeerJoined);
    socket.on("peer-present", onPeerPresent);
    socket.on("peer-left",    onPeerLeft);

    return () => {
      socket.off("peer-joined",  onPeerJoined);
      socket.off("peer-present", onPeerPresent);
      socket.off("peer-left",    onPeerLeft);
    };
  }, [socket]);

  const handleJoined = (code: string) => {
    setRoomCode(code);
    setRoomState("waiting");
  };

  const leaveRoom = () => {
    setRoomState("join");
    setRoomCode("");
    setPeerId("");
  };

  // ── Shared header icon ──────────────────────────────────────────────────
  const LinkIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
         stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
         style={{ background: "var(--color-bg-base)" }}>

      {/* ── JOIN ── */}
      {roomState === "join" && (
        <JoinRoom
          socket={socket}
          connectionState={connectionState}
          onJoined={handleJoined}
        />
      )}

      {/* ── WAITING FOR PEER ── */}
      {roomState === "waiting" && (
        <div className="animate-fade-in w-full max-w-sm mx-auto">
          <div className="rounded-2xl p-8 text-center"
               style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}>
            <div className="flex justify-center mb-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center animate-pulse-ring"
                   style={{ background: "var(--color-accent-muted)", border: "2px solid var(--color-accent)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                     stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
            </div>

            <h2 className="text-lg font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>
              Waiting for peer…
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
              Share this code with the other person:
            </p>

            <div className="rounded-xl px-6 py-4 mb-6 cursor-pointer select-all"
                 style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}
                 onClick={() => navigator.clipboard.writeText(roomCode)}>
              <p className="text-2xl font-mono font-bold tracking-[0.3em] text-center"
                 style={{ color: "var(--color-accent)" }}>
                {roomCode}
              </p>
              <p className="text-xs text-center mt-1" style={{ color: "var(--color-text-secondary)" }}>
                Click to copy
              </p>
            </div>

            <button onClick={leaveRoom} className="text-sm transition-colors"
                    style={{ color: "var(--color-text-secondary)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--color-text-primary)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-secondary)")}>
              ← Leave room
            </button>
          </div>
        </div>
      )}

      {/* ── IN ROOM (WebRTC connecting → connected) ── */}
      {roomState === "in-room" && (
        <div className="animate-fade-in w-full max-w-sm mx-auto">
          <div className="rounded-2xl p-6"
               style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}>

            {/* Header row */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                   style={{
                     background: rtcState === "connected" ? "rgba(0,186,124,0.12)" : "var(--color-accent-muted)",
                     border: `2px solid ${rtcState === "connected" ? "var(--color-success)" : "var(--color-accent)"}`,
                   }}>
                {rtcState === "connected" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                       stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <span className="w-4 h-4 rounded-full border-2 animate-spin"
                        style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                  {rtcState === "connected" ? "P2P Connected" :
                   rtcState === "failed"    ? "Connection Failed" :
                   rtcState === "closed"    ? "Connection Closed" :
                   "Establishing P2P…"}
                </p>
                <p className="text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
                  Room:&nbsp;
                  <span className="font-mono font-semibold" style={{ color: "var(--color-accent)" }}>
                    {roomCode}
                  </span>
                  &nbsp;·&nbsp;
                  <span className="font-mono">{peerId.slice(0, 8)}…</span>
                </p>
              </div>
            </div>

            {/* WebRTC state pill */}
            <div className="flex items-center gap-2 mb-5 p-3 rounded-xl"
                 style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
              <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>WebRTC:</span>
              <span className="text-xs font-mono font-semibold"
                    style={{
                      color: rtcState === "connected" ? "var(--color-success)"
                           : rtcState === "failed"    ? "var(--color-error)"
                           : "var(--color-accent)",
                    }}>
                {rtcState}
              </span>
              {rtcState === "failed" && (
                <span className="text-xs ml-auto" style={{ color: "var(--color-text-secondary)" }}>
                  (STUN may not traverse this NAT — TURN needed)
                </span>
              )}
            </div>

            {/* FileTransfer — only mounted when channel exists */}
            {(rtcState === "connected" || rtcState === "connecting") && dataChannel && (
              <FileTransfer dataChannel={dataChannel} rtcState={rtcState} />
            )}

            {rtcState === "connecting" && !dataChannel && (
              <p className="text-xs text-center py-2" style={{ color: "var(--color-text-secondary)" }}>
                Negotiating WebRTC handshake…
              </p>
            )}

            <div style={{ borderTop: "1px solid var(--color-border)", marginTop: "1.25rem", paddingTop: "1rem" }}>
              <button onClick={leaveRoom} className="text-sm transition-colors"
                      style={{ color: "var(--color-text-secondary)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--color-text-primary)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-secondary)")}>
                ← Leave room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="mt-8 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
        LinkIt — end-to-end via WebRTC DataChannel · {" "}
        <span className="font-mono">
          {rtcState !== "idle" ? `rtc:${rtcState}` : "socket:" + connectionState}
        </span>
      </p>
    </div>
  );
}
