import type { ReactNode } from "react";

/* ── Diagram: who talks to whom ─────────────────────────────────────────────
   The server appears only in the handshake; the file itself never touches it.
   That distinction is the whole product, so it's the diagram. */
function HandshakeDiagram() {
  const accent = "var(--color-accent)";
  const line = "rgba(255,255,255,0.35)";
  const text = "var(--color-text-primary)";
  const muted = "var(--color-text-secondary)";
  return (
    <svg viewBox="0 0 560 340" className="w-full h-auto" role="img"
         aria-label="Diagram: the LinkIt server helps two browsers connect, then the file travels directly between the browsers.">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={accent} />
        </marker>
      </defs>

      {/* handshake lines (dashed = brief, setup only) */}
      <path d="M215 96 L120 232" stroke={line} strokeWidth="1.5" strokeDasharray="5 6" fill="none" />
      <path d="M345 96 L440 232" stroke={line} strokeWidth="1.5" strokeDasharray="5 6" fill="none" />
      <text x="128" y="152" fill={muted} fontSize="13" textAnchor="end">1 · Handshake</text>
      <text x="432" y="152" fill={muted} fontSize="13">1 · Handshake</text>

      {/* direct file path (solid = the real thing) */}
      <path d="M200 276 L360 276" stroke={accent} strokeWidth="3" fill="none"
            markerEnd="url(#arrow)" markerStart="url(#arrow)" />
      <text x="280" y="262" fill={text} fontSize="14" fontWeight="600" textAnchor="middle">2 · The file</text>
      <text x="280" y="304" fill={muted} fontSize="12.5" textAnchor="middle">direct, in 16 KB pieces</text>

      {/* nodes */}
      <rect x="180" y="24" width="200" height="72" rx="14" fill="rgba(255,255,255,0.04)" stroke={line} strokeDasharray="5 6" />
      <text x="280" y="55" fill={text} fontSize="16" fontWeight="600" textAnchor="middle">LinkIt server</text>
      <text x="280" y="77" fill={muted} fontSize="12.5" textAnchor="middle">introduces the two browsers</text>

      <rect x="16" y="232" width="184" height="88" rx="14" fill="rgba(95,60,235,0.28)" stroke={accent} />
      <text x="108" y="272" fill={text} fontSize="16" fontWeight="600" textAnchor="middle">Your browser</text>
      <text x="108" y="294" fill={muted} fontSize="12.5" textAnchor="middle">sender</text>

      <rect x="360" y="232" width="184" height="88" rx="14" fill="rgba(95,60,235,0.28)" stroke={accent} />
      <text x="452" y="272" fill={text} fontSize="16" fontWeight="600" textAnchor="middle">Their browser</text>
      <text x="452" y="294" fill={muted} fontSize="12.5" textAnchor="middle">receiver</text>
    </svg>
  );
}

/* ── Visual: what "resumes where it stopped" looks like ────────────────────── */
function Bar({ label, note, done, hatched }: { label: string; note: string; done: number; hatched?: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs" style={{ color: "var(--color-text-secondary)" }}>
        <span>{label}</span><span>{note}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${done}%`, background: "var(--color-accent)" }} />
        {hatched ? (
          <div className="absolute inset-y-0 rounded-full"
               style={{
                 left: `${done}%`, width: `${hatched}%`,
                 background: "repeating-linear-gradient(135deg, rgba(160,139,255,0.55) 0 4px, transparent 4px 8px)",
               }} />
        ) : null}
      </div>
    </div>
  );
}

function ResumeVisual() {
  return (
    <div className="panel-visual" role="img"
         aria-label="Illustration: a transfer stops at 62 percent when the connection drops, then continues from 62 percent after reconnecting.">
      <p className="m-0 mb-5 text-sm font-semibold" aria-hidden="true">
        quarterly-report.pdf <span style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}>· 84.2 MB</span>
      </p>
      <div className="grid gap-5" aria-hidden="true">
        <Bar label="Sending" note="62%" done={62} />
        <Bar label="Connection lost" note="paused at 62%" done={62} />
        <Bar label="Reconnected" note="continues from 62%" done={62} hatched={38} />
      </div>
    </div>
  );
}

function Section({ id, flip, children }: { id?: string; flip?: boolean; children: ReactNode }) {
  return (
    <section id={id} className="section">
      <div className={`section__inner ${flip ? "section__inner--flip" : ""}`}>{children}</div>
    </section>
  );
}

/** The two product-presentation sections that follow the scroll-expand moment. */
export function ProductSections() {
  return (
    <>
      <Section id="how">
        <div>
          <h2 className="h2 font-display">Your file never sits on a server.</h2>
          <p className="lead">
            LinkIt only introduces two browsers to each other. After that, the file travels
            straight between them over a WebRTC data channel, encrypted in transit.
          </p>
          <ol className="steps">
            <li>
              <strong>Handshake</strong>
              <span>The server passes connection details between you and the other person, then steps aside.</span>
            </li>
            <li>
              <strong>Transfer</strong>
              <span>Your browser cuts the file into small pieces and streams them directly to theirs.</span>
            </li>
            <li>
              <strong>Delivery</strong>
              <span>Their browser puts the pieces back together and offers the finished file to save.</span>
            </li>
          </ol>
        </div>
        <div className="panel-visual"><HandshakeDiagram /></div>
      </Section>

      <Section flip>
        <div>
          <h2 className="h2 font-display">Made for large files and shaky connections.</h2>
          <p className="lead">
            Rooms hold exactly two people, so a room ID is a private line, not a group chat.
          </p>
          <dl className="facts">
            <div>
              <dt>Picks up where it stopped</dt>
              <dd>If the connection drops mid-transfer, the receiver reports what it already has and the sender continues from there.</dd>
            </div>
            <div>
              <dt>Works on strict networks</dt>
              <dd>When a direct path is blocked by a firewall or router, the connection falls back to a relay automatically.</dd>
            </div>
            <div>
              <dt>Paced for big files</dt>
              <dd>Sending pauses whenever the connection backs up, so large files don't clog the channel or drop pieces.</dd>
            </div>
          </dl>
        </div>
        <ResumeVisual />
      </Section>
    </>
  );
}
