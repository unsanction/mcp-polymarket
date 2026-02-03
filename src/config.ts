import { Wallet } from "ethers";

export interface Config {
  privateKey: string;
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  funder: string;
  chainId: number;
  readonly: boolean;
}

function getEnvVar(name: string, required: boolean = false): string | undefined {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function deriveAddressFromPrivateKey(privateKey: string): string {
  const wallet = new Wallet(privateKey);
  return wallet.address;
}

export function loadConfig(): Config {
  const privateKey = getEnvVar("POLYMARKET_PRIVATE_KEY", true)!;

  const funder = getEnvVar("POLYMARKET_FUNDER") || deriveAddressFromPrivateKey(privateKey);
  const chainId = parseInt(getEnvVar("POLYMARKET_CHAIN_ID") || "137", 10);
  const readonly = getEnvVar("POLYMARKET_READONLY")?.toLowerCase() === "true";

  const apiKey = getEnvVar("POLYMARKET_API_KEY");
  const apiSecret = getEnvVar("POLYMARKET_API_SECRET");
  const passphrase = getEnvVar("POLYMARKET_PASSPHRASE");

  return {
    privateKey,
    apiKey,
    apiSecret,
    passphrase,
    funder,
    chainId,
    readonly,
  };
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}
