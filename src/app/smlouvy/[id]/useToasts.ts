import { useCallback, useEffect, useRef, useState } from "react";

import { type ToastMessage } from "./contractDetailTypes";

export function useToasts(autoDismissMs = 3800) {
  const timeoutIdsRef = useRef<number[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback(
    (message: string, type: ToastMessage["type"] = "success") => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, type, message }]);
      const timeoutId = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timeoutIdsRef.current = timeoutIdsRef.current.filter(
          (tid) => tid !== timeoutId
        );
      }, autoDismissMs);
      timeoutIdsRef.current.push(timeoutId);
    },
    [autoDismissMs]
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      timeoutIdsRef.current.forEach((id) => clearTimeout(id));
    };
  }, []);

  return {
    toasts,
    pushToast,
    dismissToast,
  };
}
