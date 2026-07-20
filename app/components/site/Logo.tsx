// The v1 mark, kept by decision (ADR: new identity, same logo): the stone
// bridge over the Ebro. Colors are the brand's fixed points.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
    >
      <g transform="translate(0,7)">
        <path
          fill="#1f8a57"
          d="M7 30 L7 21 A17 17 0 0 1 41 21 L41 30 L35 30 L35 22 A11 11 0 0 0 13 22 L13 30 Z"
        />
        <path
          fill="#9cc4f0"
          d="M13 30 L13 26.5 C16.5 25.1 19.5 27.4 24 26.3 C28.5 25.2 31.5 27.4 35 26.3 L35 30 Z"
        />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="font-display text-xl font-semibold tracking-tight text-ink">
        Ebrostay
      </span>
    </span>
  );
}
