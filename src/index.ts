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
import * as os from "os";
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
    name: "read_file_lines",
    description: "Read a specific range of lines from a text file. Returns only the requested lines, which is efficient for large files. Line numbers are 1-based.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to read",
        },
        start: {
          type: "number",
          description: "The first line to read (1-based, inclusive)",
        },
        end: {
          type: "number",
          description: "The last line to read (1-based, inclusive). Omit to read to end of file.",
        },
      },
      required: ["path", "start"],
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
    name: "append_to_file",
    description: "Append content to the end of an existing file without overwriting it. Creates the file if it does not exist. Useful for adding log entries, new lines, or additional data.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to append to",
        },
        content: {
          type: "string",
          description: "The content to append",
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
    name: "copy_file",
    description: "Copy a file to a new location. The source file is preserved. If the destination directory does not exist it will be created automatically.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "The path to the file to copy",
        },
        destination: {
          type: "string",
          description: "The destination path for the copied file",
        },
      },
      required: ["source", "destination"],
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
        timeout: {
          type: "number",
          description: "Maximum time in milliseconds to wait for the command to complete (default: 30000)",
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
  {
    name: "search_in_files",
    description: "Search for text content within files in a directory (like grep). Returns matching lines with file paths and line numbers. Supports optional file pattern filtering and case-insensitive search.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The directory to search in",
        },
        query: {
          type: "string",
          description: "The text or substring to search for",
        },
        filePattern: {
          type: "string",
          description: "Optional glob pattern to filter which files are searched (e.g. '*.ts')",
        },
        caseSensitive: {
          type: "boolean",
          description: "Whether the search is case-sensitive (default: false)",
        },
      },
      required: ["path", "query"],
    },
  },
  {
    name: "get_system_info",
    description: "Get comprehensive system information including operating system details, CPU architecture, total and free memory, system uptime, hostname, network interfaces, and the current user's home directory.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_processes",
    description: "List currently running processes on the system. On Unix/macOS uses 'ps', on Windows uses 'tasklist'. Optionally filter by process name.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Optional substring to filter processes by name",
        },
      },
    },
  },
  {
    name: "get_environment",
    description: "Read environment variables available to the MCP server process. Provide a specific variable name to get its value, or omit to get all variables.",
    inputSchema: {
      type: "object",
      properties: {
        variable: {
          type: "string",
          description: "Name of a specific environment variable to retrieve (omit for all)",
        },
      },
    },
  },
];

// Helper function to search files by name pattern
async function searchFiles(
  dirPath: string,
  pattern: string
): Promise<string[]> {
  const results: string[] = [];

  // Convert glob pattern to regex, properly escaping all special regex chars
  const regexPattern = pattern
    .replace(/[+?^${}()|[\]\\]/g, "\\$&")  // escape special regex chars (not . or *)
    .replace(/\./g, "\\.")                   // escape dots
    .replace(/\*\*/g, "\x00")               // temporarily mark **
    .replace(/\*/g, "[^/]*")                // * -> match within one segment
    .replace(/\x00/g, ".*");                // ** -> match across segments
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
    } catch {
      // Skip directories we can't access
    }
  }

  await search(dirPath);
  return results;
}

// Helper function to search file contents
interface ContentMatch {
  file: string;
  line: number;
  text: string;
}

async function searchInFiles(
  dirPath: string,
  query: string,
  filePattern?: string,
  caseSensitive = false
): Promise<ContentMatch[]> {
  const results: ContentMatch[] = [];

  const patternRegex = filePattern
    ? new RegExp(
        filePattern
          .replace(/[+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\./g, "\\.")
          .replace(/\*\*/g, "\x00")
          .replace(/\*/g, "[^/]*")
          .replace(/\x00/g, ".*")
      )
    : null;

  const searchRegex = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    caseSensitive ? "g" : "gi"
  );

  async function search(currentPath: string) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          await search(fullPath);
        } else {
          const relativePath = path.relative(dirPath, fullPath);
          if (patternRegex && !patternRegex.test(relativePath)) continue;

          try {
            const content = await fs.readFile(fullPath, "utf-8");
            const lines = content.split("\n");
            lines.forEach((text, idx) => {
              if (searchRegex.test(text)) {
                results.push({ file: fullPath, line: idx + 1, text: text.trim() });
              }
              searchRegex.lastIndex = 0;
            });
          } catch {
            // Skip binary or unreadable files
          }
        }
      }
    } catch {
      // Skip directories we can't access
    }
  }

  await search(dirPath);
  return results;
}

