"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { FormAlert } from "@/components/form/fields";

/** Native modal confirmation dialog styled as a dispensary-label panel. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  pending = false,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "primary" | "danger";
  pending?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      className="m-auto w-[min(92vw,440px)] rounded-panel border border-line bg-surface p-5 text-ink backdrop:bg-ink/40"
    >
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="font-display text-2xl font-normal">
          {title}
        </h2>
        {body && <p className="text-base text-ink-soft">{body}</p>}
        {children}
        {error && <FormAlert>{error}</FormAlert>}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={`min-h-11 rounded-control px-5 font-bold text-surface disabled:opacity-60 ${
              tone === "danger" ? "bg-danger" : "bg-primary"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
