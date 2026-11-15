import { exec, execFile, type ChildProcess } from "node:child_process";
import type { ValidationResult } from "./types.js";

/** How long one validation command may run before it is stopped. */
export const DEFAULT_TIMEOUT_MS = 120_000;
/** How many characters of command output are kept in the report. */
export const DEFAULT_MAX_OUTPUT_CHARS = 20_000;
/** Hard cap on what we buffer in memory while the command runs. */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

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
 * Stops a command that ran too long. On Windows the whole process tree is
 * stopped. Elsewhere only the shell we started gets the signal, so a process
 * the command launched in the background can outlive the timeout.
 */
function stopCommand(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {});
    return;
  }
  child.kill("SIGTERM");
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
    let timedOut = false;
    const child = exec(
      command,
      { cwd, maxBuffer: MAX_BUFFER_BYTES },
      (error, stdout, stderr) => {
        clearTimeout(timer);
        if (!error) {
          resolve({
            command,
            status: "passed",
            output: boundOutput(stdout || stderr, maxOutputChars),
          });
          return;
        }

        // Node types `code` as a number, but it is a string for non-exit errors.
        const code: unknown = error.code;
        let detail: string;
        if (timedOut) {
          detail = `timed out after ${timeoutMs} ms and was stopped`;
        } else if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
          detail = `produced more than ${MAX_BUFFER_BYTES} bytes of output and was stopped`;
        } else if (typeof code === "number") {
          detail = `exited with code ${code}`;
        } else if (error.signal) {
          detail = `stopped by signal ${error.signal}`;
        } else {
          detail = `could not be run: ${error.message}`;
        }
        resolve({
          command,
          status: "failed",
          output: boundOutput(failedOutput(stdout, stderr), maxOutputChars),
          detail,
        });
      },
    );
    const timer = setTimeout(() => {
      timedOut = true;
      stopCommand(child);
    }, timeoutMs);
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
