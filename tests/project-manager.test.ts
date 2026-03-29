import { assertEquals } from "@std/assert";
import { validateProjectName, createProject, loadAllProjectSettings, saveProjectSettings, getProjectSettings } from "../src/services/project-manager.ts";

// ─── Name validation ───

Deno.test("validateProjectName accepts valid names", () => {
  assertEquals(validateProjectName("my-app"), null);
  assertEquals(validateProjectName("test_project"), null);
  assertEquals(validateProjectName("App2024"), null);
  assertEquals(validateProjectName("my.project"), null);
  assertEquals(validateProjectName("a"), null);
  assertEquals(validateProjectName("hello-world_v2.0"), null);
});

Deno.test("validateProjectName rejects empty name", () => {
  assertEquals(validateProjectName(""), "Project name is required");
});

Deno.test("validateProjectName rejects names starting with special chars", () => {
  const err = validateProjectName("-starts-with-hyphen");
  assertEquals(err !== null, true);
  const err2 = validateProjectName(".hidden");
  assertEquals(err2 !== null, true);
  const err3 = validateProjectName("_underscore");
  assertEquals(err3 !== null, true);
});

Deno.test("validateProjectName rejects names with spaces", () => {
  const err = validateProjectName("my project");
  assertEquals(err !== null, true);
});

Deno.test("validateProjectName rejects names with slashes", () => {
  const err = validateProjectName("path/traversal");
  assertEquals(err !== null, true);
});

Deno.test("validateProjectName rejects too-long names", () => {
  const err = validateProjectName("a".repeat(101));
  assertEquals(err !== null, true);
});

// ─── Project creation ───

Deno.test({ name: "createProject creates directory with CLAUDE.md", sanitizeResources: false, fn: async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const result = await createProject(tmpDir, {
      name: "test-proj",
      gitInit: false,
      claudeMd: true,
      mcpJson: false,
      launchAfter: false,
    });

    assertEquals(result.ok, true);
    assertEquals(result.path, `${tmpDir}/test-proj`);

    // Verify directory exists
    const stat = await Deno.stat(`${tmpDir}/test-proj`);
    assertEquals(stat.isDirectory, true);

    // Verify CLAUDE.md exists
    const claudeMd = await Deno.readTextFile(`${tmpDir}/test-proj/CLAUDE.md`);
    assertEquals(claudeMd.includes("# test-proj"), true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
}});

Deno.test({ name: "createProject creates .mcp.json when requested", sanitizeResources: false, fn: async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const result = await createProject(tmpDir, {
      name: "mcp-proj",
      gitInit: false,
      claudeMd: false,
      mcpJson: true,
      launchAfter: false,
    });

    assertEquals(result.ok, true);

    const mcpJson = await Deno.readTextFile(`${tmpDir}/mcp-proj/.mcp.json`);
    assertEquals(mcpJson.trim(), "{}");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
}});

Deno.test({ name: "createProject rejects duplicate directory", sanitizeResources: false, fn: async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${tmpDir}/existing-proj`);

    const result = await createProject(tmpDir, {
      name: "existing-proj",
      gitInit: false,
      claudeMd: false,
      mcpJson: false,
      launchAfter: false,
    });

    assertEquals(result.ok, false);
    assertEquals(result.error!.includes("already exists"), true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
}});

Deno.test("createProject rejects invalid name", async () => {
  const result = await createProject("/tmp", {
    name: "../traversal",
    gitInit: false,
    claudeMd: false,
    mcpJson: false,
    launchAfter: false,
  });
  assertEquals(result.ok, false);
});

Deno.test({ name: "createProject with gitInit creates .git directory", sanitizeResources: false, fn: async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const result = await createProject(tmpDir, {
      name: "git-proj",
      gitInit: true,
      claudeMd: false,
      mcpJson: false,
      launchAfter: false,
    });

    assertEquals(result.ok, true);

    const stat = await Deno.stat(`${tmpDir}/git-proj/.git`);
    assertEquals(stat.isDirectory, true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
}});

// ─── Project settings ───

Deno.test({ name: "saveProjectSettings and getProjectSettings round-trip", sanitizeResources: false, fn: async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await saveProjectSettings(tmpDir, "my-project", {
      displayName: "My Project",
      tags: ["frontend", "react"],
      preferredModel: "claude-opus-4-6",
    });

    const settings = await getProjectSettings(tmpDir, "my-project");
    assertEquals(settings!.displayName, "My Project");
    assertEquals(settings!.tags, ["frontend", "react"]);
    assertEquals(settings!.preferredModel, "claude-opus-4-6");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
}});

Deno.test({ name: "loadAllProjectSettings returns empty object for new root", sanitizeResources: false, fn: async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const all = await loadAllProjectSettings(tmpDir);
    assertEquals(Object.keys(all).length, 0);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
}});

Deno.test("getProjectSettings returns null for unknown project", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const settings = await getProjectSettings(tmpDir, "nonexistent");
    assertEquals(settings, null);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
