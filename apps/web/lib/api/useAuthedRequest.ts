"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api/client";
import type { ApiRequestOptions } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/session";

export interface AuthedRequestState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Fetches `path` with the signed-in student's access token.
 * Pass `null` as the path to skip the request (for example while an input is missing).
 * The backend enforces permissions; this hook only carries the token.
 */
export function useAuthedRequest<T>(
  path: string | null,
  failureMessage: string,
): AuthedRequestState<T> {
  const { session } = useAuth();
  const token = session?.access_token;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (path === null || !token) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const options: ApiRequestOptions = { token };
    apiRequest<T>(path, options)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) {
          setData(null);
          setError(failureMessage);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, token, failureMessage, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, error, loading, reload };
}
