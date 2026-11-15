import type { ChangedFile, ValidationResult } from "./types.js";

type ReportInput = {
  repositoryPath: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};

export function markdownReport(input: ReportInput): string {
  const lines = [`# Review Report: ${input.repositoryPath}`, "", "## Changed files"];
  for (const file of input.changedFiles) {
    lines.push(`- ${file.path} (${file.status})`);
  }
  lines.push("", "## Validation output");
  for (const result of input.validationResults) {
    const status =
      result.status === "passed" ? "Status: passed" : `Status: FAILED (${result.detail ?? "unknown reason"})`;
    lines.push(`### ${result.command}`, status, "```", result.output || "(no output)", "```");
  }
  return lines.join("\n");
}