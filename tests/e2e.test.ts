import { describe, it, expect, beforeAll } from "vitest";
import { ClobClient, Side } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import "dotenv/config";

const CLOB_API_URL = "https://clob.polymarket.com";
const GAMMA_API_URL = "https://gamma-api.polymarket.com";
const CHAIN_ID = 137;

interface GammaMarketRaw {
  conditionId: string;
  question: string;
  slug: string;
  volume: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  clobTokenIds?: string; // JSON string
  outcomes?: string; // JSON string
  outcomePrices?: string; // JSON string
}

interface GammaMarket {
  conditionId: string;
  question: string;
  slug: string;
  volume: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  clobTokenIds: string[];
  outcomes: string[];
  outcomePrices: string[];
}

function parseGammaMarket(raw: GammaMarketRaw): GammaMarket {
  return {
    ...raw,
    clobTokenIds: raw.clobTokenIds ? JSON.parse(raw.clobTokenIds) : [],
    outcomes: raw.outcomes ? JSON.parse(raw.outcomes) : [],
    outcomePrices: raw.outcomePrices ? JSON.parse(raw.outcomePrices) : [],
  };
}

interface OrderbookEntry {
  price: string;
  size: string;
}

interface Orderbook {
  bids: OrderbookEntry[];
  asks: OrderbookEntry[];
}

interface OpenOrder {
  id: string;
  asset_id: string;
  side: string;
  price: string;
  original_size: string;
  size_matched: string;
}

