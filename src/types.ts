export interface TokenInfo {
  token_id: string;
  outcome: string;
  price: number;
}

export interface MarketInfo {
  condition_id: string;
  question: string;
  slug?: string;
  url?: string;
  description?: string;
  tokens: TokenInfo[];
  volume: string;
  liquidity?: number;
  end_date: string;
  active: boolean;
  closed: boolean;
  accepting_orders?: boolean;
}

export interface OrderbookEntry {
  price: string;
  size: string;
}

export interface OrderbookInfo {
  bids: OrderbookEntry[];
  asks: OrderbookEntry[];
  token_id: string;
}

export interface Position {
  token_id: string;
  market: string;
  outcome: string;
  size: string;
  avg_price: string;
  current_price: string;
  pnl: string;
  pnl_percent: string;
  redeemable: boolean;
  mergeable: boolean;
  condition_id: string;
  slug: string;
  end_date: string;
}

export interface TradeInfo {
  id: string;
  token_id: string;
  side: string;
  price: string;
  size: string;
  timestamp: string;
  status: string;
}

export interface BalanceInfo {
  balance: string;
  allowance: string;
}

export interface OrderResult {
  order_id: string;
  status: string;
  message?: string;
}

export type Side = "BUY" | "SELL";
