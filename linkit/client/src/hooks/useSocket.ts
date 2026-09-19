import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export interface UseSocketReturn {
  socket: Socket | null;
  connectionState: ConnectionState;
}

const SOCKET_URL =
  import.meta.env.VITE_SERVER_URL ?? window.location.origin;

/**
 * useSocket — wraps socket.io-client with stable identity across renders.
 *
 * Key decisions:
 * - A ref holds the Socket instance so re-renders don't trigger reconnects.
 * - The socket is created once in useEffect and torn down on unmount.
 * - We expose `connectionState` as React state so components can render
 *   loading/error/connected UI without needing to poll socket.connected.
 */
export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => setConnectionState("connected"));
    socket.on("disconnect", () => setConnectionState("disconnected"));
    socket.on("connect_error", () => setConnectionState("error"));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // empty deps — socket created once per mount

  return { socket: socketRef.current, connectionState };
}
