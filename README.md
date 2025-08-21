# File System Explorer MCP Server

A secure TypeScript MCP (Model Context Protocol) server that allows natural language querying of your filesystem using Google's Gemini AI. Users can ask questions like "Where can I find my resume documents?" and get intelligent responses powered by AI-driven filesystem exploration.

## Features

- **Natural Language Queries**: Ask questions about your files in plain English
- **AI-Powered Planning**: Gemini AI analyzes queries and creates execution plans
- **Secure Filesystem Access**: All operations are contained within a configured root directory
- **Multiple Tool Types**: List files, search by name, read text files, and get file metadata
- **React Client Interface**: User-friendly web interface for interactions
- **Comprehensive Security**: Input sanitization, path validation, and rate limiting
- **Detailed Logging**: Audit trail of all AI decisions and tool executions

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React Client  │───▶│  MCP Server      │───▶│  Gemini AI      │
│   (Vite SPA)    │    │  (TypeScript)    │    │  Agent          │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ Filesystem      │
                       │ Tools           │
                       │ (Secure)        │
                       └─────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:
- Set `GEMINI_API_KEY` to your Google AI API key
- Set `ROOT_DIR` to the directory you want to explore (defaults to `./sandbox`)
- Set `API_TOKEN` to a secure token for client authentication

### 3. Create Sandbox Directory

```bash
mkdir sandbox
# Add some test files and directories
mkdir sandbox/documents sandbox/projects
echo "John Doe Resume" > sandbox/documents/resume.txt
echo "My Project" > sandbox/projects/readme.md
```

### 4. Build and Run

```bash
# Development mode (with hot reload)
npm run dev

# Or build and run for production
npm run build
npm start
```

The server will start on `http://localhost:3001`.

### 5. Test the API

```bash
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Token: token" \
  -d '{"text": "What files are in the documents folder?"}'
```

## Available Tools

The MCP server exposes these secure filesystem tools to the AI agent:

### `list_files(dir, page?, limit?)`
- Lists files and directories in the specified path
- Supports pagination for large directories
- Returns metadata: name, isDir, size, modification time

### `read_file(path, maxBytes?)`
- Reads content of text files (max 200KB by default)
- Automatically detects and rejects binary files
- Returns meaningful error codes for various failure cases

### `search_files(directory, query, depth?, limit?)`
- Searches for files by name (not content) within directory tree
- Configurable search depth and result limits
- Case-insensitive filename matching

### `get_file_info(path)`
- Returns detailed metadata about files or directories
- Includes size, modification time, and file permissions

## API Endpoints

### `POST /api/query`

Submit a natural language query about the filesystem.

**Headers:**
- `Content-Type: application/json`
- `X-API-Token: <your-api-token>`

**Request Body:**
```json
{
  "text": "Where can I find my resume documents?"
}
```

**Response:**
```json
{
  "success": true,
  "explanation": "I'll search for files containing 'resume' in their name.",
  "data": { /* Tool execution results */ },
  "toolCalls": [
    {
      "tool": "search_files",
      "params": { "directory": ".", "query": "resume" },
      "result": { /* Search results */ }
    }
  ]
}
```

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "rootDir": "/path/to/root"
}
```

## Security Features

### Path Security
- All paths are resolved relative to the configured `ROOT_DIR`
- Directory traversal attacks (`../../../etc/passwd`) are prevented
- Absolute paths are rejected
- Null byte injection protection

### Input Validation
- API token validation using timing-safe comparison
- File path sanitization and validation
- Search query sanitization to prevent regex injection
- File size limits for read operations

### Rate Limiting
- Configurable per-client rate limiting
- Memory-based implementation with automatic cleanup
- Prevents abuse and resource exhaustion

### Logging and Auditing
- All AI decisions and tool calls are logged
- Sensitive information is sanitized in logs
- Structured JSON logging for easy analysis

## React Client

The included React client provides a user-friendly interface:

- **Natural Language Input**: Text area for asking questions
- **Example Queries**: Pre-built query suggestions
- **Rich Result Display**: Formatted file listings, search results, and file content
- **Query History**: Recent queries with success/failure indicators
- **Real-time Feedback**: Loading states and error handling

### Client Features

- File and directory icons for easy identification
- Formatted file sizes and modification dates
- Expandable tool call results
- Copy-paste friendly file paths
- Responsive design for mobile and desktop

## Development

### Project Structure

```
src/
├── server.ts           # Main Express server
├── filesystem-tools.ts # Secure filesystem operations
├── gemini-agent.ts     # Gemini AI integration
├── security.ts        # Security utilities
└── logger.ts          # Logging utilities

