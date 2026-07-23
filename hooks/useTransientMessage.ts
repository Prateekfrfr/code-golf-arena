"use client";

import { useCallback, useEffect, useState } from "react";

export function useTransientMessage(durationMs = 4200) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return;

    const timeout = window.setTimeout(() => setMessage(""), durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, message]);

  const clearMessage = useCallback(() => setMessage(""), []);

  return { message, setMessage, clearMessage };
}
