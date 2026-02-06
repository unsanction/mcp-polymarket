import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AssetType } from "@polymarket/clob-client";
import { ClobClientWrapper } from "../client.js";
import { BalanceInfo, Position } from "../types.js";

const GetBalanceSchema = z.object({});

const GetPositionsSchema = z.object({
  redeemable: z.boolean().optional().default(false),
  market: z.string().optional(),
  limit: z.number().min(1).max(500).optional().default(100),
});

const UpdateAllowanceSchema = z.object({});

interface RawBalanceAllowance {
  balance?: string;
  allowance?: string;
}

interface DataApiPosition {
  asset: string;
  conditionId: string;
  curPrice: string;
  avgPrice: string;
  initialValue: string;
  currentValue: string;
  cashPnl: string;
  percentPnl: string;
  totalBought: string;
  realizedPnl: string;
  size: string;
  outcome: string;
  title: string;
  slug: string;
  endDate: string;
  redeemable: boolean;
  mergeable: boolean;
  negRisk: boolean;
}

async function fetchPositions(
  clientWrapper: ClobClientWrapper,
  redeemable: boolean,
  market?: string,
  limit: number = 100,
): Promise<DataApiPosition[]> {
  const baseUrl = clientWrapper.getDataApiUrl();
  const funder = clientWrapper.getFunder();

  const params = new URLSearchParams({
    user: funder,
    sizeThreshold: "0",
    limit: limit.toString(),
    sortBy: "CURRENT",
    sortDirection: "DESC",
  });

  if (redeemable) {
    params.set("redeemable", "true");
  }

  if (market) {
    params.set("market", market);
  }

  const url = `${baseUrl}/positions?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch positions: ${response.statusText}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data as DataApiPosition[] : [];
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
    `Get real positions (token holdings) for the configured wallet from Polymarket Data API.

Returns actual token balances with P&L, not just open orders.

**Parameters:**
- redeemable: Filter to only show redeemable (resolved) positions (default: false)
- market: Filter by condition ID (optional)
- limit: Max results 1-500 (default: 100)

**Response includes:**
- token_id, condition_id, outcome, size, avg_price, current_price
- pnl (cash P&L), pnl_percent
- redeemable/mergeable flags
- market title, slug, end_date`,
    GetPositionsSchema.shape,
    async (args) => {
      try {
        const { redeemable, market, limit } = GetPositionsSchema.parse(args);
        const positions = await fetchPositions(clientWrapper, redeemable, market, limit);

        const formatted: Position[] = positions.map((p) => ({
          token_id: p.asset,
          condition_id: p.conditionId,
          market: p.title || "Unknown",
          outcome: p.outcome || "Unknown",
          size: p.size,
          avg_price: p.avgPrice,
          current_price: p.curPrice,
          pnl: p.cashPnl,
          pnl_percent: p.percentPnl,
          redeemable: p.redeemable,
          mergeable: p.mergeable,
          slug: p.slug || "",
          end_date: p.endDate || "",
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ positions: formatted, count: formatted.length }, null, 2),
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

  server.tool(
    "polymarket_update_allowance",
    `Trigger a refresh of the USDC allowance for trading on Polymarket.

Use this when orders fail due to insufficient allowance. This tells the CLOB server to re-check and update the on-chain allowance state.`,
    UpdateAllowanceSchema.shape,
    async () => {
      try {
        const client = clientWrapper.getClient();

        await client.updateBalanceAllowance({
          asset_type: AssetType.COLLATERAL,
        });

        // Fetch updated balance to confirm
        const balanceData = await client.getBalanceAllowance({
          asset_type: AssetType.COLLATERAL,
        }) as RawBalanceAllowance;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  status: "updated",
                  balance: balanceData.balance || "0",
                  allowance: balanceData.allowance || "0",
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
              text: `Error updating allowance: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
