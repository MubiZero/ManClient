import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "ManClient - онлайн-запись для сервисного бизнеса",
  description: "Онлайн-запись, подтверждение оплаты и напоминания для сервисного бизнеса в Таджикистане.",
  openGraph: {
    title: "ManClient - онлайн-запись для сервисного бизнеса",
    description: "Принимайте записи, подтверждайте оплату и напоминайте клиентам о визите.",
    locale: "ru_TJ",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "ManClient - онлайн-запись для сервисного бизнеса",
    description: "Принимайте записи, подтверждайте оплату и напоминайте клиентам о визите.",
  },
};

const themeInitScript = `(function () {
  try {
    var stored = localStorage.getItem("manclient-theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  } catch (_) {}
})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
