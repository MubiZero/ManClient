import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type LogoObject = {
  body: Uint8Array;
  contentType: string;
};

export async function storeLogo(businessId: string, body: Uint8Array, contentType: string): Promise<string> {
  const storageKey = `logos/${businessId}.png`;
  await createClient().send(new PutObjectCommand({ Bucket: getBucket(), Key: storageKey, Body: body, ContentType: contentType }));
  return storageKey;
}

export async function getLogo(storageKey: string): Promise<LogoObject> {
  const response = await createClient().send(new GetObjectCommand({ Bucket: getBucket(), Key: storageKey }));
  if (!response.Body) throw new Error("Logo body is missing");
  return { body: await response.Body.transformToByteArray(), contentType: response.ContentType ?? "image/png" };
}

export async function deleteLogo(storageKey: string): Promise<void> {
  await createClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: storageKey }));
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
