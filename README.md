# Repository Inspector

This is a small TypeScript developer tool that inspects changes in a Git
repository, runs optional validation commands, and produces a Markdown report.
It can be used from a command line or exposed to AI clients through MCP.

## Your task

Investigate the repository and improve it as you judge best. The starter works
for a narrow happy path, but production use may expose correctness, safety,
reliability, contract, output, documentation, or testing weaknesses.

You are not expected to finish everything. We care about how you investigate,
prioritize, implement, verify, and explain a meaningful scope.

## Product decision

This tool may be used directly by developers and by AI coding agents. Decide
whether its production interface should be **CLI-first**, **MCP-first**, or
**hybrid**. Implement improvements consistent with your decision.

There is no preferred label. Explain:

- The primary user and execution environment you assumed.
- The trust boundary and allowed capabilities.
- Reliability, discoverability, latency/context, and output-size tradeoffs.
- How the interfaces you continue to advertise stay behaviorally consistent.
- What evidence would change your decision.

## Time and rules

- Maximum **90 focused minutes** within 48 hours of receiving the invitation.
- Use AI coding tools freely. Verify their work and document at least one
  suggestion you corrected or rejected.
- Work in your own repository created from this template.
- Commit as you work and complete `SUBMISSION.md` in your final commit.
- Completion is not required. Accurate scope and verification matter more than
  a large diff.

## Setup

```bash
npm install
npm run typecheck
npm test
```

## CLI

```bash
npm run inspector -- review --repo ./path/to/repo --format markdown
npm run inspector -- review --repo ./path/to/repo --validate "npm test"
```

The report is written to `review-report.md` in the current directory.

The CLI is the primary interface. It is meant for a developer working in a
local repository they trust, because `--validate` runs the given text as a
shell command with the developer's own permissions.

- Paths containing spaces work when quoted: `--repo "C:\My Projects\app"`.
- A validation command that fails is recorded in the report as
  `Status: FAILED (...)` with its stdout and stderr (or `(no output)`). The
  report is still written, and the CLI exits with code 1.
- Each validation command is stopped after 120 seconds. Reported output is
  capped at 20,000 characters, keeping the end.
- `--base-ref` must not start with `-`.

## MCP

Start the stdio server with:

```bash
npm run mcp-server
```

It exposes one tool, `review_repository`, with this input:

| Field      | Type   | Required | Meaning                                      |
| ---------- | ------ | -------- | -------------------------------------------- |
| `repoPath` | string | yes      | Path of the local Git repository to inspect. |
| `baseRef`  | string | no       | Ref to compare against. Default: `main`.     |

It returns the same Markdown report as the CLI, as text.

### Intentional difference from the CLI

The MCP tool is **inspection-only: it cannot run validation commands.** An MCP
client is an AI agent, and its input can be steered by untrusted text (a file,
an issue, a web page). Letting it pass arbitrary shell commands would turn a
prompt injection into code execution on the developer's machine. Validation
therefore exists only in the CLI, where a person types the command. A
`validationCommands` field sent over MCP is ignored. Tests in
`test/interfaces.test.ts` check this.

What MCP can still do: read the names and status of changed files in any Git
repository the server's user account can read. It is not restricted to one
folder.

## Known limits

- Timeout: on Windows the whole process tree is stopped. On Linux and macOS
  only the shell that was started is signalled, so a background process the
  command launched may keep running.
- The output cap applies to what is reported. Up to 10 MB is held in memory
  while a command runs; beyond that the command is stopped and marked failed.
- Only committed changes between the base ref and `HEAD` are listed.
  Uncommitted and untracked files are not shown.
- `--format json` is accepted but not implemented; output is always Markdown.

## Project layout

```text
src/core.ts         shared review orchestration
src/cli.ts          command-line adapter
src/mcp-server.ts   MCP adapter
src/git.ts          Git inspection
src/validation.ts   validation execution
src/report.ts       Markdown report generation
test/               public starter tests
```

When finished, submit via **Security → Report a vulnerability** on this
repo — see `SECURITY.md` for exactly what to include. Do not reply by email;
that submission channel is not monitored.