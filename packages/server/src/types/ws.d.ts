declare module 'ws' {
  export interface WebSocket {
    readonly OPEN: number;
    readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    addEventListener(event: string, listener: (...args: any[]) => void): void;
    removeEventListener(event: string, listener: (...args: any[]) => void): void;
  }

  const WebSocket: {
    prototype: WebSocket;
    new (...args: any[]): WebSocket;
  };

  export default WebSocket;
}
