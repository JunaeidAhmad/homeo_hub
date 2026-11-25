"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Messages } from "./catalog";
import type { Locale } from "./config";

type I18n = { locale: Locale; messages: Messages };

const I18nContext = createContext<I18n | null>(null);

/** Hands one language's messages (chosen on the server) to client components. */
export function I18nProvider({
  locale,
  messages,
  children,
}: I18n & { children: ReactNode }) {
  return <I18nContext value={{ locale, messages }}>{children}</I18nContext>;
}

/** `M` is the message type of the area the component lives in, so keys are checked. */
export function useMessages<M extends Messages = Messages>() {
  const context = useContext(I18nContext);
  if (!context)
    throw new Error("useMessages must be used inside an I18nProvider");
  const { locale, messages } = context;
  return {
    locale,
    t: (key: keyof M & string): string => messages[key] ?? key,
  };
}
