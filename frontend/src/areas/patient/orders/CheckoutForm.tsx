"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import type { ApiClient } from "@/api/client";
import type { components } from "@/api/schema";
import { ActionBar } from "@/areas/patient/ActionBar";
import { TaskScreen } from "@/areas/patient/TaskScreen";
import { useCart } from "@/areas/patient/cart/CartProvider";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { LocationPicker } from "@/components/LocationPicker";
import { FormAlert, SegmentedChoice, TextAreaField, TextField } from "@/components/form/fields";
import { useDescribeErrorWith } from "@/hooks/use-describe-error";
import { useSubmitWith } from "@/hooks/use-submit";
import { fill } from "@/i18n/catalog";
import { formatMoney, numberFormat, remedyName } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

type Location = components["schemas"]["Location"];
type PaymentMethod = components["schemas"]["PaymentMethodEnum"];
type Quote = components["schemas"]["OrderQuoteResponse"];
type Patient = components["schemas"]["Patient"];

export function CheckoutForm() {
  const { locale, t } = useMessages<CommonMessages & PatientMessages>();
  const session = useSession();
  const router = useRouter();
  const { cart, refresh } = useCart();

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  if (isGuest) {
    return (
      <TaskScreen title={t("patient.checkout.title")} backHref="/cart">
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink-soft">{t("patient.checkout.guest")}</p>
          <Link
            href="/signin?next=/checkout"
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.signIn")}
          </Link>
        </div>
      </TaskScreen>
    );
  }

  if (session.status !== "signedIn" || !cart) {
    return (
      <TaskScreen title={t("patient.checkout.title")} backHref="/cart">
        <p role="status" className="text-ink-muted">
          {t("table.loading")}
        </p>
      </TaskScreen>
    );
  }

  if (cart.items.length === 0) {
    return (
      <TaskScreen title={t("patient.checkout.title")} backHref="/cart">
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="font-display text-2xl">{t("patient.cart.empty")}</p>
          <Link
            href="/remedies"
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.browse")}
          </Link>
        </div>
      </TaskScreen>
    );
  }

  return <SignedInCheckout patient={session.patient} cart={cart} refresh={refresh} api={session.api} router={router} locale={locale} t={t} />;
}

