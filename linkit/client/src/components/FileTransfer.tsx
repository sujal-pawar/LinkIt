import { useState, useEffect, useRef, useCallback } from "react";
import { FileControlSchema } from "shared";

// ── Constants ────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 16 * 1024; // 16 KB — matches browser DataChannel sweet spot
// Pause sending when buffered data exceeds this; resume when it drains below.
const BUFFER_HIGH = CHUNK_SIZE * 16; // 256 KB
const BUFFER_LOW  = CHUNK_SIZE * 4;  // 64 KB  (bufferedAmountLowThreshold)

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

/**
 * FileTransfer — send/receive files over an RTCDataChannel.
 *
 * Send side:
 *   1. Emit JSON `meta` control frame (name + size)
 *   2. Slice the file into CHUNK_SIZE ArrayBuffers, send each
 *   3. Check bufferedAmount before every send — if > BUFFER_HIGH, pause and
 *      wait for the `bufferedamountlow` event before continuing (backpressure)
 *   4. Emit JSON `done` control frame
 *
 * Receive side:
 *   1. Validate incoming string messages with FileControlSchema (Zod)
 *   2. On `meta`: reset chunk accumulator, record expected total
 *   3. On binary: push to chunk array, update progress
 *   4. On `done`: reassemble Blob, create object URL for download
 */