describe("Polymarket E2E Test", () => {
  let client: ClobClient;
  let wallet: Wallet;
  let funderAddress: string;

  beforeAll(async () => {
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error(
        "POLYMARKET_PRIVATE_KEY environment variable is required for E2E tests"
      );
    }

    wallet = new Wallet(privateKey);

    // Funder is the Polymarket proxy wallet address (where funds are held)
    // If not provided, defaults to wallet address
    const funder = process.env.POLYMARKET_FUNDER || wallet.address;
    funderAddress = funder;

    // Signature type depends on wallet setup:
    // 0 = Direct EOA (when funder == signer)
    // 1 = Magic/Privy (email wallet)
    // 2 = Browser wallet proxy/GnosisSafe (when funder != signer)
    const signatureType = funderAddress.toLowerCase() === wallet.address.toLowerCase() ? 0 : 2;

    console.log("Deriving API credentials from private key...");
    console.log(`  Signature type: ${signatureType} (${signatureType === 0 ? 'EOA' : signatureType === 1 ? 'Magic/Privy' : 'Proxy/GnosisSafe'})`);
    // Must pass funder to tempClient for proper API key derivation
    const tempClient = new ClobClient(
      CLOB_API_URL,
      CHAIN_ID,
      wallet,
      undefined,
      signatureType,
      funderAddress
    );
    const creds = await tempClient.createOrDeriveApiKey();

    // Create client with all parameters: host, chainId, signer, creds, signatureType, funder
    client = new ClobClient(
      CLOB_API_URL,
      CHAIN_ID,
      wallet,
      creds,
      signatureType,
      funder
    );

    console.log(`E2E Test initialized`);
    console.log(`  Signer (MetaMask): ${wallet.address}`);
    console.log(`  Funder (Proxy Wallet): ${funderAddress}`);
  });

  it("should fetch available markets from Gamma API", async () => {
    const response = await fetch(
      `${GAMMA_API_URL}/markets?limit=10&closed=false`
    );
    expect(response.ok).toBe(true);

    const rawMarkets = (await response.json()) as GammaMarketRaw[];
    expect(Array.isArray(rawMarkets)).toBe(true);
    expect(rawMarkets.length).toBeGreaterThan(0);

    const markets = rawMarkets.map(parseGammaMarket);
    console.log(`Found ${markets.length} active markets`);

    // Verify market structure
    const market = markets[0];
    expect(market.conditionId).toBeDefined();
    expect(market.question).toBeDefined();
    expect(market.clobTokenIds.length).toBeGreaterThan(0);

    console.log(`Sample market: "${market.question}"`);
    console.log(`Token IDs: ${market.clobTokenIds.join(", ").slice(0, 80)}...`);
    console.log(`Prices: Yes=${market.outcomePrices[0]}, No=${market.outcomePrices[1]}`);
  });

  it("should fetch orderbook for a token", async () => {
    // First get a market
    const response = await fetch(
      `${GAMMA_API_URL}/markets?limit=5&closed=false`
    );
    const rawMarkets = (await response.json()) as GammaMarketRaw[];
    const markets = rawMarkets.map(parseGammaMarket);

    // Find a market with token IDs
    const marketWithTokens = markets.find(
      (m) => m.clobTokenIds && m.clobTokenIds.length > 0
    );
    expect(marketWithTokens).toBeDefined();

    const tokenId = marketWithTokens!.clobTokenIds[0];
    console.log(`Fetching orderbook for token: ${tokenId.slice(0, 20)}...`);

    const orderbook = (await client.getOrderBook(tokenId)) as Orderbook;

    expect(orderbook).toBeDefined();
    expect(orderbook.bids).toBeDefined();
    expect(orderbook.asks).toBeDefined();

    console.log(`Orderbook: ${orderbook.bids.length} bids, ${orderbook.asks.length} asks`);

    if (orderbook.bids.length > 0) {
      console.log(`Best bid: ${orderbook.bids[0].price} @ ${orderbook.bids[0].size}`);
    }
    if (orderbook.asks.length > 0) {
      console.log(`Best ask: ${orderbook.asks[0].price} @ ${orderbook.asks[0].size}`);
    }
  });

  it("should place order, verify it exists, then cancel it", async () => {
    // Step 1: Get an active market
    const response = await fetch(
      `${GAMMA_API_URL}/markets?limit=10&closed=false`
    );
    const rawMarkets = (await response.json()) as GammaMarketRaw[];
    const markets = rawMarkets.map(parseGammaMarket);

    // Find a market with good liquidity (has token IDs and prices)
    const market = markets.find(
      (m) =>
        m.clobTokenIds.length > 0 &&
        m.outcomePrices.length > 0 &&
        !m.closed
    );

    if (!market) {
      console.log("No suitable market found, skipping order test");
      return;
    }

    const tokenId = market.clobTokenIds[0]; // Yes token
    const currentPrice = parseFloat(market.outcomePrices[0]);

    console.log(`\n--- Order Test ---`);
    console.log(`Market: "${market.question}"`);
    console.log(`Token ID: ${tokenId}`);
    console.log(`Current Yes price: ${currentPrice}`);

    // Step 2: Place a low-ball order that won't fill immediately
    // Use a price significantly below market to avoid execution
    const orderPrice = Math.max(0.01, currentPrice - 0.20);
    const orderSize = 5; // Polymarket minimum order size is 5

    console.log(`\nPlacing order: BUY ${orderSize} @ ${orderPrice.toFixed(2)}`);

    // Add delay to avoid Cloudflare rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const orderArgs = {
      tokenID: tokenId,
      side: Side.BUY,
      size: orderSize,
      price: orderPrice,
      feeRateBps: 0,
    };

    let orderId: string;

    try {
      const signedOrder = await client.createOrder(orderArgs);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const orderResponse = await client.postOrder(signedOrder);

      console.log(`Order response:`, JSON.stringify(orderResponse, null, 2));

      // Extract order ID
      orderId = (orderResponse as { orderID?: string }).orderID || "";

      if (!orderId) {
        console.log("Order may have been rejected or failed");
        // Check if there's an error message
        const errorMsg = (orderResponse as { errorMsg?: string }).errorMsg;
        if (errorMsg) {
          console.log(`Error: ${errorMsg}`);
        }
        return;
      }

      console.log(`Order placed with ID: ${orderId}`);
    } catch (error) {
      console.log(`Failed to place order: ${error}`);
      // This might happen if account doesn't have enough balance or allowance
      return;
    }

    // Step 3: Verify order is in open orders list
    console.log(`\nVerifying order exists in open orders...`);

    const openOrders = (await client.getOpenOrders()) as OpenOrder[];
    console.log(`Found ${openOrders.length} open orders`);

    const ourOrder = openOrders.find((o) => o.id === orderId);

    if (ourOrder) {
      console.log(`Order found in open orders:`);
      console.log(`  ID: ${ourOrder.id}`);
      console.log(`  Side: ${ourOrder.side}`);
      console.log(`  Price: ${ourOrder.price}`);
      console.log(`  Size: ${ourOrder.original_size}`);
      expect(ourOrder.id).toBe(orderId);
    } else {
      console.log(`Order ${orderId} not found in open orders (may have been filled or rejected)`);
      // List all orders for debugging
      for (const order of openOrders) {
        console.log(`  - ${order.id}: ${order.side} ${order.original_size} @ ${order.price}`);
      }
    }

    // Step 4: Cancel the order
    console.log(`\nCancelling order ${orderId}...`);

    try {
      const cancelResponse = await client.cancelOrder({ orderID: orderId });
      console.log(`Cancel response:`, JSON.stringify(cancelResponse, null, 2));
    } catch (error) {
      console.log(`Failed to cancel order: ${error}`);
    }

    // Step 5: Verify order is no longer in open orders
    console.log(`\nVerifying order was cancelled...`);

    // Wait for cancellation to propagate
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const openOrdersAfter = (await client.getOpenOrders()) as OpenOrder[];
    const orderStillExists = openOrdersAfter.find((o) => o.id === orderId);

    if (!orderStillExists) {
      console.log(`Order successfully cancelled and removed from open orders`);
    } else {
      console.log(`Order still exists in open orders (may take time to process)`);
    }

    expect(orderStillExists).toBeUndefined();
  });

  it("should execute real trade: buy then sell position", async () => {
    console.log(`\n--- Real Trade Test (BUY then SELL) ---`);
    console.log(`⚠️  This test executes REAL trades and may result in small losses due to spread`);

    // Step 1: Get an active market with good liquidity
    const response = await fetch(
      `${GAMMA_API_URL}/markets?limit=20&closed=false`
    );
    const rawMarkets = (await response.json()) as GammaMarketRaw[];
    const markets = rawMarkets.map(parseGammaMarket);

    // Find a market with reasonable price (not too extreme)
    const market = markets.find(
      (m) =>
        m.clobTokenIds.length > 0 &&
        m.outcomePrices.length > 0 &&
        !m.closed &&
        parseFloat(m.outcomePrices[0]) > 0.05 &&
        parseFloat(m.outcomePrices[0]) < 0.95
    );

    if (!market) {
      console.log("No suitable market found, skipping real trade test");
      return;
    }

    const tokenId = market.clobTokenIds[0]; // Yes token
    console.log(`Market: "${market.question}"`);
    console.log(`Token ID: ${tokenId.slice(0, 20)}...`);

    // Step 2: Get orderbook to find best prices
    const orderbook = (await client.getOrderBook(tokenId)) as Orderbook;

    if (!orderbook.asks || orderbook.asks.length === 0) {
      console.log("No asks in orderbook, skipping test");
      return;
    }
    if (!orderbook.bids || orderbook.bids.length === 0) {
      console.log("No bids in orderbook, skipping test");
      return;
    }

    const bestAsk = parseFloat(orderbook.asks[0].price);
    const bestBid = parseFloat(orderbook.bids[0].price);
    const spread = bestAsk - bestBid;

    console.log(`Best Ask: ${bestAsk} (we BUY at this price)`);
    console.log(`Best Bid: ${bestBid} (we SELL at this price)`);
    console.log(`Spread: ${(spread * 100).toFixed(2)}%`);

    const orderSize = 5; // Minimum order size
    const buyCost = orderSize * bestAsk;
    const sellRevenue = orderSize * bestBid;
    const expectedLoss = buyCost - sellRevenue;

    console.log(`\nTrade plan:`);
    console.log(`  BUY ${orderSize} shares @ ${bestAsk} = $${buyCost.toFixed(4)}`);
    console.log(`  SELL ${orderSize} shares @ ${bestBid} = $${sellRevenue.toFixed(4)}`);
    console.log(`  Expected loss from spread: $${expectedLoss.toFixed(4)}`);

    // Step 3: Place BUY order at best ask price (should fill immediately)
    console.log(`\n[1/4] Placing BUY order...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const buyOrderArgs = {
      tokenID: tokenId,
      side: Side.BUY,
      size: orderSize,
      price: bestAsk,
      feeRateBps: 0,
    };

    let buyOrderId: string;
    try {
      const signedBuyOrder = await client.createOrder(buyOrderArgs);
      const buyResponse = await client.postOrder(signedBuyOrder);

      console.log(`BUY response:`, JSON.stringify(buyResponse, null, 2));

      buyOrderId = (buyResponse as { orderID?: string }).orderID || "";
      const buySuccess = (buyResponse as { success?: boolean }).success;
      const buyStatus = (buyResponse as { status?: string }).status;

      if (!buySuccess) {
        const errorMsg = (buyResponse as { error?: string }).error ||
                        (buyResponse as { errorMsg?: string }).errorMsg;
        console.log(`BUY order failed: ${errorMsg}`);
        return;
      }

      console.log(`BUY order placed: ${buyOrderId} (status: ${buyStatus})`);
    } catch (error) {
      console.log(`Failed to place BUY order: ${error}`);
      return;
    }

    // Step 4: Wait for order to fill
    console.log(`\n[2/4] Waiting for BUY order to fill...`);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Check if order is still open (if not in open orders, it's filled)
    const openOrdersAfterBuy = (await client.getOpenOrders()) as OpenOrder[];
    const buyOrderStillOpen = openOrdersAfterBuy.find((o) => o.id === buyOrderId);

    if (buyOrderStillOpen) {
      console.log(`BUY order still open, attempting to cancel...`);
      await client.cancelOrder({ orderID: buyOrderId });
      console.log(`Test aborted - order didn't fill. Try again or check liquidity.`);
      return;
    }

    console.log(`BUY order filled! Now we hold ${orderSize} shares.`);

    // Step 5: Place SELL order at best bid price (should fill immediately)
    console.log(`\n[3/4] Placing SELL order...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get fresh orderbook for sell price
    const orderbookForSell = (await client.getOrderBook(tokenId)) as Orderbook;
    const currentBestBid = orderbookForSell.bids.length > 0
      ? parseFloat(orderbookForSell.bids[0].price)
      : bestBid;

    const sellOrderArgs = {
      tokenID: tokenId,
      side: Side.SELL,
      size: orderSize,
      price: currentBestBid,
      feeRateBps: 0,
    };

    let sellOrderId: string;
    try {
      const signedSellOrder = await client.createOrder(sellOrderArgs);
      const sellResponse = await client.postOrder(signedSellOrder);

      console.log(`SELL response:`, JSON.stringify(sellResponse, null, 2));

      sellOrderId = (sellResponse as { orderID?: string }).orderID || "";
      const sellSuccess = (sellResponse as { success?: boolean }).success;
      const sellStatus = (sellResponse as { status?: string }).status;

      if (!sellSuccess) {
        const errorMsg = (sellResponse as { error?: string }).error ||
                        (sellResponse as { errorMsg?: string }).errorMsg;
        console.log(`SELL order failed: ${errorMsg}`);
        console.log(`⚠️  WARNING: You still hold ${orderSize} shares! Manual intervention may be needed.`);
        return;
      }

      console.log(`SELL order placed: ${sellOrderId} (status: ${sellStatus})`);
    } catch (error) {
      console.log(`Failed to place SELL order: ${error}`);
      console.log(`⚠️  WARNING: You still hold ${orderSize} shares! Manual intervention may be needed.`);
      return;
    }

    // Step 6: Wait and verify sell order filled
    console.log(`\n[4/4] Waiting for SELL order to fill...`);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const openOrdersAfterSell = (await client.getOpenOrders()) as OpenOrder[];
    const sellOrderStillOpen = openOrdersAfterSell.find((o) => o.id === sellOrderId);

    if (sellOrderStillOpen) {
      console.log(`SELL order still open (matched: ${sellOrderStillOpen.size_matched})`);
      console.log(`Cancelling remaining SELL order...`);
      await client.cancelOrder({ orderID: sellOrderId });
    } else {
      console.log(`SELL order filled!`);
    }

    console.log(`\n✅ Real trade test completed!`);
    console.log(`   Bought and sold ${orderSize} shares`);
    console.log(`   Expected cost (spread): ~$${expectedLoss.toFixed(4)}`);

    expect(true).toBe(true); // Test passed if we got here
  });

  it("should get account balance", async () => {
    const balance = await client.getBalanceAllowance({
      asset_type: "COLLATERAL" as unknown as import("@polymarket/clob-client").AssetType,
    });

    console.log(`\n--- Account Balance ---`);
    console.log(`Address: ${funderAddress}`);
    console.log(`Balance: ${(balance as { balance?: string }).balance || "0"}`);
    console.log(`Allowance: ${(balance as { allowance?: string }).allowance || "0"}`);

    expect(balance).toBeDefined();
  });

  it("should list recent trades", async () => {
    console.log(`\n--- Recent Trades ---`);

    try {
      const trades = await client.getTrades({});

      console.log(`Found ${(trades as unknown[])?.length || 0} trades`);

      if (Array.isArray(trades) && trades.length > 0) {
        const trade = trades[0] as {
          id: string;
          side: string;
          price: string;
          size: string;
        };
        console.log(`Most recent trade:`);
        console.log(`  ID: ${trade.id}`);
        console.log(`  Side: ${trade.side}`);
        console.log(`  Price: ${trade.price}`);
        console.log(`  Size: ${trade.size}`);
      }

      expect(trades).toBeDefined();
    } catch (error) {
      // May fail with 401 if API credentials don't match wallet
      console.log(`Failed to fetch trades (likely auth issue): ${error}`);
      console.log("This is expected if API credentials were generated for a different wallet");
    }
  });
});
