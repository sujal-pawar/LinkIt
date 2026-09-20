/**
 * Illustration used as the Scroll Expand media: two browser windows joined by
 * a dashed line with packets travelling across it. It's drawn in HTML/CSS
 * (not a screenshot) so it stays crisp when the frame expands to full screen
 * and inherits the site's fonts and colours.
 */
function FileIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <polyline points="14 3 14 8 19 8" />
    </svg>
  );
}

function Peer({ title, state }: { title: string; state: string }) {
  return (
    <div className="scene__peer">
      <div className="scene__bar" aria-hidden="true">
        <i /><i /><i /><span>{title}</span>
      </div>
      <div className="scene__body">
        <div className="scene__file">
          <FileIcon />
          <div>
            <b>quarterly-report.pdf</b>
            <small>84.2 MB</small>
          </div>
        </div>
        <div className="scene__track"><div className="scene__fill" /></div>
        <div className="scene__state"><span>{state}</span><span>62%</span></div>
      </div>
    </div>
  );
}

export function TransferScene() {
  return (
    <div className="scene" role="img"
         aria-label="Illustration: a file moving directly from one browser window to another.">
      <div className="scene__row" aria-hidden="true">
        <Peer title="Your browser" state="Sending" />
        <div className="scene__line">
          <span className="scene__packet" /><span className="scene__packet" /><span className="scene__packet" />
        </div>
        <Peer title="Their browser" state="Receiving" />
      </div>
      <p className="scene__caption" aria-hidden="true">
        The file goes from one browser straight to the other, encrypted in transit.
      </p>
    </div>
  );
}
