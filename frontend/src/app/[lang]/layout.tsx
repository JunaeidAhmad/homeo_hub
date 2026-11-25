import type { Metadata, Viewport } from "next";
import { Anek_Bangla, Tiro_Bangla } from "next/font/google";
import { LOCALES } from "@/i18n/config";
import { common } from "@/i18n/messages/common";
import { getLocale, getTranslator } from "@/i18n/server";

import "../globals.css";

const tiroBangla = Tiro_Bangla({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["bengali", "latin"],
  variable: "--font-tiro-bangla",
  display: "swap",
});

// Variable font: weight 100-800 and a width axis (the UI is set at 110% width).
const anekBangla = Anek_Bangla({
  subsets: ["bengali", "latin"],
  axes: ["wdth"],
  variable: "--font-anek-bangla",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator(common);
  return {
    title: { default: "HomeoHub", template: "%s · HomeoHub" },
    description: t("app.description"),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets bars use env(safe-area-inset-bottom) on notched phones
  themeColor: "#1e6b4e",
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ lang: locale }));
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  return (
    <html
      lang={await getLocale()}
      className={`${tiroBangla.variable} ${anekBangla.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
