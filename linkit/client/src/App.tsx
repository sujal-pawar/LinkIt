import { useState, useEffect } from "react";
import { useSocket } from "./hooks/useSocket";
import { JoinRoom } from "./components/JoinRoom";

type AppState = "join" | "waiting" | "connected";

export default function App() {
  const { socket, connectionState } = useSocket();
  const [appState, setAppState] = useState<AppState>("join");
  const [roomCode, setRoomCode] = useState("");
  const [peerId, setPeerId] = useState("");

  useEffect(() => {
    if (!socket) return;

    const onPeerJoined = (data: { peerId: string }) => {
      setPeerId(data.peerId);
      setAppState("connected");
    };
    const onPeerLeft = () => {
      setPeerId("");
      setAppState("waiting");
    };

    socket.on("peer-joined", onPeerJoined);
    socket.on("peer-left", onPeerLeft);

    return () => {
      socket.off("peer-joined", onPeerJoined);
      socket.off("peer-left", onPeerLeft);
    };
  }, [socket]);

  const handleJoined = (code: string) => {
    setRoomCode(code);
    setAppState("waiting");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
         style={{ background: "var(--color-bg-base)" }}>

      {appState === "join" && (
        <JoinRoom
          socket={socket}
          connectionState={connectionState}
          onJoined={handleJoined}
        />
      )}

      {appState === "waiting" && (
        <div className="animate-fade-in text-center w-full max-w-sm mx-auto">
          <div className="rounded-2xl p-8" style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}>
            {/* Animated waiting indicator */}
            <div className="flex justify-center mb-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center animate-pulse-ring"
                   style={{ background: "var(--color-accent-muted)", border: "2px solid var(--color-accent)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

            {/* Room code display */}
            <div className="rounded-xl px-6 py-4 mb-6 select-all cursor-pointer"
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

            <button
              onClick={() => { setAppState("join"); setRoomCode(""); }}
              className="text-sm transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--color-text-primary)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-secondary)")}
            >
              ← Leave room
            </button>
          </div>
        </div>
      )}

      {appState === "connected" && (
        <div className="animate-fade-in text-center w-full max-w-sm mx-auto">
          <div className="rounded-2xl p-8" style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}>
            {/* Connected indicator */}
            <div className="flex justify-center mb-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center"
                   style={{ background: "rgba(0,186,124,0.12)", border: "2px solid var(--color-success)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
            </div>

            <h2 className="text-lg font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>
              Peer connected!
            </h2>
            <p className="text-sm mb-2" style={{ color: "var(--color-text-secondary)" }}>
              Room: <span className="font-mono font-semibold" style={{ color: "var(--color-accent)" }}>{roomCode}</span>
            </p>
            <p className="text-xs mb-6" style={{ color: "var(--color-text-tertiary)" }}>
              Peer ID: <span className="font-mono">{peerId.slice(0, 12)}…</span>
            </p>

            {/* Placeholder for Phase 5 FileTransfer */}
            <div className="rounded-xl p-4 mb-6"
                 style={{ background: "var(--color-bg-surface)", border: "1px dashed var(--color-border)" }}>
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                🚧 File transfer UI coming in Phase 5
              </p>
            </div>

            <button
              onClick={() => { setAppState("join"); setRoomCode(""); setPeerId(""); }}
              className="text-sm transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--color-text-primary)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-secondary)")}
            >
              ← Leave room
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="mt-8 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
        LinkIt — end-to-end encrypted via WebRTC DataChannel
      </p>
    </div>
  );
}
