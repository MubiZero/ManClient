import { retryReceiptSubmissions } from "@/core/payments/receipt-submission-service";

void retryReceiptSubmissions()
  .then((count) => console.log(`Processed ${count} receipt submissions`))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
