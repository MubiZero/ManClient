import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export function encryptCardNumber(cardNumber: string, encodedKey: string): string {
  const key = decodeKey(encodedKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(cardNumber, "utf8"), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return [iv, authenticationTag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptCardNumber(encryptedCardNumber: string, encodedKey: string): string {
  const key = decodeKey(encodedKey);
  const [ivValue, authenticationTagValue, ciphertextValue] = encryptedCardNumber.split(".");
  if (!ivValue || !authenticationTagValue || !ciphertextValue) {
    throw new Error("Encrypted card number has an invalid format");
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(authenticationTagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("CARD_ENCRYPTION_KEY must decode to 32 bytes");
  }

  return key;
}
