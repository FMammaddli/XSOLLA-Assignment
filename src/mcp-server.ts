#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { reviewRepository } from "./core.js";
import { markdownReport } from "./report.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

// Trust boundary: an MCP client is an AI agent whose input may be influenced by
// untrusted text. This tool is therefore inspection-only. It deliberately has
// no way to run validation commands; that capability exists only in the CLI,
// where a developer types the command themselves.
server.tool(
  "review_repository",
  "Read-only: lists files changed in a local Git repository compared with a base ref " +
    "and returns a Markdown report. Does not run validation commands; use the CLI for that.",
  {
    repoPath: z.string().min(1).describe("Path of the local Git repository to inspect."),
    baseRef: z.string().optional().describe('Branch or commit to compare against. Default: "main".'),
  },
  async ({ repoPath, baseRef }) => {
    try {
      const review = await reviewRepository({ repositoryPath: repoPath, baseRef });
      return { content: [{ type: "text", text: markdownReport(review) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Review failed: ${message}` }], isError: true };
    }
  },
);

await server.connect(new StdioServerTransport());