function SignedInCheckout({
  patient,
  cart,
  refresh,
  api,
  router,
  locale,
  t,
}: {
  patient: Patient;
  cart: NonNullable<ReturnType<typeof useCart>["cart"]>;
  refresh: () => Promise<void>;
  api: ApiClient;
  router: ReturnType<typeof useRouter>;
  locale: "en" | "bn";
  t: (key: keyof (CommonMessages & PatientMessages)) => string;
}) {
  const describe = useDescribeErrorWith("patient");
  const { pending, problems, setProblems, submit } = useSubmitWith(describe);

  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [recipientName, setRecipientName] = useState(patient.full_name);
  const [phone, setPhone] = useState(patient.phone.replace(/^\+880/, ""));
  const [area, setArea] = useState<Location | null>(patient.location);
  const [addressLine, setAddressLine] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [phoneUnverified, setPhoneUnverified] = useState(false);

  useEffect(() => {
    if (!area?.id) return;
    const controller = new AbortController();
    api
      .POST("/api/v1/orders/quote/", {
        body: { location_id: area.id },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) setQuote(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [api, area?.id, cart.subtotal_poisha]);

  function placeOrder(event: FormEvent) {
    event.preventDefault();
    const missing: Record<string, string> = {};
    const required = t("patient.error.required");
    if (!recipientName.trim()) missing.recipient_name = required;
    if (!phone.trim()) missing.phone = required;
    if (!area) missing.location_id = required;
    if (!addressLine.trim()) missing.address_line = required;
    if (Object.keys(missing).length > 0 || !area) {
      setProblems({ fields: missing, form: required });
      return;
    }

    setPhoneUnverified(false);
    void submit(
      () =>
        api.POST("/api/v1/orders/", {
          params: { header: { "Idempotency-Key": idempotencyKey } },
          body: {
            location_id: area.id,
            recipient_name: recipientName.trim(),
            phone: phone.trim(),
            address_line: addressLine.trim(),
            payment_method: paymentMethod,
          },
        }),
      async (order) => {
        await refresh();
        if (paymentMethod === "ONLINE") {
          const { data } = await api.POST("/api/v1/payments/", {
            body: { order_id: order.id },
          });
          if (data?.gateway_url) {
            window.location.assign(data.gateway_url);
            return;
          }
        }
        router.replace(`/orders/${order.id}?placed=1`);
      },
      (problem) => {
        const code = problem.error?.code;
        if (code === "PHONE_NOT_VERIFIED") {
          setPhoneUnverified(true);
          return true;
        }
        if (code === "CART_HAS_UNAVAILABLE" || code === "CART_EMPTY") {
          router.replace("/cart");
          return true;
        }
        return false;
      },
    );
  }

  const displayTotal = quote?.total_poisha ?? cart.subtotal_poisha;

  return (
    <TaskScreen title={t("patient.checkout.title")} backHref="/cart">
      <form onSubmit={placeOrder} noValidate className="flex flex-col gap-5">
        {phoneUnverified && (
          <FormAlert>
            {t("patient.checkout.verifyPhone")}{" "}
            <Link href="/profile" className="font-bold text-primary underline">
              {t("patient.checkout.verifyLink")}
            </Link>
          </FormAlert>
        )}
        {problems.form && <FormAlert>{problems.form}</FormAlert>}

        <section className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4 desktop:p-6">
          <h2 className="font-display text-2xl font-normal">{t("patient.checkout.delivery")}</h2>
          <TextField
            label={t("patient.checkout.recipient")}
            value={recipientName}
            error={problems.fields.recipient_name}
            onChange={(event) => setRecipientName(event.target.value)}
            maxLength={120}
            autoComplete="name"
          />
          <TextField
            label={t("patient.checkout.phone")}
            prefix="+880"
            type="tel"
            value={phone}
            error={problems.fields.phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel-national"
          />
          <LocationPicker
            value={area}
            onChange={(next) => {
              setArea(next);
              if (!next) setQuote(null);
            }}
            error={problems.fields.location_id}
          />
          <TextAreaField
            label={t("patient.checkout.address")}
            hint={t("patient.checkout.addressHint")}
            value={addressLine}
            error={problems.fields.address_line}
            onChange={(event) => setAddressLine(event.target.value)}
            maxLength={500}
            autoComplete="street-address"
          />
        </section>

        <section className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4 desktop:p-6">
          <h2 className="font-display text-2xl font-normal">{t("patient.checkout.payment")}</h2>
          <SegmentedChoice<PaymentMethod>
            legend={t("patient.checkout.paymentMethod")}
            name="payment_method"
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={[
              { value: "COD", label: t("patient.checkout.cod") },
              { value: "ONLINE", label: t("patient.checkout.online") },
            ]}
          />
        </section>

        <section className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 desktop:p-6">
          <h2 className="font-display text-2xl font-normal">{t("patient.checkout.summary")}</h2>
          <ul className="flex flex-col gap-2 border-b border-line pb-3 text-sm">
            {cart.items.map((item) => {
              const label = remedyName(locale, item.remedy.name, item.remedy.name_bn);
              return (
                <li key={item.id} className="flex items-baseline justify-between gap-2">
                  <span className="text-ink-soft">
                    <span lang={label.lang} className={`font-display ${label.style}`}>
                      {label.text}
                    </span>{" "}
                    ({item.potency} · {t(`patient.remedy.form.${item.form}`)}) ×{" "}
                    {numberFormat(locale).format(item.quantity)}
                  </span>
                  <span className="font-semibold">
                    {formatMoney(locale, item.line_total_poisha)}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-1.5 text-base">
            <div className="flex justify-between">
              <span className="text-ink-soft">{t("patient.cart.subtotal")}</span>
              <span>{formatMoney(locale, quote?.subtotal_poisha ?? cart.subtotal_poisha)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-soft">{t("patient.checkout.deliveryCharge")}</span>
              <span>
                {quote ? formatMoney(locale, quote.delivery_charge_poisha) : "—"}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
              <span className="font-semibold">{t("patient.checkout.total")}</span>
              <span className="font-display text-2xl font-normal">
                {formatMoney(locale, displayTotal)}
              </span>
            </div>
          </div>
        </section>

        <ActionBar>
          <button
            type="submit"
            disabled={pending || !area}
            className="flex min-h-[54px] w-full items-center justify-center rounded-control bg-primary px-5 text-[17px] font-bold text-surface disabled:opacity-60"
          >
            {fill(
              t(
                paymentMethod === "ONLINE"
                  ? "patient.checkout.continueToPayment"
                  : "patient.checkout.placeOrder",
              ),
              {
                total: formatMoney(locale, displayTotal),
              },
            )}
          </button>
        </ActionBar>
      </form>
    </TaskScreen>
  );
}
