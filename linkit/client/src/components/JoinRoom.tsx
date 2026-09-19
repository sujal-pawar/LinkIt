import { useState, useEffect, useRef } from "react";
import { Socket } from "socket.io-client";
import { JoinRoomSchema } from "shared";

interface Props {
  socket: Socket | null;
  connectionState: string;
  onJoined: (roomCode: string) => void;
}

export function JoinRoom({ socket, connectionState, onJoined }: Props) {
  const [roomCode, setRoomCode] = useState("");
  const [status, setStatus] = useState<"idle" | "joining" | "joined" | "error" | "full">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate a random 6-char code helper
  const generateCode = () => {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    setRoomCode(code);
    setStatus("idle");
    setErrorMsg("");
  };

  useEffect(() => {
    if (!socket) return;

    const onRoomJoined = (data: { roomCode: string }) => {
      setStatus("joined");
      onJoined(data.roomCode);
    };
    const onRoomFull = () => {
      setStatus("full");
      setErrorMsg("Room is full — max 2 peers per room.");
    };
    const onServerError = (data: { message: string }) => {
      setStatus("error");
      setErrorMsg(data.message);
    };

    socket.on("room-joined", onRoomJoined);
    socket.on("room-full", onRoomFull);
    socket.on("error", onServerError);

    return () => {
      socket.off("room-joined", onRoomJoined);
      socket.off("room-full", onRoomFull);
      socket.off("error", onServerError);
    };
  }, [socket, onJoined]);

  const handleJoin = () => {
    // Client-side Zod validation before emitting — same schema as server
    const parsed = JoinRoomSchema.safeParse({ roomCode: roomCode.trim() });
    if (!parsed.success) {
      setStatus("error");
      setErrorMsg("Room code must be at least 4 characters.");
      return;
    }
    if (!socket?.connected) {
      setStatus("error");
      setErrorMsg("Not connected to server. Please wait…");
      return;
    }
    setStatus("joining");
    setErrorMsg("");
    socket.emit("join-room", { roomCode: roomCode.trim().toUpperCase() });
  };

  const isConnected = connectionState === "connected";
  const isJoining = status === "joining";
  const isDisabled = !isConnected || isJoining || roomCode.trim().length < 4;

  return (
    <div className="animate-fade-in w-full max-w-sm mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
             style={{ background: "var(--color-accent-muted)", border: "1px solid var(--color-accent)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          LinkIt
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Peer-to-peer file sharing — no servers, no storage.
        </p>
      </div>

      {/* Connection status pill */}
      <div className="flex justify-center mb-6">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full"
              style={{
                background: isConnected ? "rgba(0,186,124,0.12)" : "rgba(244,33,46,0.12)",
                color: isConnected ? "var(--color-success)" : "var(--color-error)",
                border: `1px solid ${isConnected ? "rgba(0,186,124,0.3)" : "rgba(244,33,46,0.3)"}`,
              }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: isConnected ? "var(--color-success)" : "var(--color-error)" }} />
          {connectionState === "connecting" ? "Connecting…"
            : connectionState === "connected" ? "Connected to relay"
            : connectionState === "error" ? "Connection error"
            : "Disconnected"}
        </span>
      </div>

      {/* Card */}
      <div className="rounded-2xl p-6"
           style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}>

        <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text-secondary)" }}>
          Room code
        </label>

        <div className="flex gap-2 mb-4">
          <input
            ref={inputRef}
            type="text"
            value={roomCode}
            onChange={e => {
              setRoomCode(e.target.value.toUpperCase());
              setStatus("idle");
              setErrorMsg("");
            }}
            onKeyDown={e => e.key === "Enter" && !isDisabled && handleJoin()}
            placeholder="e.g. XYZABC"
            maxLength={12}
            disabled={isJoining}
            className="flex-1 rounded-xl px-4 py-3 text-sm font-mono tracking-widest transition-all"
            style={{
              background: "var(--color-bg-surface)",
              border: `1px solid ${status === "error" || status === "full"
                ? "var(--color-error)"
                : "var(--color-border)"}`,
              color: "var(--color-text-primary)",
              outline: "none",
            }}
            onFocus={e => {
              if (status !== "error" && status !== "full")
                e.target.style.borderColor = "var(--color-accent)";
            }}
            onBlur={e => {
              if (status !== "error" && status !== "full")
                e.target.style.borderColor = "var(--color-border)";
            }}
          />
          {/* Generate random code button */}
          <button
            onClick={generateCode}
            title="Generate random code"
            className="rounded-xl px-3 transition-colors"
            style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--color-text-primary)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-secondary)")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
          </button>
        </div>

        {/* Error / status messages */}
        {(status === "error" || status === "full") && errorMsg && (
          <p className="text-xs mb-4 flex items-center gap-1.5 animate-fade-in"
             style={{ color: "var(--color-error)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15" stroke="white" strokeWidth="2"/>
              <line x1="9" y1="9" x2="15" y2="15" stroke="white" strokeWidth="2"/>
            </svg>
            {errorMsg}
          </p>
        )}

        {/* Join button */}
        <button
          onClick={handleJoin}
          disabled={isDisabled}
          className="w-full rounded-xl py-3 text-sm font-bold tracking-wide transition-all"
          style={{
            background: isDisabled ? "var(--color-bg-surface)" : "var(--color-accent)",
            color: isDisabled ? "var(--color-text-tertiary)" : "#ffffff",
            border: isDisabled ? "1px solid var(--color-border)" : "none",
            cursor: isDisabled ? "not-allowed" : "pointer",
          }}
          onMouseEnter={e => {
            if (!isDisabled) e.currentTarget.style.background = "var(--color-accent-hover)";
          }}
          onMouseLeave={e => {
            if (!isDisabled) e.currentTarget.style.background = "var(--color-accent)";
          }}
        >
          {isJoining ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Joining…
            </span>
          ) : "Join Room"}
        </button>

        <p className="text-xs text-center mt-4" style={{ color: "var(--color-text-secondary)" }}>
          Share the room code with one other person to connect.
        </p>
      </div>
    </div>
  );
}
