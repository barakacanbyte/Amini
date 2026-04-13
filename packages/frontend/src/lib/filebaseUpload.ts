import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { buildIpfsGatewayUrl, resolveIpfsGatewayBase } from "@/lib/ipfsGatewayUrl";

export type FilebaseCredentials = {
  accessKey: string;
  secretKey: string;
  bucket: string;
};

/**
 * Filebase S3 keys + bucket. Required for server-side IPFS uploads.
 */
export function getFilebaseCredentials(): FilebaseCredentials | null {
  const accessKey = process.env.FILEBASE_ACCESS_KEY;
  const secretKey = process.env.FILEBASE_SECRET_KEY;
  const bucket = process.env.FILEBASE_BUCKET;
  if (!accessKey || !secretKey || !bucket) return null;
  return { accessKey, secretKey, bucket };
}

/** Public gateway base (no trailing slash). Prefer {@link buildIpfsGatewayUrl} from `./ipfsGatewayUrl`. */
export function getIpfsGatewayBase(): string {
  return resolveIpfsGatewayBase();
}

export { buildIpfsGatewayUrl } from "@/lib/ipfsGatewayUrl";

export type IpfsUploadResult = {
  cid: string;
  gatewayUrl: string;
  ipfsUri: string;
};

const FILEBASE_S3_ENDPOINT = "https://s3.filebase.com";
const FILEBASE_S3_REGION = "us-east-1";

function filebaseS3Client(accessKey: string, secretKey: string): S3Client {
  return new S3Client({
    region: FILEBASE_S3_REGION,
    endpoint: FILEBASE_S3_ENDPOINT,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: true,
  });
}

/**
 * Upload bytes to Filebase (S3-compatible) IPFS bucket. Uses PutObject + HeadObject for the
 * resulting CID — avoids @filebase/sdk + @aws-sdk/lib-storage, which can break under Next/webpack
 * (`endpointFunctions[fn] is not a function`).
 */
export async function uploadBufferToIpfs(
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string,
): Promise<IpfsUploadResult> {
  const creds = getFilebaseCredentials();
  if (!creds) {
    throw new Error(
      "FILEBASE_ACCESS_KEY, FILEBASE_SECRET_KEY, and FILEBASE_BUCKET must be set for IPFS uploads.",
    );
  }
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const client = filebaseS3Client(creds.accessKey, creds.secretKey);

  await client.send(
    new PutObjectCommand({
      Bucket: creds.bucket,
      Key: key,
      Body: buf,
      ...(contentType ? { ContentType: contentType } : {}),
    }),
  );

  const head = await client.send(
    new HeadObjectCommand({
      Bucket: creds.bucket,
      Key: key,
    }),
  );

  const meta = head.Metadata ?? {};
  const cid =
    (typeof meta.cid === "string" && meta.cid.trim()) ||
    (typeof meta.Cid === "string" && meta.Cid.trim()) ||
    Object.entries(meta).find(([k]) => k.toLowerCase() === "cid")?.[1]?.trim();
  if (!cid) {
    throw new Error(
      "Filebase did not return a CID on the object (expected x-amz-meta-cid / Metadata.cid after upload).",
    );
  }

  const gatewayUrl = buildIpfsGatewayUrl(cid);
  return { cid, gatewayUrl, ipfsUri: `ipfs://${cid}` };
}

export function isFilebaseConfigured(): boolean {
  return getFilebaseCredentials() !== null;
}
