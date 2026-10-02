"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type PhotoUploadResult = { ok: true } | { ok: false; error: PhotoUploadError };
export type PhotoUploadError = "notImage" | "tooLarge" | "tooMany" | "forbidden" | "failed";

type Action = (formData: FormData) => Promise<PhotoUploadResult>;

/** Længste side efter nedskalering i browseren. Serveren skalerer og renser igen. */
const MAX_SIDE = 2000;
/** Under serverens grænse for én upload (next.config.ts), med plads til formularens overhead. */
const MAX_BYTES = 5.5 * 1024 * 1024;

/**
 * Skalerer et foto ned til JPEG i browseren, så uploads er små på mobilnet. Kan browseren
 * ikke læse formatet (fx HEIC i Chrome), sendes originalen, og serveren tager sig af det.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Tag eller vælg fotos. De uploades ét ad gangen (mobilvenligt: inspektioner foregår på
 * parkeringspladsen), og siden genindlæses bagefter, så billederne vises.
 */
export function PhotoUpload({
  action,
  fields,
  label,
}: {
  action: Action;
  /** Skjulte felter, fx `{ inspectionId }`. */
  fields: Record<string, string>;
  label: string;
}) {
  const t = useTranslations("admin.photos");
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<PhotoUploadError[]>([]);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setErrors([]);
    const failed: PhotoUploadError[] = [];
    for (const [index, file] of files.entries()) {
      setProgress({ done: index, total: files.length });
      const photo = await shrink(file);
      if (photo.size > MAX_BYTES) {
        failed.push("tooLarge");
        continue;
      }
      const formData = new FormData();
      for (const [name, value] of Object.entries(fields)) formData.set(name, value);
      formData.set("photo", photo, "photo.jpg");
      try {
        const result = await action(formData);
        if (!result.ok) failed.push(result.error);
      } catch {
        failed.push("failed");
      }
    }
    setProgress(null);
    setErrors(failed);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  const busy = progress !== null;
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className={cn(
          buttonVariants({ variant: "secondary" }),
          "cursor-pointer self-start has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <Camera aria-hidden />
        {label}
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          className="sr-only"
          onChange={(event) => upload(Array.from(event.target.files ?? []))}
        />
      </label>
      <p role="status" className="text-sm text-muted">
        {busy ? t("uploading", { done: progress.done + 1, total: progress.total }) : t("hint")}
      </p>
      {errors.length > 0 ? (
        <ul role="alert" className="text-sm font-medium text-danger-700">
          {[...new Set(errors)].map((error) => (
            <li key={error}>{t(`errors.${error}`)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
