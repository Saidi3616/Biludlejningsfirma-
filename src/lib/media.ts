/** Adresse til et offentligt billede i storage, fx `public/models/…` → `/media/models/…`. */
export function mediaUrl(storageKey: string): string {
  return `/media/${storageKey.replace(/^public\//, "")}`;
}
