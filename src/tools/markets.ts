import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClobClientWrapper } from "../client.js";
import { MarketInfo } from "../types.js";

const GetMarketsSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(10),
  offset: z.number().min(0).optional().default(0),
  search: z.string().optional(),
});

const GetMarketSchema = z.object({
  condition_id: z.string().optional(),
  slug: z.string().optional(),
});

interface GammaMarket {
  conditionId: string;
  question: string;
  slug: string;
  volume: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  clobTokenIds?: string[];
  outcomes?: string[];
  outcomePrices?: string[];
}

interface GammaResponse {
  data?: GammaMarket[];
}

async function fetchGammaMarkets(
  clientWrapper: ClobClientWrapper,
  limit: number,
  offset: number,
  search?: string
): Promise<GammaMarket[]> {
  const baseUrl = clientWrapper.getGammaApiUrl();
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
    active: "true",
  });

  if (search) {
    params.set("slug_contains", search.toLowerCase());
  }

  const url = `${baseUrl}/markets?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch markets: ${response.statusText}`);
  }

  const data = await response.json() as GammaMarket[];
  return Array.isArray(data) ? data : [];
}

async function fetchGammaMarket(
  clientWrapper: ClobClientWrapper,
  conditionId: string
): Promise<GammaMarket | null> {
  const baseUrl = clientWrapper.getGammaApiUrl();
  const url = `${baseUrl}/markets/${conditionId}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to fetch market: ${response.statusText}`);
  }

  return await response.json() as GammaMarket;
}

async function fetchGammaMarketBySlug(
  clientWrapper: ClobClientWrapper,
  slug: string
): Promise<GammaMarket | null> {
  const baseUrl = clientWrapper.getGammaApiUrl();
  const params = new URLSearchParams({
    slug: slug,
    limit: "1",
  });
  const url = `${baseUrl}/markets?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch market by slug: ${response.statusText}`);
  }

  const data = await response.json() as GammaMarket[];
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0];
}

function formatMarket(market: GammaMarket): MarketInfo {
  const tokens = [];
  const outcomes = market.outcomes || ["Yes", "No"];
  const prices = market.outcomePrices || [];
  const tokenIds = market.clobTokenIds || [];

  for (let i = 0; i < outcomes.length; i++) {
    tokens.push({
      token_id: tokenIds[i] || "",
      outcome: outcomes[i],
      price: prices[i] ? parseFloat(prices[i]) : 0,
    });
  }

  return {
    condition_id: market.conditionId,
    question: market.question,
    tokens,
    volume: market.volume || "0",
    end_date: market.endDate || "",
    active: market.active,
    closed: market.closed,
  };
}

export function registerMarketTools(server: McpServer, clientWrapper: ClobClientWrapper): void {
  server.tool(
    "polymarket_get_markets",
    "List available prediction markets on Polymarket. Returns market question, current prices for Yes/No outcomes, and trading volume.",
    GetMarketsSchema.shape,
    async (args) => {
      try {
        const { limit, offset, search } = GetMarketsSchema.parse(args);
        const markets = await fetchGammaMarkets(clientWrapper, limit, offset, search);
        const formatted = markets.map(formatMarket);

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
              text: `Error fetching markets: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "polymarket_get_market",
    `Get detailed information about a specific prediction market including token IDs, current prices, and market status.

Provide either condition_id or slug to look up a market.`,
    GetMarketSchema.shape,
    async (args) => {
      try {
        const { condition_id, slug } = GetMarketSchema.parse(args);

        if (!condition_id && !slug) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Either condition_id or slug is required",
              },
            ],
            isError: true,
          };
        }

        let market: GammaMarket | null = null;

        if (condition_id) {
          market = await fetchGammaMarket(clientWrapper, condition_id);
        } else if (slug) {
          market = await fetchGammaMarketBySlug(clientWrapper, slug);
        }

        if (!market) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Market not found: ${condition_id || slug}`,
              },
            ],
            isError: true,
          };
        }

        const formatted = formatMarket(market);

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
              text: `Error fetching market: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
