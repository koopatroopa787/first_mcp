#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Define available tools
const TOOLS: Tool[] = [
  {
    name: "read_file",
    description: "Read the complete contents of a file from the file system. Handles various text encodings and returns the full file content. Use this to examine file contents before editing.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to read (absolute or relative)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Create a new file or completely overwrite an existing file with new content. Use with caution as it will overwrite existing files without warning. Handles text content with proper encoding.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path where the file should be written",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Make line-based edits to a text file. Provide original lines and their replacements. Returns a git-style diff showing the changes made. Each edit replaces exact line sequences with new content.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to edit",
        },
        edits: {
          type: "array",
          description: "Array of edit operations to apply",
          items: {
            type: "object",
            properties: {
              oldText: {
                type: "string",
                description: "The exact text to search for (can be multiple lines)",
              },
              newText: {
                type: "string",
                description: "The text to replace it with",
              },
            },
            required: ["oldText", "newText"],
          },
        },
      },
      required: ["path", "edits"],
    },
  },
  {
    name: "create_directory",
    description: "Create a new directory or ensure a directory exists. Can create multiple nested directories in one operation. If the directory already exists, this operation will succeed silently.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path of the directory to create",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_directory",
    description: "Get a detailed listing of all files and directories in a specified path. Results include names, types (file/directory), sizes, and modification times. Useful for understanding directory structure and finding files.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path of the directory to list",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "delete_file",
    description: "Permanently delete a file from the file system. This operation cannot be undone. The file is immediately removed from the storage device.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to delete",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "delete_directory",
    description: "Permanently delete a directory and all of its contents, including all files and subdirectories. This is a recursive operation that cannot be undone. Use with extreme caution.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the directory to delete",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "move_file",
    description: "Move or rename files and directories. Can move files between directories and rename them in a single operation. If the destination exists, the operation will fail.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "The current path of the file/directory",
        },
        destination: {
          type: "string",
          description: "The new path for the file/directory",
        },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "get_file_info",
    description: "Retrieve detailed metadata about a file or directory, including size, creation time, modification time, access time, type, and permissions. This does not read file contents.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file/directory",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "execute_command",
    description: "Execute shell commands on the system. SECURITY WARNING: This tool provides direct system access. Only use with trusted commands. Commands run with the same permissions as the MCP server process.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        workingDirectory: {
          type: "string",
          description: "The working directory for command execution (optional)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "search_files",
    description: "Recursively search for files matching a pattern in a directory. Supports wildcards (* and **) and returns matching file paths. Useful for finding files by name or extension.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The directory to search in",
        },
        pattern: {
          type: "string",
          description: "The pattern to match (e.g., '*.ts', '**/*.json')",
        },
      },
      required: ["path", "pattern"],
    },
  },
];

// Helper function to search files
async function searchFiles(
  dirPath: string,
  pattern: string
): Promise<string[]> {
  const results: string[] = [];

  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  const regex = new RegExp(regexPattern);

  async function search(currentPath: string) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(dirPath, fullPath);

        if (entry.isDirectory()) {
          await search(fullPath);
        } else if (regex.test(relativePath)) {
          results.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't access
    }
  }

  await search(dirPath);
  return results;
}

