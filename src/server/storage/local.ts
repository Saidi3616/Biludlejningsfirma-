import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertStorageKey, type StorageProvider } from "./types";

/** Lokal mappe til udvikling og test. Indholdstypen gemmes i en fil ved siden af. */
export function localStorageProvider(root: string): StorageProvider {
  const file = (key: string) => {
    assertStorageKey(key);
    return path.join(root, ...key.split("/"));
  };
  return {
    async put(key, body, contentType) {
      const target = file(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
      await writeFile(`${target}.type`, contentType);
    },
    async get(key) {
      const target = file(key);
      try {
        const [body, contentType] = await Promise.all([
          readFile(target),
          readFile(`${target}.type`, "utf8"),
        ]);
        return { body: new Uint8Array(body), contentType };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      const target = file(key);
      await rm(target, { force: true });
      await rm(`${target}.type`, { force: true });
    },
  };
}
