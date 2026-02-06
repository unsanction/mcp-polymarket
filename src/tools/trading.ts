import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Side as ClobSide, OrderType } from "@polymarket/clob-client";
import { ClobClientWrapper } from "../client.js";
import { OrderResult, TradeInfo, Side } from "../types.js";

const PlaceOrderSchema = z.object({
  token_id: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  size: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, "Size must be a positive number"),
  price: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0 && num < 1;
  }, "Price must be between 0 and 1 (exclusive)"),
});

const PlaceMarketOrderSchema = z.object({
  token_id: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  amount: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, "Amount must be a positive number"),
  order_type: z.enum(["FOK", "FAK"]).optional().default("FOK"),
});

const CancelOrderSchema = z.object({
  order_id: z.string().min(1),
});

const GetTradesSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20),
});

interface RawMarketInfo {
  minimum_tick_size?: number;
  neg_risk?: boolean;
}

interface RawOrderResponse {
  orderID?: string;
  status?: string;
  errorMsg?: string;
}

interface RawTrade {
  id: string;
  asset_id: string;
  side: string;
  price: string;
  size: string;
  timestamp?: string;
  match_time?: string;
  status: string;
}

async function getMarketInfoForToken(
  clientWrapper: ClobClientWrapper,
  tokenId: string
): Promise<{ tickSize: number; negRisk: boolean }> {
  const client = clientWrapper.getClient();
  try {
    const marketInfo = (await client.getMarket(tokenId)) as RawMarketInfo;
    return {
      tickSize: marketInfo.minimum_tick_size || 0.01,
      negRisk: marketInfo.neg_risk || false,
    };
  } catch {
    return {
      tickSize: 0.01,
      negRisk: false,
    };
  }
}

function mapSide(side: Side): ClobSide {
  return side === "BUY" ? ClobSide.BUY : ClobSide.SELL;
}

export function registerTradingTools(
  server: McpServer,
  clientWrapper: ClobClientWrapper,
  includeWriteTools: boolean
): void {
  // Get trades is always available (read-only)
  server.tool(
    "polymarket_get_trades",
    "Get recent executed trades for the configured wallet.",
    GetTradesSchema.shape,
    async (args) => {
      try {
        const { limit } = GetTradesSchema.parse(args);
        const client = clientWrapper.getClient();

        const allTrades = (await client.getTrades({})) as RawTrade[];
        const trades = (allTrades || []).slice(0, limit);

        const formatted: TradeInfo[] = trades.map((t) => ({
          id: t.id,
          token_id: t.asset_id,
          side: t.side,
          price: t.price,
          size: t.size,
          timestamp: t.timestamp || t.match_time || "",
          status: t.status,
        }));

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
              text: `Error fetching trades: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Only register write tools if not in readonly mode
  if (!includeWriteTools) {
    console.error("Readonly mode: trading tools (place_order, cancel_order, etc.) disabled");
    return;
  }

  server.tool(
    "polymarket_place_order",
    "Place a limit order on Polymarket. CAUTION: This executes a real trade with real funds. Price must be between 0 and 1, size in shares.",
    PlaceOrderSchema.shape,
    async (args) => {
      try {
        clientWrapper.ensureWriteAccess();

        const { token_id, side, size, price } = PlaceOrderSchema.parse(args);
        const client = clientWrapper.getClient();

        // Get market info for tick size and neg risk
        const { tickSize, negRisk } = await getMarketInfoForToken(clientWrapper, token_id);

        // Create the order
        const orderArgs = {
          tokenID: token_id,
          side: mapSide(side),
          size: parseFloat(size),
          price: parseFloat(price),
          feeRateBps: 0,
        };

        const signedOrder = await client.createOrder(orderArgs);

        // Post the order
        const response = (await client.postOrder(signedOrder)) as RawOrderResponse;

        const result: OrderResult = {
          order_id: response.orderID || "",
          status: response.status || "unknown",
          message: response.errorMsg,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ...result,
                  order_details: {
                    token_id,
                    side,
                    size,
                    price,
                    tick_size: tickSize,
                    neg_risk: negRisk,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error placing order: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "polymarket_place_market_order",
    `Place a market order on Polymarket for immediate execution.

CAUTION: This executes a REAL trade with REAL funds at market price!

**Parameters:**
- token_id: The token to trade
- side: "BUY" or "SELL"
- amount: For BUY — USD amount to spend. For SELL — number of shares to sell.
- order_type: "FOK" (Fill or Kill, default) or "FAK" (Fill and Kill — allows partial fills)

**Examples:**
- BUY $10 worth of Yes tokens: side="BUY", amount="10"
- SELL 5 shares at market: side="SELL", amount="5"`,
    PlaceMarketOrderSchema.shape,
    async (args) => {
      try {
        clientWrapper.ensureWriteAccess();

        const { token_id, side, amount, order_type } = PlaceMarketOrderSchema.parse(args);
        const client = clientWrapper.getClient();

        const marketOrderType = order_type === "FAK" ? OrderType.FAK : OrderType.FOK;
        const orderArgs = {
          tokenID: token_id,
          side: mapSide(side),
          amount: parseFloat(amount),
          orderType: marketOrderType as OrderType.FOK | OrderType.FAK,
        };

        const signedOrder = await client.createMarketOrder(orderArgs);
        const response = (await client.postOrder(
          signedOrder,
          orderArgs.orderType,
        )) as RawOrderResponse;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  order_id: response.orderID || "",
                  status: response.status || "unknown",
                  message: response.errorMsg,
                  order_details: {
                    token_id,
                    side,
                    amount,
                    order_type,
                    type: "MARKET",
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error placing market order: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "polymarket_cancel_order",
    "Cancel an existing order on Polymarket.",
    CancelOrderSchema.shape,
    async (args) => {
      try {
        clientWrapper.ensureWriteAccess();

        const { order_id } = CancelOrderSchema.parse(args);
        const client = clientWrapper.getClient();

        const response = await client.cancelOrder({ orderID: order_id });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  order_id,
                  status: "cancelled",
                  response,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error cancelling order: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

}
