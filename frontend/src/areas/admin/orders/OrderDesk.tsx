"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { components } from "@/api/schema";
import { AreaMatchBadge } from "@/components/AreaMatchBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormAlert, TextField } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import type { Locale } from "@/i18n/config";
import { formatMoney, numberFormat, parseTakaToPoisha, poishaToTakaInput } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";

type OrderDetail = components["schemas"]["AdminOrderDetail"];
type OrderItem = components["schemas"]["AdminOrderItem"];
type Assignment = components["schemas"]["AdminShopAssignment"];
type AssignmentStatus = components["schemas"]["AssignmentStatusEnum"];
type Candidate = components["schemas"]["AdminCandidateListing"];

const ASSIGNMENT_STEPS: AssignmentStatus[] = ["ASSIGNED", "PROCESSING", "SHIPPED", "DELIVERED"];

function formatDateTime(locale: Locale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function OrderDesk({ orderId }: { orderId: string }) {
  const { locale, t } = useMessages<AdminMessages>();
  const session = useStaffSession();
  const { api } = session;
  const { pending, problems, setProblems, submit } = useAdminSubmit();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [candidatesByItem, setCandidatesByItem] = useState<Record<string, Candidate[]>>({});
  const [candidatesLoading, setCandidatesLoading] = useState<string | null>(null);

  const deliverDialogRef = useRef<HTMLDialogElement>(null);
  const [deliverTarget, setDeliverTarget] = useState<Assignment | null>(null);
  const [cashTaka, setCashTaka] = useState("");
  const [deliverNote, setDeliverNote] = useState("");
  const [cashError, setCashError] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");

  const canManage =
    session.status === "signedIn" && session.staff.permissions.includes("manage_orders");

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/admin/orders/{id}/", {
        params: { path: { id: orderId } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) {
          setOrder(data);
          setLoadStatus("ready");
        } else {
          setLoadStatus("error");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadStatus("error");
      });
    return () => controller.abort();
  }, [api, orderId]);

  async function toggleCandidates(item: OrderItem) {
    if (expandedItemId === item.id) {
      setExpandedItemId(null);
      return;
    }
    setExpandedItemId(item.id);
    setCandidatesLoading(item.id);
    try {
      const { data } = await api.GET("/api/v1/admin/orders/{id}/items/{item_id}/candidates/", {
        params: { path: { id: orderId, item_id: item.id } },
      });
      if (data) {
        setCandidatesByItem((now) => ({ ...now, [item.id]: data }));
      }
    } finally {
      setCandidatesLoading(null);
    }
  }

  function assign(itemId: string, shopRemedyId: string) {
    void submit(
      () =>
        api.POST("/api/v1/admin/orders/{id}/items/{item_id}/assign/", {
          params: { path: { id: orderId, item_id: itemId } },
          body: { shop_remedy_id: shopRemedyId },
        }),
      (updated) => {
        setOrder(updated);
        setExpandedItemId(null);
      },
    );
  }

  function unassign(itemId: string) {
    void submit(
      () =>
        api.DELETE("/api/v1/admin/orders/{id}/items/{item_id}/assign/", {
          params: { path: { id: orderId, item_id: itemId } },
        }),
      (updated) => {
        setOrder(updated);
      },
    );
  }

  function advance(
    assignment: Assignment,
    nextStatus: AssignmentStatus,
    cashPoisha?: number,
    note?: string,
  ) {
    void submit(
      () =>
        api.POST("/api/v1/admin/shop-assignments/{id}/status/", {
          params: { path: { id: assignment.id } },
          body: {
            status: nextStatus,
            ...(cashPoisha !== undefined ? { cash_collected_poisha: cashPoisha } : {}),
            note: note ?? "",
          },
        }),
      (updated) => {
        setOrder(updated);
        deliverDialogRef.current?.close();
      },
    );
  }

  function openDeliverDialog(assignment: Assignment) {
    setDeliverTarget(assignment);
    setCashTaka(poishaToTakaInput(assignment.expected_cod_poisha));
    setDeliverNote("");
    setCashError("");
    deliverDialogRef.current?.showModal();
  }

  function confirmDeliver() {
    if (!deliverTarget || !order) return;
    let cashPoisha: number | undefined;
    if (order.payment_method === "COD") {
      const parsed = parseTakaToPoisha(cashTaka);
      if (parsed === null) {
        setCashError(t("admin.error.CASH_AMOUNT_REQUIRED"));
        return;
      }
      cashPoisha = parsed;
    }
    advance(deliverTarget, "DELIVERED", cashPoisha, deliverNote.trim());
  }

  function confirmCancel() {
    if (!cancelReason.trim()) {
      setCancelError(t("admin.error.required"));
      return;
    }
    setCancelError("");
    void submit(
      () =>
        api.POST("/api/v1/admin/orders/{id}/cancel/", {
          params: { path: { id: orderId } },
          body: { reason: cancelReason.trim() },
        }),
      (updated) => {
        setOrder(updated);
        setCancelOpen(false);
        setCancelReason("");
      },
    );
  }

  if (loadStatus === "loading") {
    return (
      <p role="status" className="text-ink-muted">
        {t("admin.loading")}
      </p>
    );
  }

  if (loadStatus === "error" || !order) {
    return <FormAlert>{t("admin.unavailable")}</FormAlert>;
  }

  const assignmentById = new Map(order.assignments.map((a) => [a.id, a]));
  const canAssignOrder =
    canManage &&
    (order.status === "PENDING" ||
      order.status === "CONFIRMED" || order.status === "PAID" || order.status === "PROCESSING");

  return (
    <section className="flex flex-col gap-5">
      <Link href="/admin/orders" className="min-h-11 self-start font-semibold text-primary underline">
        {t("admin.orders.back")}
      </Link>

      {problems.form && <FormAlert>{problems.form}</FormAlert>}

      {/* Header panel */}
      <header className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4 desktop:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[30px] leading-tight font-normal">{order.code}</h1>
            <span className="rounded-control bg-mist px-3 py-1 text-sm font-semibold">
              {t(`admin.orders.status.${order.status}`)}
            </span>
          </div>
          {canManage && order.status !== "CANCELLED" && order.status !== "DELIVERED" && order.status !== "RETURNED" && (
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                disabled={pending || !order.can_cancel}
                onClick={() => {
                  setProblems({ fields: {} });
                  setCancelError("");
                  setCancelOpen(true);
                }}
                className="min-h-11 rounded-control border border-danger bg-surface px-4 font-semibold text-danger disabled:opacity-40"
              >
                {t("admin.orders.cancel")}
              </button>
              {!order.can_cancel && (
                <span className="text-xs text-ink-muted">{t("admin.orders.cancelDisabled")}</span>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-4 border-t border-line pt-4 desktop:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-ink-muted">
              {t("admin.orders.patient")}
            </span>
            <span className="font-semibold">{order.patient.full_name}</span>
            <a href={`tel:${order.patient.phone}`} className="text-primary underline">
              {order.patient.phone}
            </a>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-ink-muted">
              {t("admin.orders.delivery")}
            </span>
            <span className="font-semibold">{order.shipping_address.recipient_name}</span>
            <span className="text-sm text-ink-soft">{order.shipping_address.address_line}</span>
            <span className="text-sm text-ink-muted">
              {locale === "bn" ? order.shipping_address.area_bn : order.shipping_address.area_en}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-ink-muted">
              {t("admin.orders.totals")}
            </span>
            <span className="text-sm text-ink-soft">
              {order.payment_method === "COD" ? t("admin.orders.cod") : t("admin.orders.online")}
            </span>
            <span className="text-sm text-ink-soft">
              {t("admin.orders.subtotal")}: {formatMoney(locale, order.subtotal_poisha)} ·{" "}
              {t("admin.orders.deliveryFee")}: {formatMoney(locale, order.delivery_charge_poisha)}
            </span>
            <span className="font-display text-2xl">
              {formatMoney(locale, order.total_poisha)}
            </span>
          </div>
        </div>
      </header>

      {/* Lines panel */}
      <section className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 desktop:p-6">
        <h2 className="font-display text-2xl font-normal">{t("admin.orders.lines")}</h2>
        <ul className="flex flex-col gap-3">
          {order.items.map((item) => {
            const assignment = item.shop_assignment_id
              ? assignmentById.get(item.shop_assignment_id)
              : undefined;
            const candidates = candidatesByItem[item.id] ?? [];
            const isExpanded = expandedItemId === item.id;
            return (
              <li key={item.id} className="flex flex-col gap-3 rounded-control border border-line p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span lang="la" className="font-display text-xl italic">
                      {item.remedy_name}
                    </span>
                    <span className="text-sm text-ink-soft">
                      {item.potency ? `${item.potency} · ` : ""}
                      {item.form ? `${t(`admin.remedy.form.${item.form}`)} · ` : ""}
                      {t("admin.orders.qty")}: {numberFormat(locale).format(item.quantity)} ·{" "}
                      {formatMoney(locale, item.line_total_poisha)}
                    </span>
                  </div>

                  {item.shop_assignment_id ? (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="rounded-control bg-mist px-3 py-1 text-sm font-semibold">
                        {item.shop_name}
                      </span>
                      {item.shop_unit_price_poisha !== null && (
                        <span className="text-sm text-ink-muted">
                          {formatMoney(locale, item.shop_unit_price_poisha)}
                          {item.pack_label ? ` (${item.pack_label})` : ""}
                        </span>
                      )}
                      {canManage && assignment?.status === "ASSIGNED" && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => unassign(item.id)}
                          className="min-h-11 px-2 text-sm font-semibold text-danger underline"
                        >
                          {t("admin.orders.unassign")}
                        </button>
                      )}
                    </div>
                  ) : (
                    canAssignOrder && (
                      <button
                        type="button"
                        onClick={() => void toggleCandidates(item)}
                        className="min-h-11 rounded-control border border-amber bg-amber-wash px-4 text-sm font-semibold text-ink"
                      >
                        {t("admin.orders.chooseShop")}
                      </button>
                    )
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-line pt-3">
                    {candidatesLoading === item.id ? (
                      <p role="status" className="text-sm text-ink-muted">
                        {t("admin.loading")}
                      </p>
                    ) : candidates.length === 0 ? (
                      <p className="text-sm text-ink-muted">{t("admin.orders.noCandidates")}</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {candidates.map((cand) => (
                          <li
                            key={cand.shop_remedy_id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-ground/60 px-3 py-2.5"
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{cand.shop_name}</span>
                                <AreaMatchBadge match={cand.area_match} />
                              </div>
                              <span className="text-sm text-ink-soft">
                                {numberFormat(locale).format(cand.pack_size)}{" "}
                                {t(`admin.shop.unit.${cand.unit}`)} ·{" "}
                                {formatMoney(locale, cand.price_poisha)} ·{" "}
                                {fill(t("admin.orders.freeStock"), {
                                  count: numberFormat(locale).format(cand.free_stock),
                                })}
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => assign(item.id, cand.shop_remedy_id)}
                              className="min-h-11 rounded-control bg-primary px-4 text-sm font-bold text-surface disabled:opacity-50"
                            >
                              {t("admin.orders.assign")}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Shops panel */}
      <section className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 desktop:p-6">
        <h2 className="font-display text-2xl font-normal">{t("admin.orders.shops")}</h2>
        {order.assignments.length === 0 ? (
          <p className="text-ink-muted">{t("admin.orders.noAssignments")}</p>
        ) : (
          <div className="grid gap-4 desktop:grid-cols-2">
            {order.assignments.map((assignment) => {
              const currentStatus = assignment.status ?? "ASSIGNED";
              return (
                <article
                  key={assignment.id}
                  className="flex flex-col gap-3 rounded-control border border-line p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-xl">{assignment.shop_name}</h3>
                    <span className="font-display text-lg">
                      {formatMoney(locale, assignment.shop_total_poisha ?? 0)}
                    </span>
                  </div>

                  {/* Step indicator */}
                  {currentStatus === "RETURNED" || currentStatus === "CANCELLED" ? (
                    <p
                      className={`text-sm font-semibold ${
                        currentStatus === "CANCELLED" ? "text-danger" : "text-ink-muted"
                      }`}
                    >
                      {t(`admin.orders.assignStatus.${currentStatus}`)}
                    </p>
                  ) : (
                    <p className="text-xs text-ink-muted">
                      {ASSIGNMENT_STEPS.map((step, index) => (
                        <span key={step}>
                          {index > 0 && " · "}
                          <span className={step === currentStatus ? "font-bold text-primary" : ""}>
                            {t(`admin.orders.assignStatus.${step}`)}
                          </span>
                        </span>
                      ))}
                    </p>
                  )}

                  <ul className="flex flex-col gap-1 border-t border-line pt-2 text-sm text-ink-soft">
                    {assignment.items.map((line) => (
                      <li key={line.id} className="flex justify-between gap-2">
                        <span>
                          <span lang="la" className="italic">
                            {line.remedy_name}
                          </span>{" "}
                          × {numberFormat(locale).format(line.quantity)}
                        </span>
                        <span>
                          {line.shop_unit_price_poisha != null
                            ? formatMoney(locale, line.shop_unit_price_poisha * line.quantity)
                            : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {assignment.cod_collected_poisha !== null &&
                    assignment.cod_collected_poisha !== undefined && (
                      <p className="text-sm font-semibold text-primary-deep">
                        {fill(t("admin.orders.codCollected"), {
                          amount: formatMoney(locale, assignment.cod_collected_poisha),
                        })}
                      </p>
                    )}

                  {canManage && assignment.next_statuses.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
                      {assignment.next_statuses.includes("PROCESSING") && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => advance(assignment, "PROCESSING")}
                          className="min-h-11 rounded-control bg-primary px-4 text-sm font-bold text-surface disabled:opacity-50"
                        >
                          {t("admin.orders.action.PROCESSING")}
                        </button>
                      )}
                      {assignment.next_statuses.includes("SHIPPED") && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => advance(assignment, "SHIPPED")}
                          className="min-h-11 rounded-control bg-primary px-4 text-sm font-bold text-surface disabled:opacity-50"
                        >
                          {t("admin.orders.action.SHIPPED")}
                        </button>
                      )}
                      {assignment.next_statuses.includes("DELIVERED") && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (order.payment_method === "COD") {
                              openDeliverDialog(assignment);
                            } else {
                              advance(assignment, "DELIVERED");
                            }
                          }}
                          className="min-h-11 rounded-control bg-primary px-4 text-sm font-bold text-surface disabled:opacity-50"
                        >
                          {t("admin.orders.action.DELIVERED")}
                        </button>
                      )}
                      {assignment.next_statuses.includes("RETURNED") && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => advance(assignment, "RETURNED")}
                          className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink disabled:opacity-50"
                        >
                          {t("admin.orders.action.RETURNED")}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* History panel */}
      <section className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 desktop:p-6">
        <h2 className="font-display text-2xl font-normal">{t("admin.orders.history")}</h2>
        <ul className="flex flex-col gap-2.5">
          {order.history.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2.5 text-sm last:border-b-0 last:pb-0"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold">
                  {entry.shop_name ? `${entry.shop_name}: ` : ""}
                  {entry.from_status ? `${entry.from_status} → ` : ""}
                  {entry.to_status}
                </span>
                <span className="text-ink-muted">
                  {entry.by_patient
                    ? t("admin.orders.byPatient")
                    : entry.changed_by_name ?? "—"}
                  {entry.note ? ` · ${entry.note}` : ""}
                </span>
              </div>
              <span className="text-ink-muted">{formatDateTime(locale, entry.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* COD delivery dialog */}
      <dialog
        ref={deliverDialogRef}
        aria-labelledby="deliver-dialog-title"
        className="m-auto w-[min(92vw,440px)] rounded-panel border border-line bg-surface p-5 text-ink backdrop:bg-ink/40"
      >
        <div className="flex flex-col gap-4">
          <h2 id="deliver-dialog-title" className="font-display text-2xl font-normal">
            {t("admin.orders.action.DELIVERED")}
          </h2>
          <TextField
            label={t("admin.orders.cashCollected")}
            prefix="৳"
            inputMode="decimal"
            value={cashTaka}
            error={cashError}
            onChange={(event) => {
              setCashTaka(event.target.value);
              setCashError("");
            }}
          />
          <TextField
            label={t("admin.orders.note")}
            value={deliverNote}
            onChange={(event) => setDeliverNote(event.target.value)}
            maxLength={500}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => deliverDialogRef.current?.close()}
              className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold"
            >
              {t("admin.staff.cancel")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={confirmDeliver}
              className="min-h-11 rounded-control bg-primary px-5 font-bold text-surface disabled:opacity-60"
            >
              {t("admin.orders.confirm")}
            </button>
          </div>
        </div>
      </dialog>

      <ConfirmDialog
        open={cancelOpen}
        title={t("admin.orders.cancel")}
        confirmLabel={t("admin.orders.cancel")}
        cancelLabel={t("admin.staff.cancel")}
        tone="danger"
        pending={pending}
        error={cancelError}
        onConfirm={confirmCancel}
        onClose={() => setCancelOpen(false)}
      >
        <TextField
          label={t("admin.orders.cancelReason")}
          value={cancelReason}
          onChange={(event) => {
            setCancelReason(event.target.value);
            setCancelError("");
          }}
          maxLength={500}
        />
      </ConfirmDialog>
    </section>
  );
}
