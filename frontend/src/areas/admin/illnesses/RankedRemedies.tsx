"use client";

import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { FormAlert } from "@/components/form/fields";
import { RemedySearch, type RemedyOption } from "@/components/RemedySearch";
import { fill } from "@/i18n/catalog";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";

type RankedItem = {
  remedy_id: string;
  remedy_name: string;
  remedy_name_bn: string;
  remedy_status: string;
};

function toRow(item: components["schemas"]["AdminIllnessRemedy"]): RankedItem {
  return {
    remedy_id: item.remedy_id,
    remedy_name: item.remedy_name,
    remedy_name_bn: item.remedy_name_bn,
    remedy_status: item.remedy_status,
  };
}

export function RankedRemedies({ illnessId }: { illnessId: string }) {
  const { t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const { pending, problems, submit } = useAdminSubmit();

  const [items, setItems] = useState<RankedItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/admin/illnesses/{id}/remedies/", {
        params: { path: { id: illnessId } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!data) {
          setStatus("error");
          return;
        }
        setItems(data.map(toRow));
        setDirty(false);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [api, illnessId, reloadKey]);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    setItems(next);
    setDirty(true);
    setNotice("");
  }

  function remove(index: number) {
    setItems((now) => now.filter((_, idx) => idx !== index));
    setDirty(true);
    setNotice("");
  }

  function append(remedy: RemedyOption) {
    if (items.some((item) => item.remedy_id === remedy.id)) return;
    setItems((now) => [
      ...now,
      {
        remedy_id: remedy.id,
        remedy_name: remedy.name,
        remedy_name_bn: remedy.name_bn ?? "",
        remedy_status: "ACTIVE",
      },
    ]);
    setDirty(true);
    setNotice("");
  }

  function saveOrder() {
    void submit(
      () =>
        api.PUT("/api/v1/admin/illnesses/{id}/remedies/", {
          params: { path: { id: illnessId } },
          body: { remedy_ids: items.map((item) => item.remedy_id) },
        }),
      (saved) => {
        setItems(saved.map(toRow));
        setDirty(false);
        setNotice(t("admin.illness.orderSaved"));
      },
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4 desktop:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xl">{t("admin.illness.rankedRemedies")}</h3>
        {dirty && (
          <span className="rounded-control bg-amber-wash px-3 py-1 text-sm font-semibold text-ink">
            {t("admin.illness.unsavedChanges")}
          </span>
        )}
      </div>

      {problems.form && <FormAlert>{problems.form}</FormAlert>}
      <p role="status" className="rounded-control bg-mist px-3.5 py-2.5 text-sm font-medium empty:hidden">
        {notice}
      </p>

      {status === "loading" && <p className="text-ink-muted">{t("admin.loading")}</p>}
      {status === "error" && (
        <div role="alert" className="flex items-center gap-3 text-danger">
          <span>{t("admin.unavailable")}</span>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setReloadKey((n) => n + 1);
            }}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold text-ink"
          >
            {t("admin.retry")}
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          {items.length === 0 ? (
            <p className="text-ink-muted">{t("admin.illness.noRemedies")}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {items.map((item, index) => (
                <li
                  key={item.remedy_id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null) move(dragIndex, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-ground/50 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      title={t("admin.illness.dragHint")}
                      className="cursor-grab px-1 text-ink-muted select-none"
                    >
                      ⋮⋮
                    </span>
                    <span className="flex size-7 flex-none items-center justify-center rounded-full bg-surface text-sm font-bold">
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span lang="la" className="truncate font-display text-lg italic">
                        {item.remedy_name}
                      </span>
                      {item.remedy_status !== "ACTIVE" && (
                        <span className="text-xs font-semibold text-amber">
                          {item.remedy_status}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={fill(t("admin.illness.moveUp"), { name: item.remedy_name })}
                      onClick={() => move(index, index - 1)}
                      className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === items.length - 1}
                      aria-label={fill(t("admin.illness.moveDown"), { name: item.remedy_name })}
                      onClick={() => move(index, index + 1)}
                      className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-danger"
                    >
                      {t("admin.illness.removeRemedy")}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="border-t border-line pt-4">
            <RemedySearch
              label={t("admin.illness.addRemedy")}
              hint={t("admin.illness.addRemedyHint")}
              excludeIds={items.map((item) => item.remedy_id)}
              onPick={append}
            />
          </div>

          <button
            type="button"
            disabled={pending || !dirty}
            onClick={saveOrder}
            className="min-h-13 self-start rounded-control bg-primary px-6 font-bold text-surface disabled:opacity-50"
          >
            {t("admin.illness.saveOrder")}
          </button>
        </>
      )}
    </section>
  );
}
