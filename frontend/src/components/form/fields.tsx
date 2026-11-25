import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

const BOX = "min-h-13 w-full rounded-control border bg-surface px-3.5 text-[17px]";

export function TextField({
  label,
  hint,
  error,
  prefix,
  className = "",
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  prefix?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      <div className="flex">
        {prefix && (
          <span className="flex items-center rounded-l-control border border-r-0 border-line-strong bg-ground px-3 text-[17px] font-semibold text-ink-soft">
            {prefix}
          </span>
        )}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          className={`${BOX} min-w-0 ${error ? "border-danger" : "border-line-strong"} ${
            prefix ? "rounded-l-none" : ""
          } ${className}`}
          {...input}
        />
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  ...area
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      <textarea
        id={id}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={`w-full rounded-control border bg-surface px-3.5 py-2.5 text-base leading-relaxed ${
          error ? "border-danger" : "border-line-strong"
        }`}
        {...area}
      />
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="text-sm font-medium text-danger">
      {children}
    </p>
  );
}

/** A small set of choices shown side by side; radio buttons underneath. */
export function SegmentedChoice<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  name: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? id : undefined} className="min-w-0">
      <legend className="mb-1.5 text-[15px] font-semibold">{legend}</legend>
      <div
        className={`grid auto-cols-fr grid-flow-col overflow-hidden rounded-control border ${
          error ? "border-danger" : "border-line-strong"
        }`}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-13 cursor-pointer items-center justify-center border-line-strong px-1 text-center text-[15px] font-semibold not-first:border-l has-checked:bg-ink has-checked:text-surface has-focus-visible:outline-3 has-focus-visible:-outline-offset-3 has-focus-visible:outline-primary"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && <FieldError id={id}>{error}</FieldError>}
    </fieldset>
  );
}

/** The page's main action, pinned to the bottom of a phone screen. */
export function SubmitBar({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t border-line bg-surface px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] desktop:static desktop:mx-0 desktop:border-0 desktop:px-0">
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-[54px] w-full items-center justify-center rounded-control bg-primary text-[17px] font-bold text-surface disabled:opacity-60"
      >
        {children}
      </button>
    </div>
  );
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-control bg-amber-wash px-3.5 py-3 font-medium text-ink">
      {children}
    </div>
  );
}

export function Heading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="font-display text-[34px] leading-tight font-normal">{title}</h1>
      {note && <p className="text-base text-ink-muted">{note}</p>}
    </div>
  );
}
