export function VeloLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="velo-grad" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38e1ff" />
          <stop offset="0.55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#e14eff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#161a24" stroke="#2a3040" strokeWidth="1.5" />
      <path
        d="M14 16 L26 16 L32 34 L38 16 L50 16 L39 48 L25 48 Z"
        fill="url(#velo-grad)"
      />
      <path
        d="M40 10 L46 16 L40 22"
        stroke="#38e1ff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
