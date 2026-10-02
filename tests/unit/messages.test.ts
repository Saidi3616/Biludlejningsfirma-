import { describe, expect, it } from "vitest";
import da from "../../messages/da.json";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import fr from "../../messages/fr.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("oversættelser", () => {
  const reference = keys(da).sort();

  it.each([
    ["en", en],
    ["ar", ar],
    ["fr", fr],
  ])("%s har præcis de samme nøgler som dansk", (_, messages) => {
    expect(keys(messages).sort()).toEqual(reference);
  });
});
