/** ILLIUM-branded age verification icon — elegant green shield with "I" monogram. */
export function AgeVerificationShield({ className = '' }: { className?: string }) {
  return (
    <div className={`relative mx-auto ${className}`} aria-hidden>
      <svg viewBox="0 0 120 140" className="h-32 w-28 drop-shadow-lg md:h-36 md:w-32">
        <defs>
          <linearGradient id="shieldGreen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#14532d" />
            <stop offset="50%" stopColor="#166534" />
            <stop offset="100%" stopColor="#052e16" />
          </linearGradient>
          <linearGradient id="shieldRim" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="50%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <filter id="textGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Shield body */}
        <path
          d="M60 6 L104 22 L104 58 Q104 96 60 128 Q16 96 16 58 L16 22 Z"
          fill="url(#shieldGreen)"
          stroke="url(#shieldRim)"
          strokeWidth="2.5"
        />
        {/* Inner rim */}
        <path
          d="M60 14 L96 27 L96 56 Q96 88 60 118 Q24 88 24 56 L24 27 Z"
          fill="none"
          stroke="#22c55e"
          strokeWidth="0.8"
          opacity="0.4"
        />
        {/* "I" monogram — large, bright, serif */}
        <text
          x="60"
          y="82"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="900"
          fontSize="56"
          fill="white"
          filter="url(#textGlow)"
        >
          I
        </text>
        {/* Small lock at the bottom of the shield */}
        <g transform="translate(52, 96)">
          <rect x="2" y="3" width="12" height="10" rx="2" fill="#166534" stroke="#4ade80" strokeWidth="1" />
          <path d="M5 3 Q5 -2 8 -2 Q11 -2 11 3" fill="none" stroke="#4ade80" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="8" cy="8" r="1.5" fill="#4ade80" />
        </g>
      </svg>
    </div>
  );
}
