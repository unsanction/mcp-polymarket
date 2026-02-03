#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getClientWrapper } from "./client.js";
import { registerAllTools } from "./tools/index.js";

async function main(): Promise<void> {
  console.error("Starting Polymarket MCP Server...");

  // Initialize the CLOB client
  const clientWrapper = await getClientWrapper();
  console.error("CLOB client initialized");

  // Create MCP server
  const server = new McpServer({
    name: "polymarket",
    version: "1.0.0",
  });

  // Register all tools
  registerAllTools(server, clientWrapper);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Polymarket MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
