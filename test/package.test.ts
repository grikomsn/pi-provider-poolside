import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

test("npm package includes only the required asset", () => {
  const output = execFileSync(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  const [{ files }] = JSON.parse(output) as [{ files: Array<{ path: string }> }];
  const paths = files.map((file) => file.path);

  assert.ok(paths.includes("assets/cover.jpg"));
  assert.ok(!paths.includes("assets/icon.png"));
  assert.ok(!paths.some((path) => path.startsWith("test/")));
  assert.ok(!paths.some((path) => path.startsWith(".github/")));
  assert.ok(!paths.some((path) => path.startsWith(".env")));
});
