import { DEFAULT_BASE_REF, changedFiles } from "./git.js";
import type { ReportInput } from "./report.js";
import type { ReviewRequest } from "./types.js";
import { runValidations } from "./validation.js";

/**
 * Runs the review once and returns plain data. The CLI and the MCP server both
 * call this, then pick a report format, so every format shows the same results.
 */
export async function reviewRepository(request: ReviewRequest): Promise<ReportInput> {
  const baseRef = request.baseRef ?? DEFAULT_BASE_REF;
  const files = changedFiles(request.repositoryPath, baseRef);
  const validations = await runValidations(
    request.validationCommands ?? [],
    request.repositoryPath,
  );
  return {
    repositoryPath: request.repositoryPath,
    baseRef,
    changedFiles: files,
    validationResults: validations,
  };
}
