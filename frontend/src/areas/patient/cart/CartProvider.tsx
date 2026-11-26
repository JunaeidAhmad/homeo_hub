"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import type { components } from "@/api/schema";
import { useApiClient } from "@/api/use-api-client";
import { useSession } from "@/areas/patient/session/SessionProvider";

export type Cart = components["schemas"]["Cart"];
export type CartItem = components["schemas"]["CartItem"];
export type AddCartInput = components["schemas"]["AddCartItemRequest"];

type CartActionResult =
  | { ok: true; cart: Cart }
  | { ok: false; code: string };

type CartContextValue = {
  cart: Cart | null;
  loading: boolean;
  error: boolean;
  add: (input: AddCartInput) => Promise<CartActionResult>;
  setQuantity: (itemId: string, quantity: number) => Promise<CartActionResult>;
  remove: (itemId: string) => Promise<CartActionResult>;
  refresh: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

async function extractErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { code?: string } };
    return body?.error?.code ?? "ERROR";
  } catch {
    return "ERROR";
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const api = useApiClient();
  const [loadedCart, setLoadedCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const signedIn = session.status === "signedIn";
  const patientId = session.status === "signedIn" ? session.patient.id : null;

  useEffect(() => {
    if (!patientId) return;
    const controller = new AbortController();
    api
      .GET("/api/v1/cart/", { signal: controller.signal })
      .then(({ data, response }) => {
        if (data) {
          setLoadedCart(data);
          setError(false);
        } else if (response.status >= 400) {
          setError(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [api, patientId]);

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    setLoading(true);
    try {
      const { data } = await api.GET("/api/v1/cart/");
      if (data) {
        setLoadedCart(data);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [api, signedIn]);

  const add = useCallback(
    async (input: AddCartInput): Promise<CartActionResult> => {
      try {
        const { data, response } = await api.POST("/api/v1/cart/items/", { body: input });
        if (data) {
          setLoadedCart(data);
          setError(false);
          return { ok: true, cart: data };
        }
        return { ok: false, code: await extractErrorCode(response) };
      } catch {
        return { ok: false, code: "NETWORK_ERROR" };
      }
    },
    [api],
  );

  const setQuantity = useCallback(
    async (itemId: string, quantity: number): Promise<CartActionResult> => {
      try {
        const { data, response } = await api.PATCH("/api/v1/cart/items/{id}/", {
          params: { path: { id: itemId } },
          body: { quantity },
        });
        if (data) {
          setLoadedCart(data);
          return { ok: true, cart: data };
        }
        return { ok: false, code: await extractErrorCode(response) };
      } catch {
        return { ok: false, code: "NETWORK_ERROR" };
      }
    },
    [api],
  );

  const remove = useCallback(
    async (itemId: string): Promise<CartActionResult> => {
      try {
        const { data, response } = await api.DELETE("/api/v1/cart/items/{id}/", {
          params: { path: { id: itemId } },
        });
        if (data) {
          setLoadedCart(data);
          return { ok: true, cart: data };
        }
        return { ok: false, code: await extractErrorCode(response) };
      } catch {
        return { ok: false, code: "NETWORK_ERROR" };
      }
    },
    [api],
  );

  const cart = signedIn ? loadedCart : null;

  return (
    <CartContext value={{ cart, loading, error, add, setQuantity, remove, refresh }}>
      {children}
    </CartContext>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside a CartProvider");
  return ctx;
}
