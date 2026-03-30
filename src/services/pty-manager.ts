import { Pty } from "@sigma/pty-ffi";

export interface PTYSession {
  id: string;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (code: number) => void): void;
  kill(): void;
}

export class PTYManager {
  private sessions = new Map<string, PTYSessionImpl>();
  private keepaliveTimeouts = new Map<string, number>();
  private keepaliveMs: number;

  constructor(keepaliveMs = 30_000) {
    this.keepaliveMs = keepaliveMs;
  }

  create(shell?: string, cwd?: string, env?: Record<string, string>): PTYSession {
    const id = crypto.randomUUID();
    const session = new PTYSessionImpl(id, shell, cwd, env);
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): PTYSession | undefined {
    return this.sessions.get(id);
  }

  destroy(id: string): void {
    this.clearKeepalive(id);
    const session = this.sessions.get(id);
    if (session) {
      session.kill();
      this.sessions.delete(id);
    }
  }

  startKeepalive(id: string): void {
    this.clearKeepalive(id);
    const timeout = setTimeout(() => {
      this.destroy(id);
    }, this.keepaliveMs);
    this.keepaliveTimeouts.set(id, timeout);
  }

  clearKeepalive(id: string): void {
    const timeout = this.keepaliveTimeouts.get(id);
    if (timeout !== undefined) {
      clearTimeout(timeout);
      this.keepaliveTimeouts.delete(id);
    }
  }

  destroyAll(): void {
    for (const id of this.sessions.keys()) {
      this.destroy(id);
    }
  }
}

class PTYSessionImpl implements PTYSession {
  readonly id: string;
  private pty: Pty;
  private dataCallbacks: Array<(data: string) => void> = [];
  private exitCallbacks: Array<(code: number) => void> = [];
  private reading = true;

  constructor(id: string, shell?: string, cwd?: string, env?: Record<string, string>) {
    this.id = id;
    const cmd = shell ?? Deno.env.get("SHELL") ?? "/bin/bash";
    this.pty = new Pty(cmd, {
      args: [],
      env: env ?? Object.fromEntries(
        Object.entries(Deno.env.toObject()).concat([["TERM", "xterm-256color"]]),
      ),
      cwd: cwd,
    });
    this.startReading();
  }

  write(data: string): void {
    this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    this.pty.resize({ cols, rows });
  }

  onData(callback: (data: string) => void): void {
    this.dataCallbacks.push(callback);
  }

  onExit(callback: (code: number) => void): void {
    this.exitCallbacks.push(callback);
  }

  kill(): void {
    this.reading = false;
    try {
      this.pty.close();
    } catch {
      // Already closed
    }
  }

  private async startReading(): Promise<void> {
    try {
      const reader = this.pty.readable.getReader();
      while (this.reading) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          for (const cb of this.dataCallbacks) {
            cb(value);
          }
        }
      }
      reader.releaseLock();
    } catch {
      // PTY closed
    }
    const code = this.pty.exitCode ?? 0;
    for (const cb of this.exitCallbacks) {
      cb(code);
    }
  }
}
