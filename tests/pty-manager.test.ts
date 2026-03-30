import { assertEquals, assertExists, assertStrictEquals } from "@std/assert";
import { PTYManager } from "../src/services/pty-manager.ts";

// PTY tests need relaxed sanitizers due to background read loops and FFI timers
const ptyTestOpts = { sanitizeOps: false, sanitizeResources: false };

Deno.test("PTYManager creates a session with a unique ID", ptyTestOpts, () => {
  const manager = new PTYManager();
  try {
    const session = manager.create();
    assertExists(session.id);
    assertEquals(typeof session.id, "string");
    assertEquals(session.id.length > 0, true);
  } finally {
    manager.destroyAll();
  }
});

Deno.test("PTYManager retrieves session by ID", ptyTestOpts, () => {
  const manager = new PTYManager();
  try {
    const session = manager.create();
    const found = manager.get(session.id);
    assertStrictEquals(found, session);
  } finally {
    manager.destroyAll();
  }
});

Deno.test("PTYManager returns undefined for unknown ID", () => {
  const manager = new PTYManager();
  const found = manager.get("nonexistent");
  assertEquals(found, undefined);
});

Deno.test("PTYManager destroys session by ID", ptyTestOpts, () => {
  const manager = new PTYManager();
  try {
    const session = manager.create();
    manager.destroy(session.id);
    assertEquals(manager.get(session.id), undefined);
  } finally {
    manager.destroyAll();
  }
});

Deno.test("PTYManager tracks concurrent sessions", ptyTestOpts, () => {
  const manager = new PTYManager();
  try {
    const s1 = manager.create();
    const s2 = manager.create();
    assertExists(manager.get(s1.id));
    assertExists(manager.get(s2.id));
    assertEquals(s1.id !== s2.id, true);
  } finally {
    manager.destroyAll();
  }
});

Deno.test("PTYManager.destroyAll cleans up all sessions", ptyTestOpts, () => {
  const manager = new PTYManager();
  const s1 = manager.create();
  const s2 = manager.create();
  manager.destroyAll();
  assertEquals(manager.get(s1.id), undefined);
  assertEquals(manager.get(s2.id), undefined);
});
