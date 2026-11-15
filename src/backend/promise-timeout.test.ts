// @vitest-environment node

import { describe, expect, it } from "vitest";
import { withTimeout } from "./promise-timeout";

describe("withTimeout", () => {
  it("passes the value through when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve(7), 1_000, "too slow")).resolves.toBe(7);
  });

  it("rejects with the message when the promise never settles", async () => {
    await expect(withTimeout(new Promise<never>(() => undefined), 10, "too slow")).rejects.toThrow("too slow");
  });
});
