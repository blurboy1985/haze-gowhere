import { afterEach, expect, it, vi } from "vitest";
import { ApiError, fetchRoutes } from "./api";

afterEach(() => vi.unstubAllGlobals());

it("preserves unavailable-data error codes so the UI can clear stale readings and recommendations", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    error: "Haze readings are unavailable right now. Routes cannot be recommended safely.",
    code: "HAZE_UNAVAILABLE",
  }), { status: 502 })));
  const request = fetchRoutes([1.35, 103.82], [1.36, 103.83], false);
  await expect(request).rejects.toBeInstanceOf(ApiError);
  await expect(request).rejects.toMatchObject({ code: "HAZE_UNAVAILABLE" });
});
