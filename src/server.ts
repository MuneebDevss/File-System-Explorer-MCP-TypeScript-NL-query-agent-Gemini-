import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { FilesystemTools } from './filesystem-tools.js';
import { GeminiAgent } from './gemini-agent.js';
import { validateApiToken, sanitizePath, isWithinRootDir } from './security.js';
import { logger } from './logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const ROOT_DIR = path.resolve(process.env.ROOT_DIR || './sandbox');
const API_TOKEN = process.env.API_TOKEN || 'default-token';

// Middleware
app.use(cors());
app.use(express.json());

// Initialize components
const filesystemTools = new FilesystemTools(ROOT_DIR);
const geminiAgent = new GeminiAgent(process.env.GEMINI_API_KEY!);

// Types
interface QueryRequest {
  text: string;
}

interface QueryResponse {
  success: boolean;
  data?: any;
  explanation?: string;
  error?: string;
  toolCalls?: Array<{
    tool: string;
    params: any;
    result: any;
  }>;
}

// API Routes
app.post('/api/query', async (req, res) => {
  try {
    // Validate API token
    const token = req.headers['x-api-token'] as string;
    if (!validateApiToken(token, API_TOKEN)) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid API token' 
      });
    }

    const { text } = req.body as QueryRequest;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Query text is required' 
      });
    }

    logger.info('Processing query', { query: text });

    // Get root directory overview for context
    const rootOverview = await filesystemTools.list_files('.', 1, 10);
    
    // Create context for Gemini
    const context = {
      availableTools: [
        {
          name: 'list_files',
          description: 'List files and directories in a given path',
          parameters: 'dir: string, page?: number (default 1), limit?: number (default 50)'
        },
        {
          name: 'read_file',
          description: 'Read content of a text file (max 200KB)',
          parameters: 'path: string, maxBytes?: number'
        },
        {
          name: 'search_files',
          description: 'Search for files by name in a directory tree',
          parameters: 'directory: string, query: string, depth?: number (default 3), limit?: number (default 20)'
        },
        {
          name: 'get_file_info',
          description: 'Get metadata about a file or directory',
          parameters: 'path: string'
        }
      ],
      rootDirectory: {
        path: '.',
        contents: rootOverview.entries?.slice(0, 5) // Show top 5 items for context
      },
      constraints: [
        'All paths must be relative to the root directory',
        'Cannot access files outside the configured root directory',
        'File reading is limited to 200KB and text files only',
        'Search is by filename only, not file content',
        'Always return relative paths, never absolute paths'
      ]
    };

    // Get plan from Gemini
    const plan = await geminiAgent.generatePlan(text, context);
    
    // Execute the plan
    const toolCalls: QueryResponse['toolCalls'] = [];
    let finalResult: any = null;

    if (plan.toolCalls && plan.toolCalls.length > 0) {
      for (const toolCall of plan.toolCalls) {
        try {
          const result = await executeToolCall(toolCall.tool, toolCall.params);
          toolCalls.push({
            tool: toolCall.tool,
            params: toolCall.params,
            result
          });
          
          // Use the last result as the final result, or combine them
          finalResult = result;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          toolCalls.push({
            tool: toolCall.tool,
            params: toolCall.params,
            result: { error: errorMsg }
          });
          logger.error('Tool call failed', { tool: toolCall.tool, error: errorMsg });
        }
      }
    }

    const response: QueryResponse = {
      success: true,
      data: finalResult,
      explanation: plan.explanation,
      toolCalls
    };

    logger.info('Query completed successfully', { 
      toolCallsCount: toolCalls.length,
      hasData: !!finalResult
    });

    return res.json(response);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Internal server error';
    logger.error('Query processing failed', { error: errorMsg });
    
    return res.status(500).json({
      success: false,
      error: errorMsg
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    rootDir: ROOT_DIR
  });
});

// Execute tool calls with security validation
async function executeToolCall(tool: string, params: any): Promise<any> {
  // Validate tool exists
  const allowedTools = ['list_files', 'read_file', 'search_files', 'get_file_info'];
  if (!allowedTools.includes(tool)) {
    throw new Error(`Tool '${tool}' is not allowed`);
  }

  // Sanitize and validate paths in parameters
  if (params.path) {
    params.path = sanitizePath(params.path);
    if (!isWithinRootDir(ROOT_DIR, params.path)) {
      throw new Error('Path is outside allowed directory');
    }
  }

  if (params.dir) {
    params.dir = sanitizePath(params.dir);
    if (!isWithinRootDir(ROOT_DIR, params.dir)) {
      throw new Error('Directory is outside allowed directory');
    }
  }

  if (params.directory) {
    params.directory = sanitizePath(params.directory);
    if (!isWithinRootDir(ROOT_DIR, params.directory)) {
      throw new Error('Directory is outside allowed directory');
    }
  }

  // Execute the tool
  switch (tool) {
    case 'list_files':
      return await filesystemTools.list_files(
        params.dir || '.', 
        params.page, 
        params.limit
      );
    
    case 'read_file':
      return await filesystemTools.read_file(
        params.path, 
        params.maxBytes
      );
    
    case 'search_files':
      return await filesystemTools.search_files(
        params.directory || '.', 
        params.query, 
        params.depth, 
        params.limit
      );
    
    case 'get_file_info':
      return await filesystemTools.get_file_info(params.path);
    
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

// Start server
app.listen(PORT, () => {
  logger.info(`MCP File System Explorer server running on port ${PORT}`);
  logger.info(`Root directory: ${ROOT_DIR}`);
  logger.info(`Gemini API configured: ${!!process.env.GEMINI_API_KEY}`);
});

export { app };