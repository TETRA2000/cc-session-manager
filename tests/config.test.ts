import { assertEquals } from "@std/assert";
import { loadConfig } from "../src/config.ts";

Deno.test("loadConfig defaults host to 127.0.0.1", () => {
  const config = loadConfig({});
  assertEquals(config.host, "127.0.0.1");
});

Deno.test("loadConfig accepts --host flag", () => {
  const config = loadConfig({ host: "0.0.0.0" });
  assertEquals(config.host, "0.0.0.0");
});

Deno.test("loadConfig sets authEnabled=false when host is 127.0.0.1", () => {
  const config = loadConfig({});
  assertEquals(config.authEnabled, false);
  assertEquals(config.token, null);
});

Deno.test("loadConfig sets authEnabled=true when host is non-localhost", () => {
  const config = loadConfig({ host: "0.0.0.0" });
  assertEquals(config.authEnabled, true);
});

Deno.test("loadConfig generates a token when authEnabled and no --token provided", () => {
  const config = loadConfig({ host: "0.0.0.0" });
  assertEquals(config.authEnabled, true);
  assertEquals(typeof config.token, "string");
  assertEquals(config.token!.length, 64); // 32 bytes hex-encoded
});

Deno.test("loadConfig uses provided --token when given", () => {
  const config = loadConfig({ host: "0.0.0.0", token: "my-secret-token" });
  assertEquals(config.token, "my-secret-token");
  assertEquals(config.authEnabled, true);
});

Deno.test("loadConfig token is null when localhost", () => {
  const config = loadConfig({ host: "127.0.0.1", token: "ignored" });
  assertEquals(config.authEnabled, false);
  assertEquals(config.token, null);
});

Deno.test("loadConfig preserves existing fields", () => {
  const config = loadConfig({ port: 8080, claudeHome: "/tmp/.claude", projectsRoot: "/tmp/projects" });
  assertEquals(config.port, 8080);
  assertEquals(config.claudeHome, "/tmp/.claude");
  assertEquals(config.projectsRoot, "/tmp/projects");
  assertEquals(config.host, "127.0.0.1");
});
