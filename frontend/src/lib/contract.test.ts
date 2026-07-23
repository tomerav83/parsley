/// <reference types="node" />
// The frontend half of the API contract guard. contract.json at the repo root is
// the single source of truth (see backend/tests/test_contract.py); this fails if
// the client's Recipe schema or error-code list drifts from it. A node/unit test —
// it reads the shared JSON straight off disk.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ERROR_CODES, recipeSchema } from "./api.ts";

const contract = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../contract.json", import.meta.url)),
    "utf8",
  ),
) as { recipe_fields: string[]; backend_error_codes: string[] };

describe("API contract", () => {
  it("recipeSchema fields match the backend Recipe, in order", () => {
    expect(Object.keys(recipeSchema.shape)).toEqual(contract.recipe_fields);
  });

  it("handles every backend error code (bar the never-raised generic 'error')", () => {
    const handled = new Set<string>(ERROR_CODES);
    const missing = contract.backend_error_codes.filter(
      (code) => code !== "error" && !handled.has(code),
    );
    expect(missing).toEqual([]);
  });
});