// Create server instance
const server = new Server(
  {
    name: "pc-control-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error("Arguments are required");
  }

  try {
    switch (name) {
      case "read_file": {
        const filePath = args.path as string;
        const content = await fs.readFile(filePath, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: content,
            },
          ],
        };
      }

      case "write_file": {
        const filePath = args.path as string;
        const content = args.content as string;

        // Ensure directory exists
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(filePath, content, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: `Successfully wrote to ${filePath}`,
            },
          ],
        };
      }

      case "edit_file": {
        const filePath = args.path as string;
        const edits = args.edits as Array<{
          oldText: string;
          newText: string;
        }>;

        let content = await fs.readFile(filePath, "utf-8");
        const originalContent = content;

        // Apply each edit
        for (const edit of edits) {
          if (!content.includes(edit.oldText)) {
            throw new Error(
              `Could not find text to replace: ${edit.oldText.substring(0, 100)}...`
            );
          }
          content = content.replace(edit.oldText, edit.newText);
        }

        await fs.writeFile(filePath, content, "utf-8");

        // Generate diff
        const diff = generateDiff(originalContent, content, filePath);

        return {
          content: [
            {
              type: "text",
              text: `Successfully edited ${filePath}\n\n${diff}`,
            },
          ],
        };
      }

      case "create_directory": {
        const dirPath = args.path as string;
        await fs.mkdir(dirPath, { recursive: true });
        return {
          content: [
            {
              type: "text",
              text: `Successfully created directory ${dirPath}`,
            },
          ],
        };
      }

      case "list_directory": {
        const dirPath = args.path as string;
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        const items = await Promise.all(
          entries.map(async (entry) => {
            const fullPath = path.join(dirPath, entry.name);
            const stats = await fs.stat(fullPath);
            return {
              name: entry.name,
              type: entry.isDirectory() ? "directory" : "file",
              size: stats.size,
              modified: stats.mtime.toISOString(),
            };
          })
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(items, null, 2),
            },
          ],
        };
      }

      case "delete_file": {
        const filePath = args.path as string;
        await fs.unlink(filePath);
        return {
          content: [
            {
              type: "text",
              text: `Successfully deleted file ${filePath}`,
            },
          ],
        };
      }

      case "delete_directory": {
        const dirPath = args.path as string;
        await fs.rm(dirPath, { recursive: true, force: true });
        return {
          content: [
            {
              type: "text",
              text: `Successfully deleted directory ${dirPath}`,
            },
          ],
        };
      }

      case "move_file": {
        const source = args.source as string;
        const destination = args.destination as string;

        // Ensure destination directory exists
        const destDir = path.dirname(destination);
        await fs.mkdir(destDir, { recursive: true });

        await fs.rename(source, destination);
        return {
          content: [
            {
              type: "text",
              text: `Successfully moved ${source} to ${destination}`,
            },
          ],
        };
      }

      case "get_file_info": {
        const filePath = args.path as string;
        const stats = await fs.stat(filePath);

        const info = {
          path: filePath,
          type: stats.isDirectory()
            ? "directory"
            : stats.isFile()
            ? "file"
            : "other",
          size: stats.size,
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
          accessed: stats.atime.toISOString(),
          permissions: stats.mode.toString(8).slice(-3),
          isReadable: fsSync.constants.R_OK,
          isWritable: fsSync.constants.W_OK,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      }

      case "execute_command": {
        const command = args.command as string;
        const workingDirectory = args.workingDirectory as string | undefined;

        const options = workingDirectory ? { cwd: workingDirectory } : {};
        const { stdout, stderr } = await execAsync(command, options);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  stdout: stdout,
                  stderr: stderr,
                  success: true,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "search_files": {
        const searchPath = args.path as string;
        const pattern = args.pattern as string;

        const results = await searchFiles(searchPath, pattern);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  matches: results,
                  count: results.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Simple diff generator
function generateDiff(
  original: string,
  modified: string,
  filepath: string
): string {
  const originalLines = original.split("\n");
  const modifiedLines = modified.split("\n");

  let diff = `--- ${filepath}\n+++ ${filepath}\n`;
  let lineNum = 0;

  while (
    lineNum < originalLines.length ||
    lineNum < modifiedLines.length
  ) {
    if (originalLines[lineNum] !== modifiedLines[lineNum]) {
      diff += `@@ -${lineNum + 1} +${lineNum + 1} @@\n`;

      if (lineNum < originalLines.length) {
        diff += `- ${originalLines[lineNum]}\n`;
      }
      if (lineNum < modifiedLines.length) {
        diff += `+ ${modifiedLines[lineNum]}\n`;
      }
    }
    lineNum++;
  }

  return diff;
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PC Control MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
