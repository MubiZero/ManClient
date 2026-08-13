import { notFound, redirect } from "next/navigation";

import { requireBusinessSession } from "@/core/auth/business-session";
import { bookingQrSvg, bookingQrTarget, printableSizeMm, type PrintFormat } from "@/core/branding/booking-qr";
import { prisma } from "@/core/database/prisma";

type PageProps = { searchParams: Promise<{ format?: string }> };

const FORMATS: PrintFormat[] = ["sticker", "tent", "poster", "card"];

/**
 * A print-ready sheet: exact paper size, no chrome, ready for the browser's own print dialogue.
 *
 * The text is deliberately thin. A salon prints these once and leaves them up for a year, so nothing
 * that goes stale is on them — no prices, no promotions, no specialist names. What remains is the
 * salon's name, one line of instruction in both languages, the code, and the address to type when the
 * code is scratched.
 */
export default async function MaterialsPrintPage({ searchParams }: PageProps) {
  const { format } = await searchParams;
  // A stale or mistyped link goes back to the list rather than to an error: the owner came here to
  // print something, and an empty sheet is the one outcome worth preventing.
  if (!format || !FORMATS.includes(format as PrintFormat)) redirect("/dashboard/settings/materials");

  const membership = await requireBusinessSession();
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: membership.businessId },
    select: { name: true, slug: true },
  });
  const target = bookingQrTarget(process.env.APP_URL ?? "", business.slug);
  if (!target) notFound();

  const size = printableSizeMm(format as PrintFormat);
  const code = await bookingQrSvg(target.url, size.code);
  const compact = format === "card";

  return (
    <>
      <style>{`
        @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
        @media print { .sheet { break-inside: avoid; } .no-print { display: none; } }
      `}</style>
      <div className="no-print mx-auto max-w-md p-4 text-sm text-muted-foreground">
        Нажмите «Печать» в браузере. Размер бумаги уже задан: {size.width}×{size.height} мм.
      </div>
      <div
        className="sheet mx-auto flex flex-col items-center justify-center gap-[3mm] bg-white p-[6mm] text-center text-black"
        style={{ width: `${size.width}mm`, height: `${size.height}mm` }}
      >
        <p className={compact ? "text-[10pt] font-semibold" : "text-[14pt] font-semibold"}>{business.name}</p>
        <div style={{ width: `${size.code}mm`, height: `${size.code}mm` }} className="[&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: code }} />
        {/* Both languages on one line, Tajik first: this is printed for Tajikistan. */}
        <p className={compact ? "text-[7pt]" : "text-[10pt]"}>Сабти онлайн · Запись онлайн</p>
        <p className={compact ? "font-mono text-[6pt]" : "font-mono text-[8pt]"}>{target.readable}</p>
      </div>
    </>
  );
}