// Helper: check file access (readable / writable)
async function checkAccess(filePath: string, mode: number): Promise<boolean> {
  try {
    await fs.access(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

// Create server instance
const server = new Server(
  {
    name: "pc-control-server",
    version: "2.0.0",
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

      case "read_file_lines": {
        const filePath = args.path as string;
        const start = args.start as number;
        const end = args.end as number | undefined;

        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.split("\n");
        const startIdx = Math.max(0, start - 1);
        const endIdx = end !== undefined ? Math.min(end, lines.length) : lines.length;
        const slice = lines.slice(startIdx, endIdx);

        return {
          content: [
            {
              type: "text",
              text: slice.join("\n"),
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

      case "append_to_file": {
        const filePath = args.path as string;
        const content = args.content as string;

        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        await fs.appendFile(filePath, content, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: `Successfully appended to ${filePath}`,
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

      case "copy_file": {
        const source = args.source as string;
        const destination = args.destination as string;

        const destDir = path.dirname(destination);
        await fs.mkdir(destDir, { recursive: true });

        await fs.copyFile(source, destination);
        return {
          content: [
            {
              type: "text",
              text: `Successfully copied ${source} to ${destination}`,
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

        const [isReadable, isWritable] = await Promise.all([
          checkAccess(filePath, fsSync.constants.R_OK),
          checkAccess(filePath, fsSync.constants.W_OK),
        ]);

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
          isReadable,
          isWritable,
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
        const timeout = (args.timeout as number | undefined) ?? 30000;

        const options = {
          ...(workingDirectory ? { cwd: workingDirectory } : {}),
          timeout,
        };

        const { stdout, stderr } = await execAsync(command, options);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  stdout,
                  stderr,
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

      case "search_in_files": {
        const searchPath = args.path as string;
        const query = args.query as string;
        const filePattern = args.filePattern as string | undefined;
        const caseSensitive = (args.caseSensitive as boolean | undefined) ?? false;

        const results = await searchInFiles(searchPath, query, filePattern, caseSensitive);

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

      case "get_system_info": {
        const cpus = os.cpus();
        const networkInterfaces = os.networkInterfaces();

        // Simplify network interfaces for readability
        const networks: Record<string, { address: string; family: string }[]> = {};
        for (const [iface, addrs] of Object.entries(networkInterfaces)) {
          if (addrs) {
            networks[iface] = addrs.map((a) => ({ address: a.address, family: a.family }));
          }
        }

        const info = {
          platform: os.platform(),
          arch: os.arch(),
          release: os.release(),
          hostname: os.hostname(),
          homeDir: os.homedir(),
          tmpDir: os.tmpdir(),
          uptime: `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
          memory: {
            total: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            free: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            used: `${((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024).toFixed(2)} GB`,
          },
          cpu: {
            model: cpus[0]?.model ?? "unknown",
            cores: cpus.length,
            speed: `${cpus[0]?.speed ?? 0} MHz`,
          },
          networkInterfaces: networks,
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

      case "list_processes": {
        const filter = args.filter as string | undefined;
        const isWindows = os.platform() === "win32";

        // Use portable ps format: pid, user, %cpu, %mem, command
        const command = isWindows
          ? "tasklist /FO CSV /NH"
          : "ps -eo pid,user,%cpu,%mem,comm";

        const { stdout } = await execAsync(command, { timeout: 10000 });
        // Skip the header line on Unix (ps always prints one)
        const rawLines = stdout.trim().split("\n").filter(Boolean);
        const lines = isWindows ? rawLines : rawLines.slice(1);

        type ProcessEntry = Record<string, string>;
        const processes: ProcessEntry[] = lines.flatMap<ProcessEntry>((line) => {
          if (isWindows) {
            // RFC-4180 CSV: "Image Name","PID","Session Name","Session#","Mem Usage"
            const fields: string[] = [];
            let current = "";
            let inQuote = false;
            for (const ch of line) {
              if (ch === '"') { inQuote = !inQuote; }
              else if (ch === "," && !inQuote) { fields.push(current); current = ""; }
              else { current += ch; }
            }
            fields.push(current);
            if (fields.length < 5) return [];
            return [{ name: fields[0], pid: fields[1], memory: fields[4] }];
          } else {
            // Fixed columns from "ps -eo pid,user,%cpu,%mem,comm"
            const match = line.trim().match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
            if (!match) return [];
            return [{
              pid: match[1],
              user: match[2],
              cpu: `${match[3]}%`,
              mem: `${match[4]}%`,
              name: match[5].trim(),
            }];
          }
        });

        const filtered = filter
          ? processes.filter((p) =>
              p["name"]?.toLowerCase().includes(filter.toLowerCase())
            )
          : processes;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { processes: filtered, count: filtered.length },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_environment": {
        const variable = args.variable as string | undefined;

        if (variable) {
          const value = process.env[variable];
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { variable, value: value ?? null, found: value !== undefined },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(process.env, null, 2),
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
