#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { reviewRepository } from "./core.js";
import { jsonReport, markdownReport } from "./report.js";

const HELP = `Repository Inspector

Usage:
  inspector review --repo <path> [options]
  inspector --help

Options:
  --repo <path>         Git repository to inspect (required). Quote paths with spaces.
  --base-ref <ref>      Branch or commit to compare against. Default: main
  --validate <command>  Shell command to run in the repository. Can be repeated.
  --format <format>     markdown (default) or json
  --output <path>       Where to write the report. Relative paths start from the
                        current directory. Default: review-report.md, or
                        review-report.json with --format json. An existing file
                        is overwritten. The parent folder must already exist.
  --help, -h            Show this help and exit.

Examples:
  inspector review --repo .
  inspector review --repo "C:\\My Projects\\app" --base-ref develop
  inspector review --repo . --validate "npm test" --validate "npm run typecheck"
  inspector review --repo . --format json --output reports/review.json

When running from this project's source, replace "inspector" with
"npm run inspector --".

Exit codes:
  0  report written; all validation commands passed (or none were requested)
  1  report written but a validation failed, or the review or write failed
  2  invalid command-line arguments
`;

const FORMATS = ["markdown", "json"] as const;
type Format = (typeof FORMATS)[number];
const VALUE_OPTIONS = ["--repo", "--base-ref", "--format", "--validate", "--output"];

type Args = {
  help: boolean;
  command?: string;
  repositoryPath?: string;
  baseRef?: string;
  format: Format;
  output?: string;
  validations: string[];
};

/** A mistake in how the tool was called, as opposed to a failed review. */
class UsageError extends Error {}

function parseArgs(argv: string[]): Args {
  const args: Args = { help: false, format: "markdown", validations: [] };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (VALUE_OPTIONS.includes(token)) {
      const value = argv[++index];
      if (value === undefined || value === "" || VALUE_OPTIONS.includes(value)) {
        throw new UsageError(`Missing value for ${token}.`);
      }
      if (token === "--repo") args.repositoryPath = value;
      else if (token === "--base-ref") args.baseRef = value;
      else if (token === "--output") args.output = value;
      else if (token === "--validate") args.validations.push(value);
      else if (FORMATS.includes(value as Format)) args.format = value as Format;
      else throw new UsageError(`Unsupported format "${value}". Use markdown or json.`);
    } else if (token.startsWith("-")) {
      throw new UsageError(`Unknown option "${token}".`);
    } else if (args.command === undefined) {
      args.command = token;
    } else {
      throw new UsageError(`Unexpected argument "${token}".`);
    }
  }
  if (args.help) {
    return args;
  }
  if (args.command !== "review") {
    throw new UsageError(
      args.command ? `Unknown command "${args.command}".` : "Missing command. Use: inspector review",
    );
  }
  if (!args.repositoryPath) {
    throw new UsageError("Missing required option --repo <path>.");
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  const review = await reviewRepository({
    repositoryPath: args.repositoryPath!,
    baseRef: args.baseRef,
    validationCommands: args.validations,
  });
  const report = args.format === "json" ? jsonReport(review) : markdownReport(review);

  const defaultName = args.format === "json" ? "review-report.json" : "review-report.md";
  const outputPath = resolve(process.cwd(), args.output ?? defaultName);
  try {
    writeFileSync(outputPath, report, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not write the report to ${outputPath}: ${reason}`);
  }
  // Messages go to the terminal only; the report file contains nothing else.
  console.log(`Review report written to ${outputPath}`);

  // The report is always written; the exit code tells scripts whether validation passed.
  const failed = review.validationResults.filter((result) => result.status === "failed");
  if (failed.length > 0) {
    console.error(`${failed.length} validation command(s) failed. See the report.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  if (error instanceof UsageError) {
    console.error('Run "inspector --help" to see usage and examples.');
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
});
