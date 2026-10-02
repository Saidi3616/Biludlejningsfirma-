import "server-only";
import { createHash, createHmac } from "node:crypto";
import { assertStorageKey, type StorageProvider } from "./types";

export type S3Config = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  privateBucket: string;
};

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data).digest();

/** RFC 3986-kodning, som AWS kræver (også for `!*'()`). Skråstreger i stien bevares. */
function encodePath(value: string) {
  return value
    .split("/")
    .map((part) =>
      encodeURIComponent(part).replace(
        /[!*'()]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

/**
 * AWS Signature Version 4 for én forespørgsel uden query-parametre. Returnerer de headers,
 * der skal sendes. Skrevet uden SDK for at holde afhængighederne små; testet mod AWS'
 * eksempel i tests/unit/storage.test.ts.
 */
export function signS3Request(params: {
  method: string;
  url: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  headers: Record<string, string>;
  payloadHash: string;
  now: Date;
}): Record<string, string> {
  const amzDate = params.now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(params.headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
    ),
    host: params.url.host,
    "x-amz-content-sha256": params.payloadHash,
    "x-amz-date": amzDate,
  };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    params.method,
    encodePath(decodeURIComponent(params.url.pathname)),
    "",
    names.map((name) => `${name}:${headers[name]}\n`).join(""),
    signedHeaders,
    params.payloadHash,
  ].join("\n");
  const scope = `${date}/${params.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${params.secretAccessKey}`, date), params.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  // fetch sætter selv Host-headeren.
  const sent = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "host"));
  return {
    ...sent,
    authorization: `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** S3-kompatibel storage (Cloudflare R2 eller AWS S3) med path-style adresser. */
export function s3StorageProvider(config: S3Config): StorageProvider {
  const request = async (method: string, key: string, body?: Uint8Array, contentType?: string) => {
    assertStorageKey(key);
    const bucket = key.startsWith("public/") ? config.publicBucket : config.privateBucket;
    const url = new URL(`${config.endpoint.replace(/\/$/, "")}/${bucket}/${encodePath(key)}`);
    const headers = signS3Request({
      method,
      url,
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      headers: contentType ? { "content-type": contentType } : {},
      payloadHash: sha256(body ?? ""),
      now: new Date(),
    });
    return fetch(url, { method, headers, body: body ? Buffer.from(body) : undefined });
  };
  const fail = (method: string, response: Response): never => {
    // Kun status logges/kastes; nøgler og svarets indhold kan indeholde følsomme data.
    throw new Error(`Storage ${method} fejlede med status ${response.status}`);
  };
  return {
    async put(key, body, contentType) {
      const response = await request("PUT", key, body, contentType);
      if (!response.ok) fail("PUT", response);
    },
    async get(key) {
      const response = await request("GET", key);
      if (response.status === 404) return null;
      if (!response.ok) fail("GET", response);
      return {
        body: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
      };
    },
    async delete(key) {
      const response = await request("DELETE", key);
      if (!response.ok && response.status !== 404) fail("DELETE", response);
    },
  };
}
