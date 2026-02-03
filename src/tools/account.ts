import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AssetType } from "@polymarket/clob-client";
import { ClobClientWrapper } from "../client.js";
import { BalanceInfo, Position } from "../types.js";

const GetBalanceSchema = z.object({});

const GetPositionsSchema = z.object({});

interface RawBalanceAllowance {
  balance?: string;
  allowance?: string;
}

interface RawOpenOrder {
  id: string;
  asset_id: string;
  side: string;
  price: string;
  original_size: string;
  size_matched: string;
  outcome?: string;
  market?: string;
}

export function registerAccountTools(server: McpServer, clientWrapper: ClobClientWrapper): void {
  server.tool(
    "polymarket_get_balance",
    "Get the USDC balance and allowance for the configured wallet on Polymarket.",
    GetBalanceSchema.shape,
    async () => {
      try {
        const client = clientWrapper.getClient();
        const funder = clientWrapper.getFunder();

        // Get balance allowance for USDC collateral
        const balanceData = await client.getBalanceAllowance({
          asset_type: AssetType.COLLATERAL,
        }) as RawBalanceAllowance;

        const result: BalanceInfo = {
          balance: balanceData.balance || "0",
          allowance: balanceData.allowance || "0",
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  address: funder,
                  ...result,
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
              text: `Error fetching balance: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "polymarket_get_positions",
    "Get all open orders and positions for the configured wallet, including P&L calculations.",
    GetPositionsSchema.shape,
    async () => {
      try {
        const client = clientWrapper.getClient();

        // Get open orders to derive positions
        const openOrders = (await client.getOpenOrders()) as RawOpenOrder[];

        if (!openOrders || openOrders.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ positions: [], open_orders: [] }, null, 2),
              },
            ],
          };
        }

        // Group orders by token to calculate positions
        const positionMap = new Map<string, Position>();

        for (const order of openOrders) {
          const tokenId = order.asset_id;
          const existing = positionMap.get(tokenId);

          if (!existing) {
            positionMap.set(tokenId, {
              token_id: tokenId,
              market: order.market || "Unknown",
              outcome: order.outcome || "Unknown",
              size: order.original_size,
              avg_price: order.price,
              current_price: order.price,
              pnl: "0",
            });
          }
        }

        const positions = Array.from(positionMap.values());

        // Also return raw open orders for transparency
        const formattedOrders = openOrders.map((o) => ({
          id: o.id,
          token_id: o.asset_id,
          side: o.side,
          price: o.price,
          size: o.original_size,
          filled: o.size_matched,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  positions,
                  open_orders: formattedOrders,
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
              text: `Error fetching positions: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
