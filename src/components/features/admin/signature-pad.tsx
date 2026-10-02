"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Canvasets opløsning. Det skaleres i bredden med CSS; serveren tjekker og renser billedet. */
const WIDTH = 800;
const HEIGHT = 300;
/** Stregens farve: brand-900 fra design-tokens. */
const INK = "#0b2c33";

/**
 * Underskrift med finger, pen eller mus. Billedet lægges som PNG-data-URL i et skjult felt, så
 * den omgivende formular sender det med. Tomt felt = tom værdi (serveren afviser det).
 */
export function SignaturePad({ name, labelId }: { name: string; labelId: string }) {
  const t = useTranslations("admin.contract");
  const hintId = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = INK;
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    setValue(event.currentTarget.toDataURL("image/png"));
  }

  function clear() {
    const context = canvas.current?.getContext("2d");
    context?.clearRect(0, 0, WIDTH, HEIGHT);
    setValue("");
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvas}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        data-testid="signature-pad"
        className="aspect-[8/3] w-full touch-none rounded-md border-2 border-dashed border-ink-300 bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={hintId} className="text-sm text-muted">
          {t("signatureHint")}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!value}>
          <Eraser aria-hidden />
          {t("clear")}
        </Button>
      </div>
    </div>
  );
}
