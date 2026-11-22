import { ApiError } from "@/lib/api/client";
import { getPublicEnv } from "@/lib/env";

/**
 * DELETE with a bearer token for routes that return 204 No Content.
 * The shared apiRequest always parses a JSON body, so it cannot be used for 204 responses.
 */
export async function deleteAuthed(path: string, token: string): Promise<void> {
  const base = getPublicEnv().NEXT_PUBLIC_API_BASE_URL;
  const url = `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.statusText || `Request failed with status ${res.status}`);
  }
}
