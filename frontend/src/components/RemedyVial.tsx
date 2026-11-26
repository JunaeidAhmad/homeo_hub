import type { components } from "@/api/schema";

type RemedyForm = components["schemas"]["FormEnum"];

/**
 * A homeopathic vial with its apothecary label: the product's picture when a remedy
 * has no photograph. Small for lists, large for the remedy page.
 */
export function RemedyVial({
  name,
  nameBn,
  size = "large",
  form,
}: {
  name: string;
  nameBn?: string;
  size?: "small" | "large";
  form?: RemedyForm | null;
}) {
  const large = size === "large";
  const glass = form === "LIQUID" ? "border-amber bg-amber-wash" : "border-glass-line bg-glass";
  return (
    <div role="img" aria-label={name} className="flex flex-col items-center">
      <span className={`rounded-t-sm bg-ink ${large ? "h-7 w-21" : "h-2 w-6"}`} />
      <span className={`border-x-2 ${glass} ${large ? "h-2.5 w-15" : "h-1 w-4"}`} />
      <span
        className={`flex items-center justify-center border-2 ${glass} ${
          large ? "h-54 w-45 rounded-[30px_30px_20px_20px] px-4" : "h-14 w-11 rounded-lg px-1"
        }`}
      >
        {large ? (
          // The double rule of a dispensary label.
          <span className="flex w-full flex-col items-center gap-1 border border-ink bg-surface p-[3px] text-center">
            <span className="flex w-full flex-col items-center gap-1 border border-ink px-1.5 py-2.5">
              <span className="text-[11px] font-semibold text-primary">HomeoHub</span>
              <span lang="la" className="font-display text-[17px] leading-tight italic">
                {name}
              </span>
              {nameBn && (
                <span lang="bn" className="font-display text-xs text-ink-muted">
                  {nameBn}
                </span>
              )}
            </span>
          </span>
        ) : (
          <span className="w-full border border-ink bg-surface py-1">
            <span className="mx-auto block h-px w-3/4 bg-ink" />
          </span>
        )}
      </span>
    </div>
  );
}
