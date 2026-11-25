import Link from "next/link";

/** The HomeoHub vial mark and wordmark; links to the patient home. */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const large = size === "lg";
  return (
    <Link
      href="/"
      className="flex min-h-11 items-center gap-2 rounded-control text-ink"
    >
      <svg
        width={large ? 22 : 18}
        height={large ? 34 : 28}
        viewBox="0 0 22 34"
        aria-hidden="true"
      >
        <rect
          x="5"
          y="0.5"
          width="12"
          height="6"
          rx="1.5"
          className="fill-ink"
        />
        <rect x="7" y="6.5" width="8" height="3" className="fill-primary" />
        <rect
          x="1"
          y="9.5"
          width="20"
          height="24"
          rx="5"
          className="fill-primary"
        />
        <rect
          x="4"
          y="15"
          width="14"
          height="11"
          rx="1"
          className="fill-surface"
        />
        <rect
          x="6.5"
          y="18.5"
          width="9"
          height="1.6"
          className="fill-primary"
        />
        <rect
          x="8"
          y="21.6"
          width="6"
          height="1.2"
          className="fill-line-strong"
        />
      </svg>
      <span
        className={`font-display leading-none ${large ? "text-2xl" : "text-[22px]"}`}
      >
        HomeoHub
      </span>
    </Link>
  );
}
