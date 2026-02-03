# MCP Polymarket Server

An MCP (Model Context Protocol) server that enables AI agents to trade on Polymarket via the CLOB API.

## Features

- Browse and search prediction markets
- View order books and market prices
- Check wallet balance and positions
- Place and cancel orders (with readonly mode option)
- Full integration with Polymarket's CLOB API

## Installation

```bash
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POLYMARKET_PRIVATE_KEY` | Yes | - | Ethereum private key for signing |
| `POLYMARKET_API_KEY` | No* | - | API key (auto-derived if not set) |
| `POLYMARKET_API_SECRET` | No* | - | API secret (auto-derived if not set) |
| `POLYMARKET_PASSPHRASE` | No* | - | API passphrase (auto-derived if not set) |
| `POLYMARKET_FUNDER` | No | - | Funder address (derived from private key) |
| `POLYMARKET_CHAIN_ID` | No | 137 | Polygon mainnet |
| `POLYMARKET_READONLY` | No | false | Disable trading tools |

*If API credentials are not provided, they will be derived from the private key on first run.

## Usage

### Running the Server

```bash
npm start
```

### Claude Desktop Integration

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "polymarket": {
      "command": "node",
      "args": ["/path/to/mcp-polymarket/build/index.js"],
      "env": {
        "POLYMARKET_PRIVATE_KEY": "your_private_key_here"
      }
    }
  }
}
```

## Available Tools

### Market Information

#### `polymarket_get_markets`
List available prediction markets on Polymarket.

**Parameters:**
- `limit` (optional): Number of markets to return (1-100, default: 10)
- `offset` (optional): Pagination offset (default: 0)
- `search` (optional): Search term to filter markets

#### `polymarket_get_market`
Get detailed information about a specific market.

**Parameters:**
- `condition_id` (required): The market's condition ID

#### `polymarket_get_orderbook`
Get the order book for a specific token.

**Parameters:**
- `token_id` (required): The token ID (Yes or No outcome)

### Account Information

#### `polymarket_get_balance`
Get USDC balance and allowance for the configured wallet.

**Parameters:** None

#### `polymarket_get_positions`
Get all open orders and positions with P&L calculations.

**Parameters:** None

### Trading (disabled in readonly mode)

#### `polymarket_place_order`
Place a limit order on Polymarket.

**Parameters:**
- `token_id` (required): Token ID to trade
- `side` (required): "BUY" or "SELL"
- `size` (required): Order size in shares
- `price` (required): Limit price (0-1)

#### `polymarket_cancel_order`
Cancel an existing order.

**Parameters:**
- `order_id` (required): Order ID to cancel

#### `polymarket_get_trades`
Get recent executed trades.

**Parameters:**
- `limit` (optional): Number of trades to return (1-100, default: 20)

## Security

- Private keys are never logged
- Use `POLYMARKET_READONLY=true` for safe market exploration
- All output goes to stderr (MCP requirement)
- Input validation on all parameters

## License

MIT
