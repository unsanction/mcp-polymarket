import { ClobClient } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { getConfig, Config } from "./config.js";

const CLOB_API_URL = "https://clob.polymarket.com";
const GAMMA_API_URL = "https://gamma-api.polymarket.com";
const DATA_API_URL = "https://data-api.polymarket.com";

export class ClobClientWrapper {
  private client: ClobClient | null = null;
  private config: Config;

  constructor(config?: Config) {
    this.config = config || getConfig();
  }

  async initialize(): Promise<void> {
    // Skip if already initialized
    if (this.client) {
      return;
    }

    // Create wallet and add ethers v5 compatibility shim
    // @polymarket/clob-client expects _signTypedData (ethers v5), but ethers v6 uses signTypedData
    const wallet = new Wallet(this.config.privateKey) as any;
    wallet._signTypedData = wallet.signTypedData.bind(wallet);
    const funder = this.config.funder;

    // Signature type depends on wallet setup:
    // 0 = Direct EOA (when funder == signer)
    // 1 = Magic/Privy (email wallet)
    // 2 = Browser wallet proxy/GnosisSafe (when funder != signer)
    const signatureType = funder.toLowerCase() === wallet.address.toLowerCase() ? 0 : 2;

    if (this.config.apiKey && this.config.apiSecret && this.config.passphrase) {
      // Use provided API credentials
      this.client = new ClobClient(
        CLOB_API_URL,
        this.config.chainId,
        wallet,
        {
          key: this.config.apiKey,
          secret: this.config.apiSecret,
          passphrase: this.config.passphrase,
        },
        signatureType,
        funder
      );
      // Initialized with provided API credentials
    } else {
      // Create client with funder to properly derive API credentials
      const tempClient = new ClobClient(
        CLOB_API_URL,
        this.config.chainId,
        wallet,
        undefined,
        signatureType,
        funder
      );

      try {
        // Try to derive or create API credentials
        const creds = await tempClient.createOrDeriveApiKey();

        this.client = new ClobClient(
          CLOB_API_URL,
          this.config.chainId,
          wallet,
          creds,
          signatureType,
          funder
        );
      } catch {
        // Failed to derive API credentials, using unauthenticated client
        this.client = tempClient;
      }
    }
  }

  getClient(): ClobClient {
    if (!this.client) {
      throw new Error("Client not initialized. Call initialize() first.");
    }
    return this.client;
  }

  isReadonly(): boolean {
    return this.config.readonly;
  }

  ensureWriteAccess(): void {
    if (this.config.readonly) {
      throw new Error("Trading is disabled in readonly mode. Set POLYMARKET_READONLY=false to enable trading.");
    }
  }

  getGammaApiUrl(): string {
    return GAMMA_API_URL;
  }

  getClobApiUrl(): string {
    return CLOB_API_URL;
  }

  getDataApiUrl(): string {
    return DATA_API_URL;
  }

  getFunder(): string {
    return this.config.funder;
  }
}

let clientWrapper: ClobClientWrapper | null = null;

export async function getClientWrapper(): Promise<ClobClientWrapper> {
  if (!clientWrapper) {
    clientWrapper = new ClobClientWrapper();
    await clientWrapper.initialize();
  }
  return clientWrapper;
}
