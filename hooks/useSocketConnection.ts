"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "@/lib/socket";

export function useSocketConnection() {
  const [connected, setConnected] = useState(false);
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const connectionObservedRef = useRef(false);

  useEffect(() => {
    const handleConnect = () => {
      setConnected(true);
      connectionObservedRef.current = true;
      setConnectionEpoch((epoch) => epoch + 1);
    };
    const handleDisconnect = () => {
      connectionObservedRef.current = false;
      setConnected(false);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    queueMicrotask(() => {
      setConnected(socket.connected);
      if (socket.connected && !connectionObservedRef.current) {
        connectionObservedRef.current = true;
        setConnectionEpoch((epoch) => epoch + 1);
      }
    });

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  return { connected, connectionEpoch };
}
