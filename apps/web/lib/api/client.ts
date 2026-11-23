import { getPublicEnv } from "@/lib/env";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;
  baseUrl?: string;
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === "object" && "detail" in data) {
      const detail = (data as { detail: unknown }).detail;
      if (typeof detail === "string" && detail.length > 0) {
        return detail;
      }
    }
  } catch {
    // Body is not JSON; fall back to status text below.
  }
  return res.statusText || `Request failed with status ${res.status}`;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const base = options.baseUrl ?? getPublicEnv().NEXT_PUBLIC_API_BASE_URL;
  const url = `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      // API data can change independently of a Next.js deployment (for example,
      // when an admin publishes a scheme), so never reuse a stale server response.
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(408, "The server took too long to respond. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res));
  }

  return (await res.json()) as T;
}

