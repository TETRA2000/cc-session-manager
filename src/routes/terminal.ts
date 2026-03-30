import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import type { AppConfig } from "../types.ts";
import { PTYManager } from "../services/pty-manager.ts";
import { timingSafeEqual } from "../services/auth.ts";

interface ClientMessage {
  type: "connect" | "data" | "resize" | "ping";
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
}

interface ServerMessage {
  type: "connected" | "data" | "exit" | "pong" | "error";
  sessionId?: string;
  data?: string;
  code?: number;
  message?: string;
}

export function terminalRoutes(config: AppConfig, ptyManager: PTYManager): Hono {
  const app = new Hono();

  app.get(
    "/ws",
    upgradeWebSocket((c) => {
      // Validate auth token before upgrade
      if (config.authEnabled && config.token) {
        const queryToken = c.req.query("token");
        if (!queryToken || !timingSafeEqual(queryToken, config.token)) {
          // Can't return 401 from upgradeWebSocket handler directly;
          // close immediately on open instead
          return {
            onOpen(_event, ws) {
              ws.send(JSON.stringify({ type: "error", message: "Unauthorized" } satisfies ServerMessage));
              ws.close(1008, "Unauthorized");
            },
          };
        }
      }

      let currentSessionId: string | undefined;

      return {
        onMessage(event, ws) {
          try {
            const msg: ClientMessage = JSON.parse(String(event.data));

            switch (msg.type) {
              case "connect": {
                // Reattach to existing session or create new one
                if (msg.sessionId) {
                  const existing = ptyManager.get(msg.sessionId);
                  if (existing) {
                    ptyManager.clearKeepalive(msg.sessionId);
                    currentSessionId = msg.sessionId;
                    existing.onData((data: string) => {
                      const encoded = btoa(data);
                      ws.send(
                        JSON.stringify({ type: "data", data: encoded } satisfies ServerMessage),
                      );
                    });
                    existing.onExit((code: number) => {
                      ws.send(JSON.stringify({ type: "exit", code } satisfies ServerMessage));
                      ws.close(1000, "Process exited");
                    });
                    ws.send(
                      JSON.stringify(
                        { type: "connected", sessionId: msg.sessionId } satisfies ServerMessage,
                      ),
                    );
                    return;
                  }
                }

                // Create new PTY session
                const session = ptyManager.create();
                currentSessionId = session.id;

                session.onData((data: string) => {
                  const encoded = btoa(data);
                  ws.send(
                    JSON.stringify({ type: "data", data: encoded } satisfies ServerMessage),
                  );
                });

                session.onExit((code: number) => {
                  ws.send(JSON.stringify({ type: "exit", code } satisfies ServerMessage));
                  ws.close(1000, "Process exited");
                });

                ws.send(
                  JSON.stringify(
                    { type: "connected", sessionId: session.id } satisfies ServerMessage,
                  ),
                );
                break;
              }

              case "data": {
                if (!currentSessionId || !msg.data) return;
                const session = ptyManager.get(currentSessionId);
                if (session) {
                  session.write(atob(msg.data));
                }
                break;
              }

              case "resize": {
                if (!currentSessionId || !msg.cols || !msg.rows) return;
                const session = ptyManager.get(currentSessionId);
                if (session) {
                  session.resize(msg.cols, msg.rows);
                }
                break;
              }

              case "ping": {
                ws.send(JSON.stringify({ type: "pong" } satisfies ServerMessage));
                break;
              }
            }
          } catch {
            ws.send(
              JSON.stringify(
                { type: "error", message: "Invalid message" } satisfies ServerMessage,
              ),
            );
          }
        },

        onClose() {
          if (currentSessionId) {
            ptyManager.startKeepalive(currentSessionId);
          }
        },
      };
    }),
  );

  return app;
}
