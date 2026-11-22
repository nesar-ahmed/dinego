"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { CustomerCart, PublicMenuItem } from "@dinego/shared";
import { ApiError } from "@/lib/api";
import { AUTH_CHANGED_EVENT } from "@/lib/auth";
import {
  addCartItem,
  applyAdd,
  applyQuantity,
  cartErrorMessage,
  EMPTY_CART,
  fetchCart,
  removeCartItem,
  savePendingAdd,
  setCartItemQuantity,
  takePendingAdd,
} from "@/lib/cart";

/** `guest` = signed out, `staff` = staff account (no cart), `error` = API unreachable. */
export type CartStatus = "loading" | "guest" | "customer" | "staff" | "error";

export type CartToast = {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
  action?: "view-cart";
};

type CartContextValue = {
  status: CartStatus;
  cart: CustomerCart;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  quantityOf: (menuItemId: number) => number;
  addItem: (item: PublicMenuItem) => void;
  setQuantity: (menuItemId: number, quantity: number) => void;
  removeItem: (menuItemId: number) => void;
  toast: CartToast | null;
  dismissToast: () => void;
  reload: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>");
  }

  return context;
}

const TOAST_DURATION_MS = 4000;

export function CartProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<CartStatus>("loading");
  const [cart, setCart] = useState<CustomerCart>(EMPTY_CART);
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<CartToast | null>(null);

  // Mutations run one at a time, in click order. Each updates the UI optimistically; the
  // server's cart replaces it once no further mutations are waiting, so rapid clicks never
  // flicker or apply out of order.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pendingMutations = useRef(0);
  const toastId = useRef(0);

  const showToast = useCallback(
    (message: string, tone: CartToast["tone"], action?: "view-cart") => {
      toastId.current += 1;
      setToast({ id: toastId.current, message, tone, action });
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(handle);
  }, [toast]);

  const load = useCallback(async () => {
    try {
      const fresh = await fetchCart();
      setCart(fresh);
      setStatus("customer");

      const pending = takePendingAdd();
      if (pending) {
        try {
          setCart(await addCartItem(pending.menuItemId));
          showToast(`Added ${pending.name} to your cart`, "success", "view-cart");
        } catch (error) {
          showToast(cartErrorMessage(error), "error");
        }
      }
    } catch (error) {
      setCart(EMPTY_CART);

      if (error instanceof ApiError && error.status === 401) {
        setStatus("guest");
      } else if (error instanceof ApiError && error.status === 403) {
        setStatus("staff");
      } else {
        setStatus("error");
      }
    }
  }, [showToast]);

  useEffect(() => {
    // Initial load is an external sync with the API, so setting state here is intended.
    void load();
    window.addEventListener(AUTH_CHANGED_EVENT, load);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, load);
  }, [load]);

  const mutate = useCallback(
    (optimistic: (current: CustomerCart) => CustomerCart, request: () => Promise<CustomerCart>) => {
      setCart(optimistic);
      pendingMutations.current += 1;

      queue.current = queue.current.then(async () => {
        try {
          const next = await request();
          if (pendingMutations.current === 1) setCart(next);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            setStatus("guest");
            setCart(EMPTY_CART);
            showToast("Your session has ended. Please sign in again.", "info");
            return;
          }

          showToast(cartErrorMessage(error), "error");
          // Re-sync with the server so the UI never shows a change that did not happen.
          try {
            setCart(await fetchCart());
          } catch {
            // Keep the current state; the next action will retry.
          }
        } finally {
          pendingMutations.current -= 1;
        }
      });
    },
    [showToast],
  );

  const addItem = useCallback(
    (item: PublicMenuItem) => {
      if (status === "guest") {
        savePendingAdd(item);
        const next = `${window.location.pathname}${window.location.search}`;
        router.push(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      if (status === "staff") {
        showToast("Carts are for customer accounts. Sign in as a customer to order.", "info");
        return;
      }

      if (status !== "customer") {
        showToast("The cart is not available right now. Please try again.", "error");
        void load();
        return;
      }

      const wasInCart = cart.items.some((line) => line.item.id === item.id);
      mutate(
        (current) => applyAdd(current, item),
        () => addCartItem(item.id),
      );
      showToast(
        wasInCart ? `Added another ${item.name}` : `Added ${item.name} to your cart`,
        "success",
        "view-cart",
      );
    },
    [cart.items, load, mutate, router, showToast, status],
  );

  const setQuantity = useCallback(
    (menuItemId: number, quantity: number) => {
      mutate(
        (current) => applyQuantity(current, menuItemId, quantity),
        () => setCartItemQuantity(menuItemId, quantity),
      );
    },
    [mutate],
  );

  const removeItem = useCallback(
    (menuItemId: number) => {
      mutate(
        (current) => applyQuantity(current, menuItemId, 0),
        () => removeCartItem(menuItemId),
      );
    },
    [mutate],
  );

  const openCart = useCallback(() => {
    setToast(null);
    setIsOpen(true);
  }, []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const dismissToast = useCallback(() => setToast(null), []);
  const reload = useCallback(() => void load(), [load]);

  const quantityOf = useCallback(
    (menuItemId: number) => cart.items.find((line) => line.item.id === menuItemId)?.quantity ?? 0,
    [cart.items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      status,
      cart,
      isOpen,
      openCart,
      closeCart,
      quantityOf,
      addItem,
      setQuantity,
      removeItem,
      toast,
      dismissToast,
      reload,
    }),
    [
      status,
      cart,
      isOpen,
      openCart,
      closeCart,
      quantityOf,
      addItem,
      setQuantity,
      removeItem,
      toast,
      dismissToast,
      reload,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
