export type ChangedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked";
};

export type ValidationResult = {
  command: string;
  status: "passed" | "failed";
  output: string;
  /** Why the command failed, e.g. "exited with code 1". Only set on failure. */
  detail?: string;
};

export type ReviewSummary = {
  changedFiles: number;
  validations: { requested: boolean; total: number; passed: number; failed: number };
};

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  validationCommands?: string[];
};