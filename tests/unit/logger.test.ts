import { describe, expect, it } from "vitest";
import pino from "pino";
import { Writable } from "node:stream";
import { REDACTED_KEYS } from "@/lib/logger";

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const redactPaths = REDACTED_KEYS.flatMap((key) => [key, `*.${key}`]);
  const log = pino({ redact: { paths: redactPaths, censor: "[REDACTED]" } }, stream);
  return { log, lines };
}

describe("logger redaction", () => {
  it("fjerner følsomme felter på topniveau og ét niveau nede", () => {
    const { log, lines } = captureLogger();
    log.info(
      {
        password: "hunter2",
        customer: { email: "a@b.dk", licenseNumber: "123" },
        bookingId: "BK-1",
      },
      "test",
    );
    const output = lines.join("");
    expect(output).not.toContain("hunter2");
    expect(output).not.toContain("a@b.dk");
    expect(output).not.toContain('123"');
    expect(output).toContain("BK-1");
  });
});
