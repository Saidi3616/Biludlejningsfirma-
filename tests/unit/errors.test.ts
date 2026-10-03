import { describe, expect, it } from "vitest";
import { AppError, toErrorBody } from "@/lib/errors";

describe("AppError", () => {
  it("mapper fejlkode til HTTP-status og API-format", () => {
    const error = new AppError("NOT_FOUND", "Bilen findes ikke.", { slug: "x" });
    expect(error.status).toBe(404);
    expect(toErrorBody(error, "req_1")).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Bilen findes ikke.",
        details: { slug: "x" },
        requestId: "req_1",
      },
    });
  });
});
