/** Mortar, pestle and leaves beside the home heading (decorative: the heading carries the meaning). */
export function HomeIllustration() {
  return (
    <svg
      viewBox="12 2 96 112"
      aria-hidden="true"
      className="h-28 w-24 self-start desktop:h-42 desktop:w-36"
    >
      {/* Pestle */}
      <g transform="rotate(-36 44 48)" className="fill-primary-deep">
        <rect x="37" y="28" width="14" height="50" rx="3" />
        <rect x="34.5" y="17" width="19" height="9" rx="3.5" />
      </g>
      {/* Leaves */}
      <path d="M64 48Q63 58 66 68" fill="none" strokeWidth="3" className="stroke-primary-deep" />
      <path d="M64 49C50 38 50 18 72 5C85 21 83 40 64 49Z" className="fill-primary-deep" />
      <path
        d="M63 69C54 47 70 25 106 21C108 50 91 70 63 69Z"
        strokeWidth="2.5"
        className="fill-primary-deep stroke-ground"
      />
      <path
        d="M65 44Q65 29 71 17M68 62Q77 46 95 32"
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        className="stroke-ground"
      />
      {/* Bowl */}
      <path
        d="M14 66H106C106 85 94 99 79 104V108Q79 112 75 112H45Q41 112 41 108V104C26 99 14 85 14 66Z"
        className="fill-[color-mix(in_srgb,var(--color-primary)_72%,var(--color-surface))]"
      />
      <path
        d="M14 66C22 83 58 96 102 83C97 93 89 100.5 79 104V108Q79 112 75 112H45Q41 112 41 108V104C26 99 14 85 14 66Z"
        className="fill-primary-deep"
      />
      <path d="M15 68C34 76 80 76 105 68" fill="none" strokeWidth="3" className="stroke-ground" />
    </svg>
  );
}
