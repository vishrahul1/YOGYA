"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api/client";
import type { SchemeListItem, SchemeListResponse } from "@/lib/api/types";

export interface PublicSchemeIndex {
  /** Published scheme cards, or null when the catalogue could not be loaded. */
  items: SchemeListItem[] | null;
  loading: boolean;
}

/**
 * Loads the first page of the public catalogue so tracking rows can show a scheme name
 * and its official link. The tracking API returns ids only. Schemes outside this page
 * show no link rather than a guessed one.
 */
export function usePublicSchemes(): PublicSchemeIndex {
  const [items, setItems] = useState<SchemeListItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest<SchemeListResponse>("/api/schemes?limit=100&offset=0")
      .then((res) => {
        if (active) setItems(res.items);
      })
      .catch(() => {
        if (active) setItems(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { items, loading };
}
