# @c0pilot/mcp-polymarket

MCP (Model Context Protocol) server and client library for [Polymarket](https://polymarket.com) prediction markets.

[![npm version](https://badge.fury.io/js/@c0pilot/mcp-polymarket.svg)](https://www.npmjs.com/package/@c0pilot/mcp-polymarket)

## Features

- **MCP Server**: Run as a standalone MCP server for AI agents
- **Client Library**: Import and use in your own projects
- Browse and search prediction markets
- View order books and market prices
- Check wallet balance and positions
- Place and cancel orders
- Full integration with Polymarket's CLOB API

## Installation

```bash
npm install @c0pilot/mcp-polymarket
```

## Usage

### As MCP Server

#### With Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "polymarket": {
      "command": "npx",
      "args": ["mcp-polymarket"],
      "env": {
        "POLYMARKET_PRIVATE_KEY": "0x...",
        "POLYMARKET_FUNDER": "0x..."
      }
    }
  }
}
```

#### Standalone

```bash
export POLYMARKET_PRIVATE_KEY="0x..."
export POLYMARKET_FUNDER="0x..."
npx mcp-polymarket
```

### As Library

```typescript
import { ClobClientWrapper } from 'mcp-polymarket/client';
import { createConfig } from 'mcp-polymarket/config';

// Create config
const config = createConfig({
  privateKey: '0x...',
  funder: '0x...',      // optional
  readonly: false,       // optional
});

// Initialize client
const client = new ClobClientWrapper(config);
await client.initialize();

// Use the client
const clobClient = client.getClient();
const orderbook = await clobClient.getOrderBook(tokenId);
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POLYMARKET_PRIVATE_KEY` | Yes | - | Wallet private key for signing |
| `POLYMARKET_FUNDER` | No | derived | Proxy wallet address |
| `POLYMARKET_API_KEY` | No | derived | API key (auto-derived if not set) |
| `POLYMARKET_API_SECRET` | No | derived | API secret (auto-derived if not set) |
| `POLYMARKET_PASSPHRASE` | No | derived | API passphrase (auto-derived if not set) |
| `POLYMARKET_CHAIN_ID` | No | 137 | Polygon mainnet |
| `POLYMARKET_READONLY` | No | false | Disable trading tools |

### Finding Your Funder Address

Your "funder" is your Polymarket proxy wallet - the address shown on polymarket.com when logged in. If you deposited through Polymarket's UI, funds are in this proxy wallet.

## Available MCP Tools

### Read-Only

| Tool | Description |
|------|-------------|
| `polymarket_get_markets` | List active prediction markets |
| `polymarket_get_market` | Get details for a specific market |
| `polymarket_get_orderbook` | View order book for a token |
| `polymarket_get_balance` | Check wallet USDC balance |
| `polymarket_get_positions` | View open orders and positions |
| `polymarket_get_trades` | Get recent trade history |

### Trading

| Tool | Description |
|------|-------------|
| `polymarket_place_order` | Place a limit order (BUY/SELL) |
| `polymarket_cancel_order` | Cancel an open order |

## API Exports

```typescript
// Main MCP server entry
import mcp from '@c0pilot/mcp-polymarket';

// Client wrapper for Polymarket CLOB
import { ClobClientWrapper } from '@c0pilot/mcp-polymarket/client';

// Configuration utilities
import { createConfig, getConfig, Config } from '@c0pilot/mcp-polymarket/config';

// Type definitions
import { MarketInfo, OrderbookInfo, Position } from '@c0pilot/mcp-polymarket/types';
```

## Security

- Private keys are never logged
- Use `POLYMARKET_READONLY=true` for safe exploration
- API credentials auto-derived from private key
- Input validation on all parameters

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run E2E tests (requires env vars)
npm run test:e2e
```

## Related

- [@c0pilot/openclaw-polymarket](https://www.npmjs.com/package/@c0pilot/openclaw-polymarket) - OpenClaw plugin using this library
- [GitHub](https://github.com/unsanction/mcp-polymarket)

## License

MIT
