import { useRef, useEffect, useCallback, useState } from 'react';
import { nanoid } from 'nanoid';

interface WsMessage {
  id: string;
  type: string;
  seq: number;
  payload: unknown;
}

type MessageHandler = (msg: WsMessage) => void;

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, MessageHandler>>(new Map());
  const globalHandlerRef = useRef<MessageHandler | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return;
    if (wsRef.current && (
      wsRef.current.readyState === WebSocket.OPEN
      || wsRef.current.readyState === WebSocket.CONNECTING
    )) {
      return;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        // Check for request-specific handler (matched by id)
        const handler = handlersRef.current.get(msg.id);
        if (handler) {
          handler(msg);
          handlersRef.current.delete(msg.id);
        }
        // Always call global handler
        globalHandlerRef.current?.(msg);
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      if (shouldReconnectRef.current) {
        reconnectTimerRef.current = setTimeout(() => connect(), 2000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((type: string, payload: unknown, msgId?: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg: WsMessage = {
      id: msgId || nanoid(),
      type,
      seq: 0,
      payload,
    };
    ws.send(JSON.stringify(msg));
    return msg.id;
  }, []);

  const request = useCallback(
    (type: string, payload: unknown): Promise<WsMessage> => {
      return new Promise((resolve, reject) => {
        const msgId = nanoid();
        const timeout = setTimeout(() => {
          handlersRef.current.delete(msgId);
          reject(new Error(`Request ${type} timed out`));
        }, 10000);

        handlersRef.current.set(msgId, (response) => {
          clearTimeout(timeout);
          resolve(response);
        });

        send(type, payload, msgId);
      });
    },
    [send],
  );

  const onMessage = useCallback((handler: MessageHandler) => {
    globalHandlerRef.current = handler;
  }, []);

  return { send, request, onMessage, isConnected };
}
