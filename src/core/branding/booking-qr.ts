import QRCode from "qrcode";

/**
 * The code a salon prints and sticks on its mirror.
 *
 * A sticker outlives the deploy that produced it, so everything about it is chosen to still work in a
 * year: an ordinary https address rather than a custom scheme that dies with the app, the salon's own
 * slug, and the highest error correction so a scratch or a coat of lacquer does not kill the code.
 */

export type PrintFormat = "sticker" | "tent" | "poster" | "card";

/**
 * Paper sizes in millimetres, and how large the code itself is on each. The code follows the rule of
 * thumb of one tenth of the reading distance: a mirror sticker is read at arm's length, a door poster
 * from a metre, a card from twenty centimetres.
 */
const FORMATS: Record<PrintFormat, { width: number; height: number; code: number; label: string }> = {
  sticker: { width: 100, height: 100, code: 45, label: "Наклейка на зеркало, 100×100 мм" },
  tent: { width: 105, height: 148, code: 60, label: "Настольная табличка, A6" },
  poster: { width: 148, height: 210, code: 90, label: "Плакат на дверь, A5" },
  card: { width: 90, height: 50, code: 20, label: "Визитка, 90×50 мм" },
};

export function printableSizeMm(format: PrintFormat) {
  return FORMATS[format];
}

export function printFormats(): Array<{ format: PrintFormat; label: string }> {
  return (Object.keys(FORMATS) as PrintFormat[]).map((format) => ({ format, label: FORMATS[format].label }));
}

export type BookingQrTarget = {
  /** What the code encodes, with the source marked so scans can be told from links later. */
  url: string;
  /** What is printed next to the code: when the code is scratched, this is what gets typed. */
  readable: string;
};

export function bookingQrTarget(appUrl: string, businessSlug: string): BookingQrTarget | null {
  const base = appUrl.trim().replace(/\/+$/, "");
  if (!base) return null;

  const path = `/b/${businessSlug}`;
  return {
    url: `${base}${path}?src=qr`,
    readable: `${base.replace(/^https?:\/\//, "")}${path}`,
  };
}

/**
 * The code as SVG, so it scales to any of the paper sizes without going soft. Pure black on white and
 * a four-module quiet zone: a cheap phone camera under salon lighting fails on a code tinted with the
 * brand colour, and that failure is silent — the customer simply walks away.
 */
export function bookingQrSvg(url: string, sizeMm: number): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
    width: Math.round(sizeMm * 8),
  });
}
