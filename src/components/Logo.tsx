/** The BridgeMyTunes mark: a bridge in paper on the ultramarine, the same drawing as the tab icon (src/app/icon.svg). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="mark" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      <rect width="64" height="64" className="mark__bg" />
      <g className="mark__line" fill="none">
        <path d="M12 42 C12 22 52 22 52 42" strokeWidth="6" strokeLinecap="square" />
        <path d="M6 42 H58" strokeWidth="6" />
        <path d="M22 42 V31 M32 42 V28 M42 42 V31" strokeWidth="4" />
      </g>
    </svg>
  );
}