client/                 # React client (included as artifact)
├── src/
│   └── App.tsx        # Main React component
└── package.json       # Client dependencies
```

### Available Scripts

```bash
npm run dev         # Development server with hot reload
npm run build       # Build for production
npm start          # Start production server
npm run type-check # TypeScript type checking
npm run lint       # ESLint code linting
npm test           # Run tests
npm run clean      # Clean build directory
```

### Testing

Basic API testing with curl:

```bash
# Test health endpoint
curl http://localhost:3001/health

# Test file listing
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your-token" \
  -d '{"text": "List all files in the root directory"}'

# Test file search
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your-token" \
  -d '{"text": "Find files containing the word config"}'

# Test file reading
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your-token" \
  -d '{"text": "Read the contents of readme.txt"}'
```

## Example Queries

Here are some example natural language queries you can try:

### File Discovery
- "Where can I find my resume documents?"
- "Show me all PDF files"
- "What configuration files do I have?"
- "Find files modified in the last week"

### Directory Exploration
- "What's in the documents folder?"
- "List all directories in the root"
- "Show me the structure of the projects directory"
- "What files are in the largest directory?"

### Content Analysis
- "Read the README file"
- "Show me the contents of config.json"
- "What's in that error log file?"
- "Display the first part of the license file"

### File Information
- "Get details about that large file"
- "When was the database file last modified?"
- "What's the size of the backup directory?"
- "Show me information about all image files"

## Deployment

### Production Considerations

1. **Environment Variables**: Use secure, randomly generated tokens
2. **HTTPS**: Deploy behind a reverse proxy with SSL/TLS
3. **Rate Limiting**: Configure appropriate limits for your use case
4. **File Permissions**: Run with minimal required filesystem permissions
5. **Monitoring**: Set up logging aggregation and monitoring
6. **Backup**: Regular backups of important directories

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY .env ./

USER node
EXPOSE 3001

CMD ["node", "dist/server.js"]
```

Build and run:

```bash
npm run build
docker build -t mcp-filesystem-server .
docker run -p 3001:3001 -v /your/files:/app/sandbox mcp-filesystem-server
```

### Environment-Specific Configuration

#### Development
```env
NODE_ENV=development
LOG_LEVEL=debug
ROOT_DIR=./sandbox
```

#### Production
```env
NODE_ENV=production
LOG_LEVEL=info
ROOT_DIR=/app/data
RATE_LIMIT_MAX_REQUESTS=30
```

## Troubleshooting

### Common Issues

**"Invalid API token" Error**
- Check that `X-API-Token` header matches your `.env` file
- Ensure no extra whitespace in the token

**"Directory access denied" Error**
- Verify the requested path is within `ROOT_DIR`
- Check filesystem permissions

**"Gemini API call failed" Error**
- Verify your `GEMINI_API_KEY` is valid and active
- Check your Google AI quota and billing status

**"File too large" Error**
- Files over 200KB cannot be read by default
- Adjust `maxBytes` parameter or use `get_file_info` instead

### Debug Mode

Enable detailed logging:

```bash
LOG_LEVEL=debug npm run dev
```

This will show:
- All API requests and responses
- Gemini AI prompts and responses
- Tool execution details
- Security validation steps

## Security Best Practices

### Server Security
- Always run with minimal required file permissions
- Use strong, unique API tokens
- Implement proper HTTPS in production
- Regular security updates for dependencies
- Monitor for unusual access patterns

### Filesystem Security
- Set `ROOT_DIR` to the most restrictive path possible
- Avoid exposing system directories
- Use read-only mounts when possible
- Regular backup of important data
- File integrity monitoring

### AI Security
- Monitor AI responses for unexpected behavior
- Log all AI decisions for audit purposes
- Implement query complexity limits
- Rate limit expensive operations
- Review Gemini usage and costs regularly

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes with proper TypeScript types
4. Add tests for new functionality
5. Run linting and type checking: `npm run lint && npm run type-check`
6. Submit a pull request with detailed description

### Code Style
- Use TypeScript strict mode
- Follow existing code formatting
- Add JSDoc comments for public APIs
- Include error handling for all external calls
- Write meaningful commit messages

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review server logs for error details
3. Test with curl to isolate client vs server issues
4. Create an issue with reproduction steps

## Roadmap

Future enhancements planned:
- [ ] Content-based file search (not just filename)
- [ ] File upload/modification capabilities
- [ ] Integration with other MCP servers
- [ ] Enhanced AI context with file content analysis
- [ ] Real-time file system watching
- [ ] Multi-user support with permissions
- [ ] Plugin system for custom tools