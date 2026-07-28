import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import english from "@tesseract.js-data/eng";
import russian from "@tesseract.js-data/rus";

type ParsedLines = {
  statusText: string;
  date: string;
  time: string;
  operationNumber: string;
  recipientCard: string;
  amount: string;
};

const REFERENCE_WIDTH = 1272;
const REFERENCE_HEIGHT = 1418;
const numericRegions = {
  date: { left: 780, top: 260, width: 450, height: 75 },
  time: { left: 780, top: 360, width: 450, height: 75 },
  operationNumber: { left: 780, top: 460, width: 450, height: 75 },
  recipientCard: { left: 700, top: 760, width: 530, height: 80 },
  amount: { left: 900, top: 860, width: 330, height: 85 },
} as const;

export async function recognizeDushanbeCityReceipt(image: Uint8Array) {
  const metadata = await sharp(image).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Receipt image dimensions are missing");

  const russianWorker = await createWorker(russian.code, 1, {
    langPath: russian.langPath,
    gzip: russian.gzip,
    cacheMethod: "none",
  });
  const englishWorker = await createWorker(english.code, 1, {
    langPath: english.langPath,
    gzip: english.gzip,
    cacheMethod: "none",
  });

  try {
    const statusText = (await russianWorker.recognize(Buffer.from(image))).data.text;
    await englishWorker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      tessedit_char_whitelist: "0123456789.:",
    });
    const values = await Promise.all(Object.values(numericRegions).map(async (region) => {
      const crop = scaleRegion(region, metadata.width!, metadata.height!);
      const prepared = await sharp(image).extract(crop).grayscale().normalize().resize({ width: crop.width * 3 }).png().toBuffer();
      return (await englishWorker.recognize(prepared)).data.text.trim();
    }));

    return parseDushanbeCityReceipt({
      statusText,
      date: values[0],
      time: values[1],
      operationNumber: values[2],
      recipientCard: values[3],
      amount: values[4],
    });
  } finally {
    await Promise.all([russianWorker.terminate(), englishWorker.terminate()]);
  }
}

export function parseDushanbeCityReceipt(lines: ParsedLines) {
  const dateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(lines.date.trim());
  const timeMatch = /^(\d{2}):(\d{2}):(\d{2})$/.exec(lines.time.trim());
  const operationNumber = lines.operationNumber.replace(/\D/g, "");
  const recipientCard = lines.recipientCard.replace(/\D/g, "");
  const amountMatch = /^(\d+)[.,](\d{2})$/.exec(lines.amount.trim());
  if (!dateMatch || !timeMatch || !/^\d{6,32}$/.test(operationNumber) || recipientCard.length < 4 || !amountMatch) {
    throw new Error("Receipt fields could not be recognized reliably");
  }

  const operationAt = new Date(`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}+05:00`);
  return {
    operationNumber,
    amountDiram: Number(amountMatch[1]) * 100 + Number(amountMatch[2]),
    recipientCardSuffix: recipientCard.slice(-4),
    operationAt,
    isSuccessful: /статус\s*:\s*успешн(?:ый|ая|о)/iu.test(lines.statusText),
  };
}

function scaleRegion(region: { left: number; top: number; width: number; height: number }, width: number, height: number) {
  const scaleX = width / REFERENCE_WIDTH;
  const scaleY = height / REFERENCE_HEIGHT;
  return {
    left: Math.round(region.left * scaleX),
    top: Math.round(region.top * scaleY),
    width: Math.round(region.width * scaleX),
    height: Math.round(region.height * scaleY),
  };
}
