/** A 24px stroke icon from a single SVG path (decorative: the label carries the meaning). */
export function Icon({
  path,
  size = 22,
  strokeWidth = 1.8,
}: {
  path: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
