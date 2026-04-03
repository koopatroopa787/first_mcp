# MCP PC Control Server

A powerful Model Context Protocol (MCP) server that provides comprehensive PC control capabilities including file operations, directory management, command execution, system inspection, and process management. Designed to give AI assistants (Claude, GPT, Gemini, etc.) full, efficient control over the host machine.

## Features

### File Operations
- **read_file** - Read complete file contents with proper encoding
- **read_file_lines** - Read a specific range of lines from a file (efficient for large files)
- **write_file** - Create new files or overwrite existing ones
- **append_to_file** - Append content to a file without overwriting it
- **edit_file** - Make precise text-based edits with diff output
- **copy_file** - Copy a file to a new location (source preserved)
- **delete_file** - Remove files from the filesystem
- **move_file** - Move or rename files and directories
- **get_file_info** - Get detailed file metadata (size, timestamps, permissions, readability)

### Directory Operations
- **create_directory** - Create directories (supports nested creation)
- **list_directory** - List directory contents with detailed information
- **delete_directory** - Recursively delete directories and their contents
- **search_files** - Recursively search for files matching name patterns

### Content Search
- **search_in_files** - Grep-like search for text content within files, with optional file-pattern filtering and case-insensitive mode

### System Operations
- **execute_command** - Execute shell commands with optional working directory and configurable timeout
- **get_system_info** - Get OS, CPU, memory, uptime, hostname, and network interface details
- **list_processes** - List running processes with optional name filter
- **get_environment** - Read environment variables (one or all)

## Installation

1. Clone or download this repository
2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage

### Running the Server

The server communicates via stdio and is designed to be used with MCP clients:

```bash
npm start
```

### Configuration with Claude Desktop

Add this server to your Claude Desktop configuration file:

**On macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**On Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pc-control": {
      "command": "node",
      "args": ["/absolute/path/to/first_mcp/build/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/first_mcp` with the actual absolute path to this project directory.

### Configuration with Other AI Clients

Any MCP-compatible client (Claude, Cursor, Windsurf, Continue, etc.) can connect to this server using the same stdio transport approach. Point the client at the built `build/index.js` with `node`.

### Example with npx (Alternative)

```json
{
  "mcpServers": {
    "pc-control": {
      "command": "npx",
      "args": ["-y", "mcp-pc-control-server"]
    }
  }
}
```

## Available Tools

### read_file
```typescript
{ path: string }
```

### read_file_lines
```typescript
{
  path: string,
  start: number,  // 1-based, inclusive
  end?: number    // 1-based, inclusive (omit to read to end)
}
```

### write_file
```typescript
{ path: string, content: string }
```

### append_to_file
```typescript
{ path: string, content: string }
```

### edit_file
```typescript
{
  path: string,
  edits: [{ oldText: string, newText: string }]
}
```

### copy_file
```typescript
{ source: string, destination: string }
```

### create_directory
```typescript
{ path: string }
```

### list_directory
```typescript
{ path: string }
```

### delete_file
```typescript
{ path: string }
```

### delete_directory
```typescript
{ path: string }
```

### move_file
```typescript
{ source: string, destination: string }
```

### get_file_info
```typescript
{ path: string }
```

### execute_command
```typescript
{
  command: string,
  workingDirectory?: string,
  timeout?: number  // ms, default 30000
}
```

### search_files
```typescript
{ path: string, pattern: string }  // pattern supports * and **
```

### search_in_files
```typescript
{
  path: string,
  query: string,
  filePattern?: string,     // e.g. "*.ts"
  caseSensitive?: boolean   // default false
}
```

### get_system_info
```typescript
{}  // no arguments required
```

### list_processes
```typescript
{ filter?: string }  // optional substring filter on process name
```

### get_environment
```typescript
{ variable?: string }  // omit to get all env vars
```

## Security Considerations

**WARNING:** This server provides powerful filesystem and command execution capabilities.

- **File Access:** Can read, write, and delete any files the process has permissions for
- **Command Execution:** Can execute arbitrary shell commands
- **No Sandboxing:** Operations are not sandboxed or restricted

**Recommendations:**
- Only use with trusted MCP clients
- Run with minimal necessary permissions
- Be cautious with the `execute_command` and `delete_directory` tools
- Consider implementing additional access controls for production use
- Review all operations in sensitive environments

## Development

### Build
```bash
npm run build
```

### Watch Mode
```bash
npm run watch
```

### Project Structure
```
.
├── src/
│   └── index.ts          # Main server implementation
├── build/                # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Troubleshooting

### Server not appearing in Claude Desktop

1. Check that the path in `claude_desktop_config.json` is absolute and correct
2. Verify the build directory exists and contains `index.js`
3. Restart Claude Desktop after configuration changes
4. Check Claude Desktop logs for errors

### Permission Errors

- Ensure the server process has necessary file system permissions
- On Unix systems, check file/directory permissions with `ls -la`
- Run with appropriate user privileges for the operations you need

### Command Execution Issues

- Verify the working directory exists and is accessible
- Check that shell commands are appropriate for your operating system
- Increase the `timeout` parameter for long-running commands
- Some commands may require specific environment variables
