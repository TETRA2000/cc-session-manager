import { assertEquals } from "@std/assert";
import { parseSbxLsOutput } from "../src/services/sbx-backend.ts";

// ─── sbx ls output parsing ───

const SAMPLE_SBX_LS = `SANDBOX          AGENT    STATUS     PORTS    WORKSPACE
ccsm-a1b2c3d4e5  claude   Running             /Users/dev/project-a
ccsm-f6g7h8i9j0  claude   Stopped             /Users/dev/project-b
other-sandbox    claude   Running             /Users/dev/other`;

Deno.test("parseSbxLsOutput parses tabular output correctly", () => {
  const rows = parseSbxLsOutput(SAMPLE_SBX_LS);
  assertEquals(rows.length, 3);
  assertEquals(rows[0].sandbox, "ccsm-a1b2c3d4e5");
  assertEquals(rows[0].agent, "claude");
  assertEquals(rows[0].status, "Running");
  assertEquals(rows[0].workspace, "/Users/dev/project-a");
});

Deno.test("parseSbxLsOutput handles empty output", () => {
  const rows = parseSbxLsOutput("");
  assertEquals(rows.length, 0);
});

Deno.test("parseSbxLsOutput handles header-only output", () => {
  const rows = parseSbxLsOutput("SANDBOX  AGENT  STATUS  PORTS  WORKSPACE\n");
  assertEquals(rows.length, 0);
});

Deno.test("parseSbxLsOutput extracts status for ccsm sandboxes", () => {
  const rows = parseSbxLsOutput(SAMPLE_SBX_LS);
  const ccsm = rows.filter((r) => r.sandbox.startsWith("ccsm-"));
  assertEquals(ccsm.length, 2);
  assertEquals(ccsm[0].status, "Running");
  assertEquals(ccsm[1].status, "Stopped");
});

// ─── getLaunchCommand ───

Deno.test("SbxBackend getLaunchCommand produces sbx exec -it command", async () => {
  // Import dynamically to avoid needing sbx installed
  const { SbxBackend } = await import("../src/services/sbx-backend.ts");
  const backend = new SbxBackend("/tmp/projects");
  const cmd = backend.getLaunchCommand("ccsm-abc123", ["--continue"]);
  assertEquals(cmd.command, "sbx");
  assertEquals(cmd.args, ["exec", "-it", "ccsm-abc123", "claude", "--continue"]);
  assertEquals(cmd.cwd, null);
});

Deno.test("SbxBackend getLaunchCommand with no claude args", async () => {
  const { SbxBackend } = await import("../src/services/sbx-backend.ts");
  const backend = new SbxBackend("/tmp/projects");
  const cmd = backend.getLaunchCommand("ccsm-abc123", []);
  assertEquals(cmd.args, ["exec", "-it", "ccsm-abc123", "claude"]);
});
