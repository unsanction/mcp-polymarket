import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const GetNewsSchema = z.object({
  query: z.string().min(1).describe("News search query (e.g., 'Bitcoin price', 'Trump tariffs', 'NBA playoffs')"),
  limit: z.number().min(1).max(10).optional().default(5),
});

interface NewsHeadline {
  title: string;
  source: string;
  pubDate: string;
  link: string;
}

/**
 * Fetch news headlines from Google News RSS (free, no API key needed).
 */
async function fetchNewsHeadlines(
  query: string,
  maxResults: number,
): Promise<NewsHeadline[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${encoded}&hl=en&gl=US&ceid=US:en`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; mcp-polymarket/1.0)" },
  });

  if (!response.ok) {
    throw new Error(`Google News returned ${response.status}`);
  }

  const xml = await response.text();
  return parseRssItems(xml, maxResults);
}

function parseRssItems(xml: string, maxResults: number): NewsHeadline[] {
  const headlines: NewsHeadline[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && headlines.length < maxResults) {
    const item = match[1];
    const title = extractTag(item, "title");
    const source = extractTag(item, "source");
    const pubDate = extractTag(item, "pubDate");
    const link = extractTag(item, "link");

    if (title) {
      headlines.push({
        title: decodeXmlEntities(title),
        source: source || "Unknown",
        pubDate: pubDate || "",
        link: link || "",
      });
    }
  }

  return headlines;
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "s");
  const match = xml.match(regex);
  return match ? match[1] : null;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function registerNewsTools(server: McpServer): void {
  server.tool(
    "polymarket_get_news",
    "Fetch recent news headlines for a topic via Google News RSS. Useful for understanding current events and market context when analyzing prediction markets. No API key required.",
    GetNewsSchema.shape,
    async (args) => {
      try {
        const { query, limit } = GetNewsSchema.parse(args);
        const headlines = await fetchNewsHeadlines(query, limit);

        if (headlines.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No recent news found for "${query}"`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ count: headlines.length, headlines }, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching news: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
