export function cardLast4(cardNumber: string | null | undefined): string | null {
  return cardNumber ? cardNumber.slice(-4) : null;
}
