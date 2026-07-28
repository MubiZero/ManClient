import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type StoreReceiptInput = {
  storageKey: string;
  contentType: string;
  body: Uint8Array;
};

export async function storeReceipt(input: StoreReceiptInput): Promise<string> {
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET is required");
  }

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.storageKey,
    Body: input.body,
    ContentType: input.contentType,
  }));

  return input.storageKey;
}
