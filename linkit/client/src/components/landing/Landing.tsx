import { lazy, Suspense } from "react";
import type { Socket } from "socket.io-client";
import ScrollExpand from "../ScrollExpand";
import { ErrorBoundary } from "../ErrorBoundary";
import { RoomActions } from "./RoomActions";
import { TransferScene } from "./TransferScene";
import { ProductSections } from "./ProductSections";
import { useMediaQuery, usePrefersReducedMotion } from "../../hooks/useMediaQuery";

interface Props {
  socket: Socket | null;
  connectionState: string;
  onJoined: (roomCode: string) => void;
}

// Ballpit pulls in three.js (~700 kB). Loading it lazily keeps it out of the
// main bundle, so the headline and the create/join panel appear immediately
// and the balls drop in a moment later.
const Ballpit = lazy(() => import("../backgrounds/Ballpit"));

// Ballpit colours are 0xRRGGBB numbers. Mostly violets pulled from the room's
// Grainient palette, plus one pale lilac so a few balls catch the light.
const BALL_COLORS = [0x5f3ceb, 0x7a5cf5, 0xa08bff, 0x251d2c, 0xece9f5];

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function Landing({ socket, connectionState, onJoined }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const compact = useMediaQuery("(max-width: 720px)");

  const startRoom = () => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    document.getElementById("create-room-btn")?.focus({ preventScroll: true });
  };

  return (
    <main>
      {/* ═══ Hero: Ballpit background + create / join ═══ */}
      <header className="hero">
        <div className={`hero__bg ${reducedMotion ? "hero__bg--static" : ""}`} aria-hidden="true">
          {!reducedMotion && (
            // If WebGL isn't available the boundary swaps in the static gradient.
            <ErrorBoundary fallback={<div className="hero__bg hero__bg--static" />}>
            <Suspense fallback={null}>
            <Ballpit
              // Fewer balls on phones: the physics + PBR shading is the most
              // expensive thing on the page.
              count={compact ? 70 : 150}
              colors={BALL_COLORS}
              gravity={0.35}
              friction={0.9975}
              wallBounce={0.95}
              maxVelocity={0.15}
              minSize={0.5}
              maxSize={1.1}
              lightIntensity={170}
              followCursor
            />
            </Suspense>
            </ErrorBoundary>
          )}
        </div>
        <div className="hero__scrim" />

        <div className="hero__content relative mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-6">
          <nav className="flex items-center justify-between py-6" aria-label="Main">
            <span className="flex items-center gap-2 font-display text-xl font-bold">
              <LogoMark /> LinkIt
            </span>
            <a href="#how" className="text-sm font-medium underline-offset-4 hover:underline"
               style={{ color: "var(--color-text-secondary)" }}>
              How it works
            </a>
          </nav>

          <div className="grid flex-1 items-center gap-10 pb-16 pt-4 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
            <div>
              <h1 className="font-display text-[clamp(2.5rem,5.6vw,4.75rem)] font-bold leading-[1.02] text-balance">
                Send files straight to someone else's browser.
              </h1>
              <p className="mt-6 max-w-[46ch] text-lg leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                LinkIt connects two devices directly. There's no upload, no account,
                and nothing stored on a server.
              </p>
            </div>

            <div className="glass w-full max-w-[420px] p-6 lg:justify-self-end">
              <RoomActions socket={socket} connectionState={connectionState} onJoined={onJoined} />
            </div>
          </div>
        </div>
      </header>

      {/* ═══ Scroll Expand: the product in one picture ═══ */}
      <ScrollExpand
        useWindowScroll
        mediaType="custom"
        media={<TransferScene />}
        scrollHint="Scroll to see how it works"
        startWidth={38}
        startHeight={52}
        scrollDistance={1.1}
        holdDistance={0.25}
      />

      {/* ═══ Two product sections ═══ */}
      <ProductSections />

      <footer className="px-6 pb-20">
        <div className="mx-auto flex max-w-[1120px] flex-col items-start justify-between gap-6 border-t pt-10 sm:flex-row sm:items-center"
             style={{ borderColor: "var(--color-border)" }}>
          <p className="font-display text-2xl font-semibold">Ready to send something?</p>
          <button type="button" className="btn btn--primary btn--auto" onClick={startRoom}>
            Start a room
          </button>
        </div>
      </footer>
    </main>
  );
}
