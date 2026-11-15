/**
 * The BridgeMyTunes mark: two apps (the dots) joined by one line that carries the music (the sound bars).
 * Wide version for the top bar; the tab icon is a compact square drawing of the same idea (src/app/icon.svg).
 */
export function Logo({ height = 22 }: { height?: number }) {
  return (
    <svg className="mark" viewBox="8 16 160 62" height={height} width={(height * 160) / 62} aria-hidden="true" focusable="false">
      <path
        className="mark__line"
        d="M36 59 C50 59 56 51 63 42 C71 31 78 23.3 88.6 23.3 C99 23.3 106 31 114 42 C121 51 127 59 141 59"
        fill="none"
        strokeWidth="7.6"
      />
      <g className="mark__bars">
        <rect x="59.1" y="52" width="8" height="13.6" rx="4" />
        <rect x="70" y="41" width="9.6" height="28" rx="4.8" />
        <rect x="83.6" y="31.7" width="10" height="42.3" rx="5" />
        <rect x="97.6" y="41" width="9.6" height="28" rx="4.8" />
        <rect x="110" y="52" width="8" height="13.6" rx="4" />
      </g>
      <g className="mark__dots">
        <circle cx="23.6" cy="59.5" r="13.7" />
        <circle cx="153.3" cy="59.5" r="13.7" />
      </g>
    </svg>
  );
}
