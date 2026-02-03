import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClobClientWrapper } from "../client.js";
import { registerMarketTools } from "./markets.js";
import { registerOrderbookTools } from "./orderbook.js";
import { registerAccountTools } from "./account.js";
import { registerTradingTools } from "./trading.js";

export function registerAllTools(server: McpServer, clientWrapper: ClobClientWrapper): void {
  const isReadonly = clientWrapper.isReadonly();

  console.error(`Registering tools (readonly: ${isReadonly})`);

  // Register read-only tools
  registerMarketTools(server, clientWrapper);
  registerOrderbookTools(server, clientWrapper);
  registerAccountTools(server, clientWrapper);

  // Register trading tools (write tools are conditionally included)
  registerTradingTools(server, clientWrapper, !isReadonly);

  console.error("All tools registered successfully");
}
