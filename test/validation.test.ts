import { describe, expect, it } from "vitest";
import { markdownReport } from "../src/report.js";
import { boundOutput, runValidation } from "../src/validation.js";

const cwd = process.cwd();

describe("runValidation", () => {
  it("still reports a successful command as passed with its output", async () => {
    const result = await runValidation(`node -e "console.log('all good')"`, cwd);

    expect(result.status).toBe("passed");
    expect(result.output).toContain("all good");
    expect(result.detail).toBeUndefined();
  });

  it("records a failing command instead of throwing, keeping stdout and stderr", async () => {
    const result = await runValidation(
      `node -e "console.log('to stdout');console.error('to stderr');process.exit(3)"`,
      cwd,
    );

    expect(result.status).toBe("failed");
    expect(result.detail).toBe("exited with code 3");
    expect(result.output).toContain("to stdout");
    expect(result.output).toContain("to stderr");
  });

  it("explains a failure that printed nothing", async () => {
    const result = await runValidation(`node -e "process.exit(2)"`, cwd);
    const report = markdownReport({
      repositoryPath: ".",
      changedFiles: [],
      validationResults: [result],
    });

    expect(result.output).toBe("");
    expect(report).toContain("Status: FAILED (exited with code 2)");
    expect(report).toContain("(no output)");
  });
});

describe("validation limits", () => {
  it("stops a command that runs past the timeout and says so", async () => {
    const started = Date.now();
    const result = await runValidation(`node -e "setTimeout(() => {}, 30000)"`, cwd, {
      timeoutMs: 500,
    });

    expect(result.status).toBe("failed");
    expect(result.detail).toBe("timed out after 500 ms and was stopped");
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 15_000);

  it("keeps only the end of long output and labels the cut", async () => {
    const result = await runValidation(
      `node -e "console.log('x'.repeat(5000) + 'THE-END')"`,
      cwd,
      { maxOutputChars: 100 },
    );

    expect(result.status).toBe("passed");
    expect(result.output).toContain("[output truncated: showing the last 100 of");
    expect(result.output).toContain("THE-END");
    expect(result.output.length).toBeLessThan(250);
  });

  it("leaves short output untouched", () => {
    expect(boundOutput("short", 100)).toBe("short");
  });

  it("leaves output exactly at the cap untouched", () => {
    const exact = "a".repeat(100);
    expect(boundOutput(exact, 100)).toBe(exact);
  });

  it("cuts output one character over the cap, keeping the last characters", () => {
    const over = "X" + "a".repeat(100);
    const bounded = boundOutput(over, 100);

    expect(bounded).toContain("[output truncated: showing the last 100 of 101 characters]");
    expect(bounded.endsWith("a".repeat(100))).toBe(true);
    expect(bounded).not.toContain("X");
  });
});

describe("markdownReport status line", () => {
  it("marks passed commands as passed", () => {
    const report = markdownReport({
      repositoryPath: ".",
      changedFiles: [],
      validationResults: [{ command: "npm test", status: "passed", output: "ok" }],
    });

    expect(report).toContain("Status: passed");
    expect(report).not.toContain("FAILED");
  });
});
