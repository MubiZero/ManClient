import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type StoreReceiptInput = {
  storageKey: string;
  contentType: string;
  body: Uint8Array;
};

export async function storeReceipt(input: StoreReceiptInput): Promise<string> {
  const client = createClient();
  const bucket = getBucket();

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.storageKey,
    Body: input.body,
    ContentType: input.contentType,
  }));

  return input.storageKey;
}

export async function getReceipt(storageKey: string): Promise<{ body: Uint8Array; contentType: string }> {
  const response = await createClient().send(new GetObjectCommand({ Bucket: getBucket(), Key: storageKey }));
  if (!response.Body) throw new Error("Receipt body is missing");
  return { body: await response.Body.transformToByteArray(), contentType: response.ContentType ?? "image/jpeg" };
}

function createClient() {
  return new S3Client({
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
}

function getBucket() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET is required");
  }

  return bucket;
}
