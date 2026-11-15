// These tests start the real CLI and the real MCP server as separate
// processes, the same way a developer or an AI client would.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");
const tsx = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const cliEntry = join(projectRoot, "src", "cli.ts");
const mcpEntry = join(projectRoot, "src", "mcp-server.ts");

let repo: string; // a Git repository whose path contains a space
let outDir: string; // where the CLI writes review-report.md

function git(...args: string[]) {
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });
}

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [tsx, cliEntry, ...args], { cwd: outDir, encoding: "utf8" });
}

function readReport() {
  return readFileSync(join(outDir, "review-report.md"), "utf8");
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "inspector repo "));
  outDir = mkdtempSync(join(tmpdir(), "inspector-out-"));
  git("init", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(repo, "base.txt"), "base\n");
  git("add", ".");
  git("commit", "-m", "base");
  git("checkout", "-b", "feature");
  writeFileSync(join(repo, "feature.txt"), "feature\n");
  git("add", ".");
  git("commit", "-m", "feature");
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(outDir, { recursive: true, force: true });
});

describe("CLI entry point", () => {
  it("inspects a repository whose path contains a space", () => {
    const run = runCli("review", "--repo", repo);

    expect(run.status).toBe(0);
    expect(readReport()).toContain("feature.txt (added)");
  }, 30_000);

  it("writes a FAILED result and exits 1 when a validation command fails", () => {
    const run = runCli(
      "review",
      "--repo",
      repo,
      "--validate",
      `node -e "console.error('boom');process.exit(4)"`,
    );

    expect(run.status).toBe(1);
    const report = readReport();
    expect(report).toContain("Status: FAILED (exited with code 4)");
    expect(report).toContain("boom");
  }, 30_000);

  it("replaces an earlier passing report when the next run fails", () => {
    runCli("review", "--repo", repo, "--validate", `node -e "console.log('first-run-ok')"`);
    expect(readReport()).toContain("first-run-ok");

    runCli("review", "--repo", repo, "--validate", `node -e "process.exit(1)"`);
    const report = readReport();
    expect(report).not.toContain("first-run-ok");
    expect(report).toContain("Status: FAILED (exited with code 1)");
  }, 30_000);

  it("keeps going after a failed command and reports every result", () => {
    const run = runCli(
      "review",
      "--repo",
      repo,
      "--validate",
      `node -e "console.log('first-fails');process.exit(7)"`,
      "--validate",
      `node -e "console.log('second-passes')"`,
    );

    expect(run.status).toBe(1);
    const report = readReport();
    expect(report).toContain("Status: FAILED (exited with code 7)");
    expect(report).toContain("first-fails");
    expect(report).toContain("Status: passed");
    expect(report).toContain("second-passes");
    expect(report.indexOf("first-fails")).toBeLessThan(report.indexOf("second-passes"));
  }, 30_000);

  it("rejects a base ref that git would read as an option", () => {
    const target = join(outDir, "written-by-git.txt");
    const run = runCli("review", "--repo", repo, "--base-ref", `--output=${target}`);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Invalid base ref");
    expect(existsSync(target)).toBe(false);
  }, 30_000);
});

describe("CLI help and argument errors", () => {
  it("prints help with options and examples, exits 0, and inspects nothing", () => {
    const run = runCli("--help", "--repo", join(outDir, "does-not-exist"));

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Usage:");
    expect(run.stdout).toContain("--output <path>");
    expect(run.stdout).toContain("Examples:");
    expect(run.stderr).toBe("");
  }, 30_000);

  it.each([
    [["review", "--repo", ".", "--bogus"], 'Unknown option "--bogus"'],
    [["review", "--repo"], "Missing value for --repo"],
    [["review", "--repo", ".", "--output", "--format", "json"], "Missing value for --output"],
    [["review", "--repo", ".", "--format", "xml"], 'Unsupported format "xml"'],
    [["review"], "Missing required option --repo"],
    [["inspect", "--repo", "."], 'Unknown command "inspect"'],
    [[], "Missing command"],
  ])("rejects %j with exit code 2", (args, message) => {
    const run = runCli(...(args as string[]));

    expect(run.status).toBe(2);
    expect(run.stderr).toContain(message);
    expect(run.stderr).toContain("--help");
  }, 30_000);
});

