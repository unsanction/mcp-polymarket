import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClobClientWrapper } from "../client.js";
import { OrderbookInfo, OrderbookEntry } from "../types.js";

const GetOrderbookSchema = z.object({
  token_id: z.string().min(1),
});

interface RawOrderbookEntry {
  price: string;
  size: string;
}

interface RawOrderbook {
  bids?: RawOrderbookEntry[];
  asks?: RawOrderbookEntry[];
}

function formatOrderbook(tokenId: string, rawOrderbook: RawOrderbook): OrderbookInfo {
  const formatEntries = (entries: RawOrderbookEntry[] | undefined): OrderbookEntry[] => {
    if (!entries) return [];
    return entries.map((e) => ({
      price: e.price,
      size: e.size,
    }));
  };

  return {
    token_id: tokenId,
    bids: formatEntries(rawOrderbook.bids),
    asks: formatEntries(rawOrderbook.asks),
  };
}

export function registerOrderbookTools(server: McpServer, clientWrapper: ClobClientWrapper): void {
  server.tool(
    "polymarket_get_orderbook",
    "Get the order book for a specific token showing current bids and asks with prices and sizes.",
    GetOrderbookSchema.shape,
    async (args) => {
      try {
        const { token_id } = GetOrderbookSchema.parse(args);
        const client = clientWrapper.getClient();
        const orderbook = await client.getOrderBook(token_id);
        const formatted = formatOrderbook(token_id, orderbook as RawOrderbook);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(formatted, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching orderbook: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
