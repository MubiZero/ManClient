type PaymentUrlInput = {
  cardNumber: string;
  amountDiram: number;
  bookingReference: string;
};

export function createPaymentUrl(input: PaymentUrlInput): URL {
  if (!/^\d{16,19}$/.test(input.cardNumber)) {
    throw new Error("Card number must contain 16 to 19 digits");
  }

  if (!Number.isInteger(input.amountDiram) || input.amountDiram <= 0) {
    throw new Error("Payment amount must be a positive integer of dirams");
  }

  // https, not http: the card number and the amount ride in the query string, and plain http hands
  // them to anyone sharing the salon's Wi-Fi.
  const url = new URL("https://pay.expresspay.tj/");
  url.searchParams.set("A", input.cardNumber);
  url.searchParams.set("s", (input.amountDiram / 100).toFixed(2));
  url.searchParams.set("c", input.bookingReference);
  url.searchParams.set("f1", "133");

  return url;
}
