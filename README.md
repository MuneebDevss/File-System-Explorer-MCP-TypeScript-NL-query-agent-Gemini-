# File-System-Explorer-MCP-TypeScript-NL-query-agent-Gemini-
TypeScript MCP server that accepts natural-language queries from a React (Vite) client (e.g. “Where can I find my resume documents?”), sends the query to the Gemini agent, uses the agent’s plan to call safe filesystem tools (list_files, read_file, search_files, get_file_info), and returns results to the client.