describe("CLI report output", () => {
  it("writes to a custom --output path containing spaces, relative to the current folder", () => {
    const run = runCli("review", "--repo", repo, "--output", "my custom report.md");

    expect(run.status).toBe(0);
    const report = readFileSync(join(outDir, "my custom report.md"), "utf8");
    expect(report).toContain("feature.txt (added)");
    expect(run.stdout).toContain("my custom report.md");
  }, 30_000);

  it("overwrites an existing output file", () => {
    const target = join(outDir, "existing.md");
    writeFileSync(target, "old content");
    runCli("review", "--repo", repo, "--output", target);

    expect(readFileSync(target, "utf8")).not.toContain("old content");
  }, 30_000);

  it("reports a clear error when the report cannot be written", () => {
    const target = join(outDir, "missing-folder", "report.md");
    const run = runCli("review", "--repo", repo, "--output", target);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Could not write the report to");
    expect(run.stderr).toContain("missing-folder");
    expect(existsSync(target)).toBe(false);
  }, 30_000);

  it("shows summary counts in Markdown, including when no validations were requested", () => {
    runCli("review", "--repo", repo, "--output", "summary-none.md");
    const none = readFileSync(join(outDir, "summary-none.md"), "utf8");
    expect(none).toContain("- Changed files: 1");
    expect(none).toContain("- Validations: none requested");

    runCli(
      "review", "--repo", repo, "--output", "summary-mixed.md",
      "--validate", `node -e "process.exit(1)"`,
      "--validate", `node -e "console.log('ok')"`,
      "--validate", `node -e "console.log('ok')"`,
    );
    const mixed = readFileSync(join(outDir, "summary-mixed.md"), "utf8");
    expect(mixed).toContain("- Validations: 2 passed, 1 failed");
  }, 30_000);

  it("writes valid JSON to review-report.json with matching results and counts", () => {
    const run = runCli(
      "review", "--repo", repo, "--format", "json",
      "--validate", `node -e "console.log('json-ok')"`,
      "--validate", `node -e "console.error('json-bad');process.exit(6)"`,
    );

    // A failed validation still produces the report and exit code 1.
    expect(run.status).toBe(1);
    const data = JSON.parse(readFileSync(join(outDir, "review-report.json"), "utf8"));
    expect(data.repository).toEqual({ path: repo, baseRef: "main" });
    expect(data.changedFiles).toEqual([{ path: "feature.txt", status: "added" }]);
    expect(data.summary).toEqual({
      changedFiles: 1,
      validations: { requested: true, total: 2, passed: 1, failed: 1 },
    });
    expect(data.validationResults).toHaveLength(2);
    expect(data.validationResults[0]).toMatchObject({ status: "passed" });
    expect(data.validationResults[1]).toMatchObject({
      status: "failed",
      detail: "exited with code 6",
    });
    expect(data.validationResults[1].output).toContain("json-bad");
  }, 30_000);

  it("lets --output take precedence for JSON and marks validations as not requested", () => {
    runCli("review", "--repo", repo, "--format", "json", "--output", "custom name.json");

    const data = JSON.parse(readFileSync(join(outDir, "custom name.json"), "utf8"));
    expect(data.summary.validations).toEqual({ requested: false, total: 0, passed: 0, failed: 0 });
  }, 30_000);
});

describe("MCP entry point", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: "interface-test", version: "1.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [tsx, mcpEntry],
        cwd: projectRoot,
        stderr: "pipe",
      }),
    );
  }, 30_000);

  afterAll(async () => {
    await client.close();
  });

  it("advertises an inspection-only tool with no way to pass commands", async () => {
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(["review_repository"]);
    const properties = Object.keys(tools[0].inputSchema.properties ?? {});
    expect(properties.sort()).toEqual(["baseRef", "repoPath"]);
  });

  it("reviews the repository named by repoPath, not the server's own folder", async () => {
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repoPath: repo },
    });

    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(result.isError).toBeFalsy();
    expect(text).toContain("feature.txt (added)");

    // Same repository and base ref through the CLI gives the identical report.
    runCli("review", "--repo", repo, "--output", "cli-for-comparison.md");
    expect(text).toBe(readFileSync(join(outDir, "cli-for-comparison.md"), "utf8"));
  }, 30_000);

  it("does not run a validation command even if a client sends one", async () => {
    // Validation commands run inside the repository, so the marker lands there.
    const command = `node -e "require('fs').writeFileSync('command-ran.txt','x')"`;
    const marker = join(repo, "command-ran.txt");

    // Control: the same command does create the marker when run through the CLI.
    const cliRun = runCli("review", "--repo", repo, "--validate", command);
    expect(cliRun.status).toBe(0);
    expect(existsSync(marker)).toBe(true);
    rmSync(marker);

    // Over MCP the field is ignored: a normal report comes back and nothing runs.
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repoPath: repo, validationCommands: [command] },
    });

    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(existsSync(marker)).toBe(false);
    expect(result.isError).toBeFalsy();
    expect(text).toContain("feature.txt (added)");
    expect(text).not.toContain("command-ran.txt");
    expect(text).not.toContain("Status:");
  }, 30_000);

  it("returns a readable error instead of crashing on a bad base ref", async () => {
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repoPath: repo, baseRef: "--output=x" },
    });

    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(result.isError).toBe(true);
    expect(text).toContain("Invalid base ref");
  });
});
