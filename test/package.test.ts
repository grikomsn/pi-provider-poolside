import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

test("npm package includes only the required asset", () => {
  const output = execFileSync(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  // npm <12 prints an array of package entries; npm 12 prints an object keyed by
  // package name. Object.values() reads the first entry from either shape.
  const parsed = JSON.parse(output) as Record<string, { files: Array<{ path: string }> }>;
  const entry = Object.values(parsed)[0];
  assert.ok(entry, "expected the package entry in npm pack output");
  const paths = entry.files.map((file) => file.path);

  assert.ok(paths.includes("assets/cover.jpg"));
  assert.ok(paths.includes("src/store.ts"));
  assert.ok(!paths.includes("assets/icon.png"));
  assert.ok(!paths.some((path) => path.startsWith("test/")));
  assert.ok(!paths.some((path) => path.startsWith(".github/")));
  assert.ok(!paths.some((path) => path.startsWith(".env")));
});
