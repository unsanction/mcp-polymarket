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
  url: z.string().optional(),
});

interface GammaMarket {
  conditionId: string;
  question: string;
  slug: string;
  volume: string;
  volumeNum?: number;
  liquidityNum?: number;
  endDate: string;
  endDateIso?: string;
  description?: string;
  active: boolean;
  closed: boolean;
  acceptingOrders?: boolean;
  clobTokenIds?: string[] | string;
  outcomes?: string[] | string;
  outcomePrices?: string[] | string;
}

/**
 * Gamma API sometimes returns array fields as JSON strings instead of arrays.
 * e.g. clobTokenIds: '["abc","def"]' instead of ["abc","def"]
 */
function ensureArray(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* not valid JSON */ }
  }
  return [];
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
    order: "volume24hr",
    ascending: "false",
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

/**
 * Extract a Polymarket event slug from a URL.
 * Handles: https://polymarket.com/event/slug, polymarket.com/event/slug?params, raw slug
 */
function extractSlugFromUrl(url: string): string {
  const match = url.match(/(?:polymarket\.com\/event\/)([^/?#]+)/);
  return match ? match[1] : url.replace(/^\/+/, "");
}

function formatMarket(market: GammaMarket): MarketInfo {
  const tokens = [];
  const outcomes = ensureArray(market.outcomes);
  const prices = ensureArray(market.outcomePrices);
  const tokenIds = ensureArray(market.clobTokenIds);

  // Fall back to ["Yes", "No"] if no outcomes
  const outcomeNames = outcomes.length > 0 ? outcomes : ["Yes", "No"];

  for (let i = 0; i < outcomeNames.length; i++) {
    tokens.push({
      token_id: tokenIds[i] || "",
      outcome: outcomeNames[i],
      price: prices[i] ? parseFloat(prices[i]) : 0,
    });
  }

  return {
    condition_id: market.conditionId,
    question: market.question,
    slug: market.slug,
    url: market.slug ? `https://polymarket.com/event/${market.slug}` : undefined,
    description: market.description ? market.description.slice(0, 500) : undefined,
    tokens,
    volume: market.volume || "0",
    liquidity: market.liquidityNum,
    end_date: market.endDateIso || market.endDate || "",
    active: market.active,
    closed: market.closed,
    accepting_orders: market.acceptingOrders,
  };
}

export function registerMarketTools(server: McpServer, clientWrapper: ClobClientWrapper): void {
  server.tool(
    "polymarket_get_markets",
    "List available prediction markets on Polymarket, sorted by volume. Returns market question, current prices for Yes/No outcomes, token IDs, volume, liquidity, and Polymarket URL.",
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
    `Get detailed information about a specific prediction market including token IDs, current prices, description, liquidity, and market status.

Provide one of: condition_id, slug, or a full Polymarket URL (e.g. https://polymarket.com/event/btc-updown-15m-1770647400).`,
    GetMarketSchema.shape,
    async (args) => {
      try {
        let { condition_id, slug, url } = GetMarketSchema.parse(args);

        // Extract slug from URL if provided
        if (url) {
          slug = extractSlugFromUrl(url);
        }

        if (!condition_id && !slug) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Provide one of: condition_id, slug, or url",
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
