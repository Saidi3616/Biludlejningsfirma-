/**
 * Fil-storage bag et interface (01-systemarkitektur.md, princip 5). Nøgler starter med
 * `public/` (bilbilleder, må vises for alle) eller `private/` (inspektionsfotos, skader,
 * kørekort, kontrakter: kun via admin efter adgangstjek).
 */
export type StoredObject = { body: Uint8Array; contentType: string };

export interface StorageProvider {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** null, hvis objektet ikke findes. */
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

const KEY = /^(public|private)\/[a-z0-9-]+(\/[a-z0-9-]+)*\/[a-z0-9-]+\.[a-z0-9]{2,5}$/;

/** Nøgler laves af systemet; alt andet (fx "..") afvises, før det rammer disken eller S3. */
export function assertStorageKey(key: string) {
  if (!KEY.test(key)) throw new Error("Ugyldig storage-nøgle");
}