export function FileTransfer({ dataChannel, rtcState }: Props) {
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0); // 0–100
  const [receiving, setReceiving] = useState<ReceiveState | null>(null);
  const [download, setDownload] = useState<DownloadReady | null>(null);
  const [dcState, setDcState] = useState<RTCDataChannelState>("connecting");
  const [error, setError] = useState("");

  const chunksRef = useRef<ArrayBuffer[]>([]);
  const receivingRef = useRef<ReceiveState | null>(null); // mirror for closures
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep receivingRef in sync with state (for the message handler closure)
  useEffect(() => { receivingRef.current = receiving; }, [receiving]);

  // ── DataChannel lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    if (!dataChannel) return;

    const onOpen  = () => setDcState("open");
    const onClose = () => { setDcState("closed"); setSending(false); };
    const onError = () => setError("DataChannel error — connection may be unstable.");

    const onMessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        // ── Control frame — validate with Zod ──────────────────────────────
        let raw: unknown;
        try { raw = JSON.parse(event.data as string); }
        catch { console.warn("[FileTransfer] Non-JSON string message ignored"); return; }

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
          const state = { name: msg.name, total: msg.size, received: 0 };
          setReceiving(state);
          receivingRef.current = state;
        } else if (msg.type === "done") {
          const blob = new Blob(chunksRef.current);
          const url  = URL.createObjectURL(blob);
          setDownload({ url, name: receivingRef.current?.name ?? "file", size: blob.size });
          setReceiving(null);
          receivingRef.current = null;
          chunksRef.current = [];
        }
      } else {
        // ── Binary chunk ───────────────────────────────────────────────────
        const buf = event.data as ArrayBuffer;
        chunksRef.current.push(buf);
        setReceiving(prev =>
          prev ? { ...prev, received: prev.received + buf.byteLength } : null
        );
      }
    };

    // Set initial state (channel might already be open if we received it after connect)
    setDcState(dataChannel.readyState);

    dataChannel.addEventListener("open",    onOpen);
    dataChannel.addEventListener("close",   onClose);
    dataChannel.addEventListener("error",   onError);
    dataChannel.addEventListener("message", onMessage);

    // Set low-water mark for backpressure
    dataChannel.bufferedAmountLowThreshold = BUFFER_LOW;

    return () => {
      dataChannel.removeEventListener("open",    onOpen);
      dataChannel.removeEventListener("close",   onClose);
      dataChannel.removeEventListener("error",   onError);
      dataChannel.removeEventListener("message", onMessage);
    };
  }, [dataChannel]);

  // ── Send logic ────────────────────────────────────────────────────────────
  const sendFile = useCallback(async (file: File) => {
    if (!dataChannel || dataChannel.readyState !== "open") return;

    setSending(true);
    setSendProgress(0);
    setError("");

    // 1. Send meta control frame
    dataChannel.send(JSON.stringify({ type: "meta", name: file.name, size: file.size }));

    const buffer = await file.arrayBuffer();
    let offset = 0;

    await new Promise<void>((resolve, reject) => {
      const sendChunk = () => {
        try {
          while (offset < buffer.byteLength) {
            // Backpressure check: pause if buffer is filling up
            if (dataChannel.bufferedAmount > BUFFER_HIGH) {
              dataChannel.addEventListener("bufferedamountlow", sendChunk, { once: true });
              return;
            }
            const end   = Math.min(offset + CHUNK_SIZE, buffer.byteLength);
            const chunk = buffer.slice(offset, end);
            dataChannel.send(chunk);
            offset = end;
            setSendProgress(Math.round((offset / buffer.byteLength) * 100));
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      sendChunk();
    });

    // 2. Send done control frame
    dataChannel.send(JSON.stringify({ type: "done" }));
    setSendProgress(100);
    setSending(false);
  }, [dataChannel]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) sendFile(file).catch(err => {
      setError(`Send failed: ${err instanceof Error ? err.message : String(err)}`);
      setSending(false);
    });
    // Reset input so the same file can be re-sent
    e.target.value = "";
  };

  const isChannelOpen = dcState === "open";
  const receivePercent = receiving
    ? Math.round((receiving.received / receiving.total) * 100)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full animate-fade-in" style={{ borderTop: "1px solid var(--color-border)", paddingTop: "1.5rem", marginTop: "1.5rem" }}>

      {/* DataChannel status badge */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          File Transfer
        </h3>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: isChannelOpen ? "rgba(0,186,124,0.12)" : "rgba(29,155,240,0.12)",
                color: isChannelOpen ? "var(--color-success)" : "var(--color-accent)",
                border: `1px solid ${isChannelOpen ? "rgba(0,186,124,0.3)" : "rgba(29,155,240,0.3)"}`,
              }}>
          {isChannelOpen ? "DataChannel open" : `DataChannel ${dcState}`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs mb-3 animate-fade-in" style={{ color: "var(--color-error)" }}>
          ⚠ {error}
        </p>
      )}

      {/* ── Send section ───────────────────────────────────────────────── */}
      <div className="rounded-xl p-4 mb-4"
           style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
        <p className="text-xs font-medium mb-3" style={{ color: "var(--color-text-secondary)" }}>
          SEND
        </p>

        {!sending ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!isChannelOpen}
            className="w-full rounded-xl py-3 text-sm font-medium transition-all flex items-center justify-center gap-2"
            style={{
              background: isChannelOpen ? "var(--color-accent)" : "var(--color-bg-elevated)",
              color: isChannelOpen ? "#fff" : "var(--color-text-tertiary)",
              border: isChannelOpen ? "none" : "1px solid var(--color-border)",
              cursor: isChannelOpen ? "pointer" : "not-allowed",
            }}
            onMouseEnter={e => { if (isChannelOpen) e.currentTarget.style.background = "var(--color-accent-hover)"; }}
            onMouseLeave={e => { if (isChannelOpen) e.currentTarget.style.background = "var(--color-accent)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Choose file to send
          </button>
        ) : (
          <div>
            <div className="flex justify-between text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>
              <span>Sending…</span>
              <span>{sendProgress}%</span>
            </div>
            <div className="rounded-full overflow-hidden h-2" style={{ background: "var(--color-bg-elevated)" }}>
              <div
                className="h-2 rounded-full transition-all duration-100"
                style={{ width: `${sendProgress}%`, background: "var(--color-accent)" }}
              />
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* ── Receive section ─────────────────────────────────────────────── */}
      {(receiving || download) && (
        <div className="rounded-xl p-4 animate-fade-in"
             style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
          <p className="text-xs font-medium mb-3" style={{ color: "var(--color-text-secondary)" }}>
            RECEIVE
          </p>

          {receiving && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-mono truncate max-w-[180px]" style={{ color: "var(--color-text-primary)" }}>
                  {receiving.name}
                </span>
                <span style={{ color: "var(--color-text-secondary)" }}>
                  {receivePercent}%
                </span>
              </div>
              <div className="rounded-full overflow-hidden h-2" style={{ background: "var(--color-bg-elevated)" }}>
                <div
                  className="h-2 rounded-full transition-all duration-100"
                  style={{ width: `${receivePercent}%`, background: "var(--color-success)" }}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                {(receiving.received / 1024 / 1024).toFixed(2)} /&nbsp;
                {(receiving.total / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          )}

          {download && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                     style={{ background: "rgba(0,186,124,0.12)", border: "1px solid rgba(0,186,124,0.3)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
              <a
                href={download.url}
                download={download.name}
                className="block w-full rounded-xl py-2.5 text-sm font-semibold text-center transition-colors"
                style={{ background: "rgba(0,186,124,0.15)", color: "var(--color-success)", border: "1px solid rgba(0,186,124,0.3)" }}
              >
                ↓ Download {download.name}
              </a>
            </div>
          )}
        </div>
      )}

      {!receiving && !download && isChannelOpen && (
        <p className="text-xs text-center" style={{ color: "var(--color-text-tertiary)" }}>
          Waiting for incoming file…
        </p>
      )}
    </div>
  );
}
