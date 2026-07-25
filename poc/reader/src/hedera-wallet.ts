import {
  HederaAdapter,
  HederaChainDefinition,
  HederaProvider,
  hederaNamespace,
  transactionToBase64String,
} from "@hashgraph/hedera-wallet-connect";
import { TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { createAppKit } from "@reown/appkit";
import type { GroovePreparation } from "./groove-api";

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
type AppKitInstance = ReturnType<typeof createAppKit>;

let appKit: AppKitInstance | null = null;
let provider: HederaProvider | null = null;

async function getWallet() {
  if (!projectId) throw new Error("Wallet connection is not configured.");
  if (!appKit || !provider) {
    const metadata = {
      name: "Oshikatsu",
      description: "Room-bound reader reactions on Hedera",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    };
    const network = HederaChainDefinition.Native.Testnet;
    const adapter = new HederaAdapter({ projectId, networks: [network], namespace: hederaNamespace });
    provider = await HederaProvider.init({ projectId, metadata });
    appKit = createAppKit({
      adapters: [adapter],
      universalProvider: provider as Parameters<typeof createAppKit>[0]["universalProvider"],
      projectId,
      metadata,
      networks: [network],
      enableReconnect: true,
      features: { analytics: false, email: false, onramp: false, socials: false, swaps: false },
    });
  }
  return { appKit, provider };
}

function accountFromProvider(walletProvider: HederaProvider) {
  const account = walletProvider.session?.namespaces?.hedera?.accounts?.[0];
  return account?.startsWith("hedera:testnet:") ? account : null;
}

async function waitForAccount(walletProvider: HederaProvider) {
  for (let attempt = 0; attempt < 480; attempt += 1) {
    const account = accountFromProvider(walletProvider);
    if (account) return account;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

export async function requireHashPackAccount() {
  const wallet = await getWallet();
  let account = accountFromProvider(wallet.provider);
  if (!account) {
    void wallet.appKit.open({ view: "Connect" });
    account = await waitForAccount(wallet.provider);
  }
  if (!account) throw new Error("Connect a HashPack testnet account, then press Send again.");
  return { accountId: account.slice("hedera:testnet:".length), signerAccountId: account };
}

export async function submitPreparedGroove(preparation: GroovePreparation, signerAccountId: string) {
  const accountId = signerAccountId.slice("hedera:testnet:".length);
  if (accountId !== preparation.account_id) throw new Error("Prepared payer does not match HashPack.");
  const bytes = Uint8Array.from(atob(preparation.message_base64), (character) => character.charCodeAt(0));
  if (bytes.length !== preparation.message_bytes || bytes.length === 0 || bytes.length > 900) {
    throw new Error("Prepared event bytes are invalid.");
  }
  const wallet = await getWallet();
  const transaction = new TopicMessageSubmitTransaction()
    .setTopicId(preparation.topic_id)
    .setMessage(bytes)
    .setMaxChunks(1);
  const result = await wallet.provider.hedera_signAndExecuteTransaction({
    signerAccountId,
    transactionList: transactionToBase64String(transaction),
  });
  return String(result.transactionId);
}