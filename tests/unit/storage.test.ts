import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { localStorageProvider } from "@/server/storage/local";
import { signS3Request } from "@/server/storage/s3";
import { assertStorageKey } from "@/server/storage/types";

describe("S3 Signature V4", () => {
  it("giver samme signatur som AWS' eksempel (GET Object med Range)", () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
    const headers = signS3Request({
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      headers: { Range: "bytes=0-9" },
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
    expect(headers["x-amz-date"]).toBe("20130524T000000Z");
  });
});

describe("storage-nøgler", () => {
  it("tillader kun systemets egne nøgler", () => {
    expect(() => assertStorageKey("public/models/abc-123/photo-1.webp")).not.toThrow();
    expect(() => assertStorageKey("private/inspection/abc/def.jpg")).not.toThrow();
    for (const bad of [
      "../etc/passwd",
      "public/../x.jpg",
      "other/x/y.jpg",
      "public/x.jpg",
      "private/A/b.jpg",
    ]) {
      expect(() => assertStorageKey(bad)).toThrow();
    }
  });
});

describe("lokal storage", () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("gemmer, henter og sletter", async () => {
    root = await mkdtemp(path.join(tmpdir(), "storage-"));
    const store = localStorageProvider(root);
    const key = "private/inspection/abc/def.jpg";
    await store.put(key, new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(await store.get(key)).toEqual({
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
    });
    await store.delete(key);
    expect(await store.get(key)).toBeNull();
  });
});
