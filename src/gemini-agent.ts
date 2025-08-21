import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger.js';

export interface ToolCall {
  tool: string;
  params: any;
}

export interface AgentPlan {
  explanation: string;
  toolCalls: ToolCall[];
}

export interface AgentContext {
  availableTools: Array<{
    name: string;
    description: string;
    parameters: string;
  }>;
  rootDirectory: {
    path: string;
    contents?: any[];
  };
  constraints: string[];
}

export class GeminiAgent {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  async generatePlan(userQuery: string, context: AgentContext): Promise<AgentPlan> {
    try {
      const prompt = this.createSystemPrompt(context) + '\n\n' + this.createUserPrompt(userQuery);
      
      logger.info('Sending request to Gemini', { 
        queryLength: userQuery.length,
        promptLength: prompt.length 
      });

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      logger.info('Received response from Gemini', { 
        responseLength: text.length 
      });

      // Parse the response
      const plan = this.parseResponse(text);
      
      logger.info('Parsed Gemini response', { 
        toolCallsCount: plan.toolCalls.length,
        tools: plan.toolCalls.map(tc => tc.tool)
      });

      return plan;

    } catch (error) {
      logger.error('Gemini API call failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      // Return a fallback plan
      return {
        explanation: 'I encountered an error while processing your request. I\'ll try a basic directory listing.',
        toolCalls: [{
          tool: 'list_files',
          params: { dir: '.', limit: 20 }
        }]
      };
    }
  }

  private createSystemPrompt(context: AgentContext): string {
    return `You are a filesystem exploration assistant. Your role is to help users find files and information by using the available filesystem tools.

AVAILABLE TOOLS:
${context.availableTools.map(tool => 
  `- ${tool.name}(${tool.parameters}): ${tool.description}`
).join('\n')}

CURRENT DIRECTORY OVERVIEW:
- Root path: ${context.rootDirectory.path}
- Top-level contents: ${context.rootDirectory.contents?.map(item => `${item.name}${item.isDir ? '/' : ''}`).join(', ') || 'Empty or inaccessible'}

CONSTRAINTS:
${context.constraints.map(constraint => `- ${constraint}`).join('\n')}

RESPONSE FORMAT:
You must respond with a JSON object containing:
{
  "explanation": "Brief explanation of your approach and what you're looking for",
  "toolCalls": [
    {
      "tool": "tool_name",
      "params": { "param1": "value1", "param2": "value2" }
    }
  ]
}

GUIDELINES:
1. Always provide an explanation of your reasoning
2. Use the most appropriate tools for the query
3. Start with broader searches and narrow down if needed
4. For file searches, use search_files with relevant keywords
5. For directory exploration, use list_files
6. To examine specific files, use read_file or get_file_info
7. Keep all paths relative (no leading slashes)
8. Limit results appropriately to avoid overwhelming the user

COMMON QUERY PATTERNS:
- "Find my resume" → search_files with query="resume"
- "What's in the documents folder?" → list_files with dir="documents"
- "Show me recent files" → list_files with sorting by modification time
- "Read this config file" → read_file with specific path`;
  }

  private createUserPrompt(userQuery: string): string {
    return `USER QUERY: ${userQuery}

Please analyze this query and respond with the appropriate tool calls in JSON format.`;
  }

  private parseResponse(text: string): AgentPlan {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate the structure
      if (!parsed.explanation || !Array.isArray(parsed.toolCalls)) {
        throw new Error('Invalid response structure');
      }

      // Validate each tool call
      const validatedToolCalls: ToolCall[] = parsed.toolCalls.map((toolCall: any) => {
        if (!toolCall.tool || typeof toolCall.tool !== 'string') {
          throw new Error('Invalid tool call: missing tool name');
        }

        if (!toolCall.params || typeof toolCall.params !== 'object') {
          throw new Error('Invalid tool call: missing or invalid params');
        }

        return {
          tool: toolCall.tool,
          params: toolCall.params
        };
      });

      return {
        explanation: parsed.explanation,
        toolCalls: validatedToolCalls
      };

    } catch (error) {
      logger.warn('Failed to parse Gemini response, using fallback', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        responsePreview: text.substring(0, 200)
      });

      // Fallback: try to infer intent from the response text
      return this.createFallbackPlan(text);
    }
  }

  private createFallbackPlan(responseText: string): AgentPlan {
    // Simple fallback logic based on response content
    const lowerResponse = responseText.toLowerCase();
    
    if (lowerResponse.includes('search') || lowerResponse.includes('find')) {
      return {
        explanation: 'I\'ll search for files based on your query.',
        toolCalls: [{
          tool: 'search_files',
          params: { directory: '.', query: 'document', limit: 10 }
        }]
      };
    }

    if (lowerResponse.includes('list') || lowerResponse.includes('show')) {
      return {
        explanation: 'I\'ll list the contents of the current directory.',
        toolCalls: [{
          tool: 'list_files',
          params: { dir: '.', limit: 20 }
        }]
      };
    }

    // Default fallback
    return {
      explanation: 'I\'ll start by exploring the root directory to understand the file structure.',
      toolCalls: [{
        tool: 'list_files',
        params: { dir: '.', limit: 15 }
      }]
    };
  }
}