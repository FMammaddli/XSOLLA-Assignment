# Submission

## What I investigated

I ran the starter tests, then tried passing and failing validation commands. The failing command stopped the review without recording its failure and could leave an old passing report. I prioritized this because it could mislead users.

## What I changed

With Claude Code's help, I:

- Recorded failed validations and their output, continued later checks, and returned CLI exit code 1 on validation failure.
- Added a 120-second timeout and a 20,000-character report-output limit.
- Fixed paths with spaces, the MCP field mismatch, the compiled CLI path, and duplicate test discovery after building.
- Made MCP inspection-only and rejected base refs starting with -.
- Added help, clear argument errors, custom report paths, JSON, summaries, and README updates.

MCP now accepts repoPath and baseRef. Clients using the original repo_path need updating.

## My interface decision

I chose CLI-first for developers reviewing trusted local repositories on their computer or in CI. CLI validations run with the user's permissions, so both commands and repository code must be trusted. MCP cannot run validations, but can inspect any repository its server account can read.

CLI exit codes and report files suit scripts. The --help option explains usage. MCP offers automatic tool discovery but needs a compatible client and server. CLI starts a process per run. MCP can reuse its server. MCP responses consume agent context directly, while CLI reports consume context when read. Validation output is capped. Changed-file lists are not.

Both interfaces share review logic and Markdown rendering, and a test compares their inspection reports. JSON uses the same data. Validation, JSON, and writing files are CLI-only features.

I would consider hybrid if agents needed validation and isolated execution was available, using developer-configured checks instead of arbitrary commands.

## AI use and a correction

I used ChatGPT for understanding, planning, and reviewing explanations. Claude Code implemented changes, wrote tests, ran checks, and helped with documentation. I manually checked passing and failing reports.

With ChatGPT's help, I requested a stronger MCP test. The original could pass because its command might fail. The revised test first proves the command works through CLI, then checks that MCP does not execute it.

## Verification and a blocker

On Windows, npm run typecheck and npm run build passed. The npm test command passed all 33 tests. The compiled CLI printed help successfully and wrote a failure report with exit code 1. Interface tests use real CLI and MCP processes, without mocks.

Linux CI initially hung during the timeout test because killing the shell left a child holding the output pipe open. Claude changed the runner to use spawn and signal the process group. Ubuntu CI then passed. Run 43725779219 verified 33 tests before this documentation rewrite.

A piped command also hid a type error in the first implementation commit. The next commit fixed it, and later checks examined exit codes explicitly.

## What I left out and remaining limits

I left uncommitted/untracked files, rename handling, MCP folder restrictions, configurable limits, output escaping, and JSON versioning for later.

Timeout tests do not prove every child process dies. Git errors can leave old reports. MCP has no response-size cap. I did not test macOS, default limits, the buffered-output limit, some process errors, or permission-denied writes. Compiled CLI checks were manual. I did not complete a full security audit.

My next three priorities are:

1. Include uncommitted/untracked files and improve base-ref errors.
2. Restrict MCP to a configured folder and cap responses.
3. Version JSON and expose structured results through MCP.

## Time spent

I estimated about 90 focused minutes. I started understanding the task before cloning at 17:22:59 Baku time on 15 November 2026 and finished the implementation and initial submission around 18:45. I revised this wording afterward.
