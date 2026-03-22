import { ObjectManager } from "@filebase/sdk";

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

/** Public gateway base (no trailing slash). Override with FILEBASE_IPFS_GATEWAY for dedicated gateways. */
export function getIpfsGatewayBase(): string {
  return (process.env.FILEBASE_IPFS_GATEWAY ?? "https://ipfs.filebase.io/ipfs").replace(
    /\/$/,
    "",
  );
}

export type IpfsUploadResult = {
  cid: string;
  gatewayUrl: string;
  ipfsUri: string;
};

/**
 * Upload bytes to Filebase IPFS via ObjectManager. Returns CID and HTTP gateway URL.
 */
export async function uploadBufferToIpfs(
  key: string,
  body: Buffer | Uint8Array,
): Promise<IpfsUploadResult> {
  const creds = getFilebaseCredentials();
  if (!creds) {
    throw new Error(
      "FILEBASE_ACCESS_KEY, FILEBASE_SECRET_KEY, and FILEBASE_BUCKET must be set for IPFS uploads.",
    );
  }
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const objectManager = new ObjectManager(creds.accessKey, creds.secretKey, {
    bucket: creds.bucket,
  });
  // SDK typings require metadata/options; runtime treats them as optional.
  const uploaded = (await objectManager.upload(key, buf, {}, {})) as { cid: string };
  const cid = uploaded.cid;
  if (!cid) {
    throw new Error("Filebase upload did not return a CID.");
  }
  const base = getIpfsGatewayBase();
  const gatewayUrl = `${base}/${cid}`;
  return { cid, gatewayUrl, ipfsUri: `ipfs://${cid}` };
}

export function isFilebaseConfigured(): boolean {
  return getFilebaseCredentials() !== null;
}
