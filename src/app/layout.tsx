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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
