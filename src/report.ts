import type { ChangedFile, ReviewSummary, ValidationResult } from "./types.js";

/** The review results every report format is built from. */
export type ReportInput = {
  repositoryPath: string;
  baseRef?: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};

/** Counts used by both the Markdown and the JSON report. */
export function summarize(input: ReportInput): ReviewSummary {
  const passed = input.validationResults.filter((result) => result.status === "passed").length;
  return {
    changedFiles: input.changedFiles.length,
    validations: {
      requested: input.validationResults.length > 0,
      total: input.validationResults.length,
      passed,
      failed: input.validationResults.length - passed,
    },
  };
}

export function markdownReport(input: ReportInput): string {
  const summary = summarize(input);
  const validations = summary.validations.requested
    ? `${summary.validations.passed} passed, ${summary.validations.failed} failed`
    : "none requested";

  const lines = [
    `# Review Report: ${input.repositoryPath}`,
    "",
    "## Summary",
    `- Changed files: ${summary.changedFiles}`,
    `- Validations: ${validations}`,
    "",
    "## Changed files",
  ];
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

export function jsonReport(input: ReportInput): string {
  const data = {
    repository: { path: input.repositoryPath, baseRef: input.baseRef ?? null },
    summary: summarize(input),
    changedFiles: input.changedFiles,
    validationResults: input.validationResults,
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}
