// CareNest mark: a rounded "nest" roof sheltering a medical cross.
function Logo({ size = 56, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="CareNest logo"
    >
      <defs>
        <linearGradient id="carenest-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10b981" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#carenest-bg)" />
      <path
        d="M14 30 L32 15 L50 30"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 28 V45 a4 4 0 0 0 4 4 H41 a4 4 0 0 0 4 -4 V28"
        stroke="white"
        strokeOpacity="0.55"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M29 31 h6 v5 h5 v6 h-5 v5 h-6 v-5 h-5 v-6 h5 z" fill="white" />
    </svg>
  );
}

export default Logo;
