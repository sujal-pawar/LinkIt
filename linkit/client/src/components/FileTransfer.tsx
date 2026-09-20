import { useState, useEffect, useRef } from "react";
import { FileControlSchema } from "shared";
import { toast } from "../hooks/useToast";

// ── Constants ────────────────────────────────────────────────────────────────
const CHUNK_SIZE  = 16 * 1024;       // 16 KB
const BUFFER_HIGH = CHUNK_SIZE * 16; // 256 KB — pause sending above this
const BUFFER_LOW  = CHUNK_SIZE * 4;  // 64 KB  — resume when drained below this

interface Props {
  dataChannel: RTCDataChannel | null;
  rtcState: string;
}

interface ReceiveState {
  name: string;
  total: number;
  received: number;
}

interface DownloadReady {
  url: string;
  name: string;
  size: number;
}

export function FileTransfer({ dataChannel, rtcState }: Props) {
  const [sending, setSending]         = useState(false);
  const [sendProgress, setSendProgress]= useState(0);
  const [sentAck, setSentAck]          = useState<string | null>(null); // file name shown for 2.5s
  const [receiving, setReceiving]      = useState<ReceiveState | null>(null);
  const [download, setDownload]        = useState<DownloadReady | null>(null);
  const [dcState, setDcState]          = useState<RTCDataChannelState>("connecting");
  const [error, setError]              = useState("");

  // KEY FIX: refs so async send loop always reads the latest values,
  // no stale-closure issues from useCallback.
  const dcStateRef    = useRef<RTCDataChannelState>("connecting");
  const dcRef         = useRef<RTCDataChannel | null>(null);
  const chunksRef     = useRef<ArrayBuffer[]>([]);
  const receivingRef  = useRef<ReceiveState | null>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  // Phase 8 — resumable transfer: remembers the File currently being sent
  // (or paused mid-send) so a resume-request from the receiver can seek
  // back into it without asking the user to re-pick the file.
  const currentFileRef = useRef<File | null>(null);

  // Keep refs in sync with props/state
  useEffect(() => { dcRef.current = dataChannel; }, [dataChannel]);
  useEffect(() => { receivingRef.current = receiving; }, [receiving]);

  // ── DataChannel lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    if (!dataChannel) {
      setDcState("connecting");
      dcStateRef.current = "connecting";
      return;
    }

    const updateState = (s: RTCDataChannelState) => {
      dcStateRef.current = s;
      setDcState(s);
    };

    const onOpen  = () => {
      console.log("[FileTransfer] DataChannel opened ✅");
      updateState("open");

      // Phase 8 — resumable transfer: if we were mid-receive when the
      // previous channel closed, we still have the buffered chunks (see
      // onClose below, which deliberately does NOT discard them). Tell
      // the sender exactly how many bytes we already have so it can seek
      // forward instead of restarting from byte 0.
      if (receivingRef.current && chunksRef.current.length > 0) {
        const receivedBytes = chunksRef.current.reduce((sum, b) => sum + b.byteLength, 0);
        console.log(`[FileTransfer] Requesting resume of "${receivingRef.current.name}" from byte ${receivedBytes}`);
        dataChannel.send(JSON.stringify({
          type: "resume-request",
          name: receivingRef.current.name,
          receivedBytes,
        }));
      }
    };
    const onClose = () => {
      // Phase 8 — resumable transfer: deliberately do NOT clear
      // receivingRef/chunksRef or currentFileRef here. A disconnect mid-
      // transfer is treated as "paused", not "failed" — the buffered
      // chunks (receiver side) and the in-flight File reference (sender
      // side) survive so onOpen (above) / resumeSend (below) can pick up
      // where they left off once the peer reconnects.
      if (receivingRef.current) {
        toast(`Paused: "${receivingRef.current.name}" — will resume automatically when peer reconnects.`, "warning");
        setError("Transfer paused — waiting for peer to reconnect.");
      }
      if (sending && currentFileRef.current) {
        toast(`Paused: "${currentFileRef.current.name}" — will resume automatically when peer reconnects.`, "warning");
      }
      console.log("[FileTransfer] DataChannel closed");
      updateState("closed");
      setSending(false);
    };
    const onError = (e: Event) => {
      console.error("[FileTransfer] DataChannel error", e);
      setError("DataChannel error — connection may be unstable.");
    };

    const onMessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        let raw: unknown;
        try { raw = JSON.parse(event.data as string); }
        catch { console.warn("[FileTransfer] Non-JSON control frame ignored"); return; }

        const parsed = FileControlSchema.safeParse(raw);
        if (!parsed.success) {
          console.warn("[FileTransfer] Invalid control message:", parsed.error.flatten());
          return;
        }

        const msg = parsed.data;
        if (msg.type === "meta") {
          chunksRef.current = [];
          setDownload(null);
          setError("");
          const s = { name: msg.name, total: msg.size, received: 0 };
          setReceiving(s);
          receivingRef.current = s;
          console.log(`[FileTransfer] Receiving "${msg.name}" (${msg.size} bytes)`);
        } else if (msg.type === "done") {
          const blob = new Blob(chunksRef.current);
          const url  = URL.createObjectURL(blob);
          console.log(`[FileTransfer] Done — ${blob.size} bytes received`);
          setDownload({ url, name: receivingRef.current?.name ?? "file", size: blob.size });
          setReceiving(null);
          receivingRef.current = null;
          chunksRef.current = [];
        } else if (msg.type === "resume-request") {
          // Phase 8 — we're the SENDER, receiver just told us how many
          // bytes it already has from before a disconnect.
          void resumeSend(msg.name, msg.receivedBytes);
        }
      } else {
        // Binary chunk
        const buf = event.data as ArrayBuffer;
        chunksRef.current.push(buf);
        setReceiving(prev =>
          prev ? { ...prev, received: prev.received + buf.byteLength } : null
        );
      }
    };

    // Sync initial readyState immediately — no async gap
    updateState(dataChannel.readyState);
    console.log(`[FileTransfer] DataChannel attached, readyState="${dataChannel.readyState}"`);

    dataChannel.bufferedAmountLowThreshold = BUFFER_LOW;
    dataChannel.addEventListener("open",    onOpen);
    dataChannel.addEventListener("close",   onClose);
    dataChannel.addEventListener("error",   onError);
    dataChannel.addEventListener("message", onMessage);

    return () => {
      dataChannel.removeEventListener("open",    onOpen);
      dataChannel.removeEventListener("close",   onClose);
      dataChannel.removeEventListener("error",   onError);
      dataChannel.removeEventListener("message", onMessage);
    };
  }, [dataChannel]);

  // ── Send ─────────────────────────────────────────────────────────────────
  // Plain async function (no useCallback) — uses refs so it always reads
  // the latest dcState and dataChannel without stale-closure issues.

  // Shared chunk-sending loop, used for both a fresh send (startOffset=0)
  // and a Phase 8 resume (startOffset = however many bytes the receiver
  // already has). Sends binary chunks with backpressure, then a final
  // "done" control frame — the receiver's protocol doesn't need to know
  // whether this was a fresh send or a resumed one.
  const sendChunksFrom = (
    dc: RTCDataChannel,
    buffer: ArrayBuffer,
    startOffset: number
  ): Promise<void> => {
    let offset = startOffset;
    return new Promise<void>((resolve, reject) => {
      const sendChunk = () => {
        try {
          while (offset < buffer.byteLength) {
            // Backpressure: pause when buffer fills, resume on drain event
            if (dc.bufferedAmount > BUFFER_HIGH) {
              dc.addEventListener("bufferedamountlow", sendChunk, { once: true });
              return;
            }
            const end   = Math.min(offset + CHUNK_SIZE, buffer.byteLength);
            const chunk = buffer.slice(offset, end);
            dc.send(chunk);
            offset = end;
            setSendProgress(Math.round((offset / buffer.byteLength) * 100));
          }
          dc.send(JSON.stringify({ type: "done" }));
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      sendChunk();
    });
  };

  const sendFile = async (file: File) => {
    const dc = dcRef.current;

    // Guard using the ref (always current, no closure staleness)
    if (!dc) {
      console.warn("[FileTransfer] No DataChannel");
      setError("No DataChannel — not connected yet.");
      return;
    }
    if (dcStateRef.current !== "open") {
      console.warn(`[FileTransfer] Channel not open (state="${dcStateRef.current}")`);
      setError(`Cannot send — DataChannel is "${dcStateRef.current}". Wait for it to open.`);
      return;
    }

    currentFileRef.current = file; // remembered in case we get disconnected mid-send
    setSending(true);
    setSendProgress(0);
    setError("");

    console.log(`[FileTransfer] Sending "${file.name}" (${file.size} bytes)`);

    dc.send(JSON.stringify({ type: "meta", name: file.name, size: file.size }));

    const buffer = await file.arrayBuffer();
    await sendChunksFrom(dc, buffer, 0);

    currentFileRef.current = null; // fully sent, nothing left to resume
    setSendProgress(100);
    setSending(false);
    setSentAck(file.name);   // show 2.5s acknowledgement
    console.log("[FileTransfer] Send complete ✅");
  };

  // Phase 8 — resumable transfer. Called when a "resume-request" control
  // message arrives from the receiver after we reconnect mid-transfer.
  // Re-reads the same File object (still held in currentFileRef — File
  // objects stay valid across a WebRTC reconnect, they're just in-memory
  // browser handles) and continues sending from the offset the receiver
  // reports, instead of restarting or re-sending a "meta" frame.
  const resumeSend = async (name: string, receivedBytes: number) => {
    const file = currentFileRef.current;
    const dc = dcRef.current;

    if (!file || !dc || file.name !== name) {
      console.warn(`[FileTransfer] Resume request for "${name}" but no matching in-flight file — ignoring`);
      return;
    }

    console.log(`[FileTransfer] Resuming "${name}" from byte ${receivedBytes}/${file.size}`);
    setSending(true);
    setError("");

    const buffer = await file.arrayBuffer();
    await sendChunksFrom(dc, buffer, receivedBytes);

    currentFileRef.current = null;
    setSendProgress(100);
    setSending(false);
    setSentAck(name);
  };

  // Auto-dismiss sent acknowledgement after 2.5s
  useEffect(() => {
    if (!sentAck) return;
    const t = setTimeout(() => setSentAck(null), 2500);
    return () => clearTimeout(t);
  }, [sentAck]);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so same file can be re-sent
    if (!file) return;

    sendFile(file).catch(err => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[FileTransfer] Send error:", msg);
      setError(`Send failed: ${msg}`);
      setSending(false);
    });
  };

  const isOpen          = dcState === "open";
  const receivePercent  = receiving
    ? Math.round((receiving.received / receiving.total) * 100)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full animate-fade-in"
         style={{ borderTop: "1px solid var(--color-border)", paddingTop: "1.5rem", marginTop: "1.5rem" }}>

      {/* Header + DataChannel state badge */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          File Transfer
        </h3>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: isOpen
                  ? "rgba(47,211,154,0.12)"
                  : dcState === "closed"
                  ? "rgba(244,33,46,0.12)"
                  : "rgba(160,139,255,0.14)",
                color: isOpen
                  ? "var(--color-success)"
                  : dcState === "closed"
                  ? "var(--color-error)"
                  : "var(--color-accent)",
                border: `1px solid ${isOpen
                  ? "rgba(47,211,154,0.3)"
                  : dcState === "closed"
                  ? "rgba(244,33,46,0.3)"
                  : "rgba(160,139,255,0.34)"}`,
              }}>
          {isOpen ? "DataChannel open" : `DataChannel: ${dcState}`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs mb-3 p-2 rounded-lg animate-fade-in"
           style={{ color: "var(--color-error)", background: "rgba(244,33,46,0.08)", border: "1px solid rgba(244,33,46,0.2)" }}>
          ⚠ {error}
        </p>
      )}

      {/* ── Send ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl p-4 mb-4"
           style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
        <p className="text-xs font-medium mb-3" style={{ color: "var(--color-text-secondary)" }}>
          SEND
        </p>

        {!sending ? (
          <>
            {/* ✅ Sent acknowledgement banner — auto-dismisses after 2.5s */}
            {sentAck && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-3 animate-fade-in"
                   style={{ background: "rgba(47,211,154,0.12)", border: "1px solid rgba(47,211,154,0.3)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span className="text-xs font-medium truncate" style={{ color: "var(--color-success)" }}>
                  Sent — <span className="font-mono">{sentAck}</span>
                </span>
                <span className="ml-auto text-xs" style={{ color: "rgba(47,211,154,0.6)" }}>✓</span>
              </div>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!isOpen}
              className="w-full rounded-xl py-3 text-sm font-medium transition-all flex items-center justify-center gap-2"
              style={{
                background: isOpen ? "var(--color-accent-solid)" : "var(--color-bg-surface)",
                color: isOpen ? "#fff" : "var(--color-text-tertiary)",
                border: isOpen ? "none" : "1px solid var(--color-border)",
                cursor: isOpen ? "pointer" : "not-allowed",
              }}
              onMouseEnter={e => { if (isOpen) e.currentTarget.style.background = "var(--color-accent-solid-hover)"; }}
              onMouseLeave={e => { if (isOpen) e.currentTarget.style.background = "var(--color-accent-solid)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {isOpen ? "Choose file to send" : `Waiting (${dcState})…`}
            </button>

            {!isOpen && rtcState === "connected" && (
              <p className="text-xs text-center mt-2" style={{ color: "var(--color-text-secondary)" }}>
                DataChannel negotiating… refresh if stuck.
              </p>
            )}
          </>
        ) : (
          <div>
            <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
              <span>Sending…</span>
              <span>{sendProgress}%</span>
            </div>
            <div className="rounded-full overflow-hidden h-2" style={{ background: "var(--color-bg-elevated)" }}>
              <div className="h-2 rounded-full transition-all duration-100"
                   style={{ width: `${sendProgress}%`, background: "var(--color-accent)" }} />
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleFileChange} />
      </div>

      {/* ── Receive ──────────────────────────────────────────────────────── */}
      {(receiving || download) && (
        <div className="rounded-xl p-4 animate-fade-in"
             style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
          <p className="text-xs font-medium mb-3" style={{ color: "var(--color-text-secondary)" }}>
            RECEIVE
          </p>

          {receiving && (
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-mono truncate max-w-[180px]" style={{ color: "var(--color-text-primary)" }}>
                  {receiving.name}
                </span>
                <span style={{ color: "var(--color-text-secondary)" }}>{receivePercent}%</span>
              </div>
              <div className="rounded-full overflow-hidden h-2 mb-1" style={{ background: "var(--color-bg-elevated)" }}>
                <div className="h-2 rounded-full transition-all duration-100"
                     style={{ width: `${receivePercent}%`, background: "var(--color-success)" }} />
              </div>
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {(receiving.received / 1024 / 1024).toFixed(2)} / {(receiving.total / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          )}

          {download && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                     style={{ background: "rgba(47,211,154,0.12)", border: "1px solid rgba(47,211,154,0.3)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                       stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                    {download.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {(download.size / 1024 / 1024).toFixed(2)} MB received
                  </p>
                </div>
              </div>
              <a href={download.url} download={download.name}
                 className="block w-full rounded-xl py-2.5 text-sm font-semibold text-center transition-colors"
                 style={{ background: "rgba(47,211,154,0.15)", color: "var(--color-success)", border: "1px solid rgba(47,211,154,0.3)" }}>
                ↓ Download {download.name}
              </a>
            </div>
          )}
        </div>
      )}

      {!receiving && !download && isOpen && (
        <p className="text-xs text-center mt-2" style={{ color: "var(--color-text-tertiary)" }}>
          Waiting for incoming file…
        </p>
      )}
    </div>
  );
}
