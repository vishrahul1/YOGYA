import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "@/lib/api/client";

const BASE = "http://api.test";

function jsonResponse(status: number, body: unknown, statusText = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON for an ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 1, name: "x" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest<{ id: number; name: string }>("/schemes", { baseUrl: BASE });

    expect(result).toEqual({ id: 1, name: "x" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/schemes`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws ApiError with status and detail message on 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { detail: "Scheme not found" }, "Not Found"));
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiRequest("/schemes/missing", { baseUrl: BASE });

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 404,
      message: "Scheme not found",
    });
  });
});

