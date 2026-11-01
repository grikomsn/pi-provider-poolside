import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// A model that exists only in the persisted (previously discovered) catalog,
// never in the bundled fallback list.
const LIVE_ONLY_MODEL = "poolside/laguna-live-only";

test("packed provider honours a saved default on a live-only model at startup", { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "poolside-packed-test-"));
  const repository = fileURLToPath(new URL("..", import.meta.url));
  const cli = fileURLToPath(new URL("./bundle/cli.js", import.meta.resolve("@earendil-works/pi-coding-agent")));
  try {
    execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--ignore-scripts", "--pack-destination", root], {
      cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    const archives = (await readdir(root)).filter((name) => name.endsWith(".tgz"));
    assert.equal(archives.length, 1);
    execFileSync("tar", ["-xzf", join(root, archives[0]!), "-C", root]);
    const fixture = join(root, "host-fetch.ts");
    await copyFile(new URL("./fixtures/host-fetch.ts", import.meta.url), fixture);

    const agent = join(root, "agent");
    await mkdir(agent);
    await writeFile(join(agent, "settings.json"), JSON.stringify({
      quietStartup: true,
      checkForUpdates: false,
      defaultProvider: "poolside",
      defaultModel: LIVE_ONLY_MODEL,
    }));
    // Shape written by this extension's own publish(): no per-row api/baseUrl.
    await writeFile(join(agent, "models-store.json"), JSON.stringify({
      poolside: {
        models: [{
          id: LIVE_ONLY_MODEL,
          name: "Laguna Live Only",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 262_144,
          maxTokens: 32_768,
          compat: {
            supportsDeveloperRole: false,
            supportsUsageInStreaming: true,
            maxTokensField: "max_completion_tokens",
            thinkingFormat: "openrouter",
          },
        }],
        checkedAt: 1,
      },
    }));

    const log = join(root, "fetch.log");
    await writeFile(log, "");
    const child = spawnSync(process.execPath, [
      cli, "--offline", "--no-extensions", "-e", fixture, "-e", join(root, "package"),
      "--no-mcp", "--no-skills", "--no-context-files", "--no-prompt-templates", "--no-themes",
      "--no-approve", "--no-session", "--no-tools",
      "--mode", "json", "-p", "Reply with OK.",
    ], {
      cwd: root, encoding: "utf8", timeout: 30_000,
      env: {
        PATH: process.env.PATH, HOME: root, TERM: "xterm-256color",
        PI_CODING_AGENT_DIR: agent, PI_TELEMETRY: "0", PI_OFFLINE: "1",
        XDG_CONFIG_HOME: root, XDG_DATA_HOME: root, XDG_STATE_HOME: root, XDG_CACHE_HOME: root,
        POOLSIDE_API_KEY: "poolside-regression-test-key", POOLSIDE_TEST_FETCH_LOG: log,
      },
    });
    const output = `${child.stdout}\n${child.stderr}`;
    assert.equal(child.status, 0, `Bundled pi exited with ${child.status}`);
    assert.ok(!/Cannot find module|failed to load|extension error/i.test(output), "Packed extension failed to load");
    assert.equal(await readFile(log, "utf8"), `chat ${LIVE_ONLY_MODEL}\n`, "Startup did not select the saved live-only default");
    const events = child.stdout.split("\n").flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
    assert.ok(events.some((event) => event.type === "message_end" && event.message?.role === "assistant"
      && event.message.stopReason === "stop"
      && event.message.content?.some((part: { type: string; text?: string }) =>
        part.type === "text" && part.text === `PACKED_POOLSIDE_OK ${LIVE_ONLY_MODEL}`)),
    "Packed extension did not complete the synthetic streamed response");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
