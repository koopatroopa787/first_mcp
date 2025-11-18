# MCP PC Control Server

A powerful Model Context Protocol (MCP) server that provides comprehensive PC control capabilities including file operations, directory management, and command execution.

<a href="https://glama.ai/mcp/servers/@koopatroopa787/first_mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@koopatroopa787/first_mcp/badge" alt="PC Control Server MCP server" />
</a>

## Features

### File Operations
- **read_file** - Read complete file contents with proper encoding
- **write_file** - Create new files or overwrite existing ones
- **edit_file** - Make precise line-based edits with diff output
- **delete_file** - Remove files from the filesystem
- **move_file** - Move or rename files and directories
- **get_file_info** - Get detailed file metadata (size, timestamps, permissions)

### Directory Operations
- **create_directory** - Create directories (supports nested creation)
- **list_directory** - List directory contents with detailed information
- **delete_directory** - Recursively delete directories and their contents
- **search_files** - Recursively search for files matching patterns

### System Operations
- **execute_command** - Execute shell commands with optional working directory

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

### Example with npx (Alternative)

You can also run it directly with npx if published to npm:

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
{
  path: string  // Path to the file to read
}
```

### write_file
```typescript
{
  path: string,    // Path where file should be written
  content: string  // Content to write
}
```

### edit_file
```typescript
{
  path: string,
  edits: [{
    oldText: string,  // Exact text to find
    newText: string   // Replacement text
  }]
}
```

### create_directory
```typescript
{
  path: string  // Directory path to create
}
```

### list_directory
```typescript
{
  path: string  // Directory path to list
}
```

### delete_file
```typescript
{
  path: string  // File path to delete
}
```

### delete_directory
```typescript
{
  path: string  // Directory path to delete recursively
}
```

### move_file
```typescript
{
  source: string,      // Current path
  destination: string  // New path
}
```

### get_file_info
```typescript
{
  path: string  // Path to get info about
}
```

### execute_command
```typescript
{
  command: string,           // Shell command to execute
  workingDirectory?: string  // Optional working directory
}
```

### search_files
```typescript
{
  path: string,     // Directory to search in
  pattern: string   // Pattern to match (supports * and **)
}
```

## Security Considerations

**WARNING:** This server provides powerful filesystem and command execution capabilities.

- **File Access:** Can read, write, and delete any files the process has permissions for
- **Command Execution:** Can execute arbitrary shell commands
- **No Sandboxing:** Operations are not sandboxed or restricted

**Recommendations:**
- Only use with trusted MCP clients
- Run with minimal necessary permissions
- Be cautious with the `execute_command` tool
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
- Some commands may require specific environment variables