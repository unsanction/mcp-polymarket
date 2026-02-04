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

export function deriveAddressFromPrivateKey(privateKey: string): string {
  const wallet = new Wallet(privateKey);
  return wallet.address;
}

/**
 * Create a Config from an object (useful for plugins that pass config directly)
 */
export function createConfig(options: {
  privateKey: string;
  funder?: string;
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  chainId?: number;
  readonly?: boolean;
}): Config {
  const privateKey = options.privateKey;
  if (!privateKey) {
    throw new Error("privateKey is required");
  }

  return {
    privateKey,
    funder: options.funder || deriveAddressFromPrivateKey(privateKey),
    apiKey: options.apiKey,
    apiSecret: options.apiSecret,
    passphrase: options.passphrase,
    chainId: options.chainId || 137,
    readonly: options.readonly || false,
  };
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
