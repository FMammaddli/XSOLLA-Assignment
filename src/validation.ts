import { execFile, spawn, type ChildProcess } from "node:child_process";
import type { ValidationResult } from "./types.js";

/** How long one validation command may run before it is stopped. */
export const DEFAULT_TIMEOUT_MS = 120_000;
/** How many characters of command output are kept in the report. */
export const DEFAULT_MAX_OUTPUT_CHARS = 20_000;
/** Hard cap on the output we hold in memory while the command runs. */
const MAX_BUFFER_CHARS = 10 * 1024 * 1024;

export type ValidationOptions = {
  timeoutMs?: number;
  maxOutputChars?: number;
};

/** Keeps the end of long output, because failures are usually printed last. */
export function boundOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) {
    return output;
  }
  const note = `[output truncated: showing the last ${maxChars} of ${output.length} characters]`;
  return `${note}\n${output.slice(-maxChars)}`;
}

/**
 * Stops a command and the processes it started. Windows: taskkill on the
 * process tree. Elsewhere: the command runs in its own process group (see
 * `detached` below) and the whole group is signalled. A process that moves
 * itself to another group or ignores SIGTERM can still survive.
 */
function stopCommand(child: ChildProcess): void {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {});
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM"); // negative pid = the whole group
  } catch {
    // The group has already exited.
  }
}

function failedOutput(stdout: string, stderr: string): string {
  if (stdout && stderr) {
    return `${stdout}\n--- stderr ---\n${stderr}`;
  }
  return stdout || stderr;
}

export function runValidation(
  command: string,
  cwd: string,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;

  // A failed command is a normal result, so this promise never rejects.
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let stopReason: string | undefined;

    const child = spawn(command, {
      cwd,
      shell: true,
      detached: process.platform !== "win32",
      windowsHide: true,
    });

    const stop = (reason: string) => {
      if (stopReason === undefined) {
        stopReason = reason;
        stopCommand(child);
      }
    };
    const timer = setTimeout(
      () => stop(`timed out after ${timeoutMs} ms and was stopped`),
      timeoutMs,
    );
    const checkSize = () => {
      if (stdout.length + stderr.length > MAX_BUFFER_CHARS) {
        stop(`produced more than ${MAX_BUFFER_CHARS} characters of output and was stopped`);
      }
    };

    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
      checkSize();
    });
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
      checkSize();
    });

    const fail = (detail: string) => {
      clearTimeout(timer);
      resolve({
        command,
        status: "failed",
        output: boundOutput(failedOutput(stdout, stderr), maxOutputChars),
        detail,
      });
    };

    // "error" means the command could not be started at all (e.g. bad folder).
    child.on("error", (error) => fail(`could not be run: ${error.message}`));

    // "close" fires once the command has ended and its output is fully read.
    child.on("close", (code, signal) => {
      if (stopReason !== undefined) {
        fail(stopReason);
      } else if (code === 0) {
        clearTimeout(timer);
        resolve({
          command,
          status: "passed",
          output: boundOutput(stdout || stderr, maxOutputChars),
        });
      } else if (code !== null) {
        fail(`exited with code ${code}`);
      } else {
        fail(`stopped by signal ${signal}`);
      }
    });
  });
}

export async function runValidations(
  commands: string[],
  cwd: string,
  options: ValidationOptions = {},
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd, options));
  }
  return results;
}
