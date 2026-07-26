import {
  HederaAdapter,
  HederaChainDefinition,
  HederaProvider,
  hederaNamespace,
  transactionToBase64String,
} from "@hashgraph/hedera-wallet-connect";
import { TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { createAppKit } from "@reown/appkit";

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
const topicId = "0.0.9745676";
const mirrorUrl = "https://testnet.mirrornode.hedera.com";
const encoder = new TextEncoder();

type AppKitInstance = ReturnType<typeof createAppKit>;

let appKit: AppKitInstance | null = null;
let provider: HederaProvider | null = null;

export type WalletEvidence = {
  accountId: string;
  consensusTimestamp: string;
  messageBytes: number;
  sequenceNumber: number;
  transactionId: string;
};

export type PreparedBallot = {
  id: string;
  topic_id: string;
  account_id: string;
  message_base64: string;
  message_bytes: number;
  event_hash: string;
};

export function createReactionEnvelope() {
  return JSON.stringify({
    v: 1,
    t: "r",
    r: "lisbon-final-control",
    e: crypto.randomUUID().replaceAll("-", ""),
    s: "emotional-eruption",
  });
}

async function getWallet() {
  if (!projectId) {
    throw new Error("VITE_REOWN_PROJECT_ID is not configured.");
  }

  if (!appKit || !provider) {
    const metadata = {
      name: "Oshikatsu",
      description: "Room-bound human voting on Hedera",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    };
    const network = HederaChainDefinition.Native.Testnet;
    const adapter = new HederaAdapter({
      projectId,
      networks: [network],
      namespace: hederaNamespace,
    });
    provider = await HederaProvider.init({
      projectId,
      metadata,
    });
    appKit = createAppKit({
      adapters: [adapter],
      universalProvider: provider as Parameters<typeof createAppKit>[0]["universalProvider"],
      projectId,
      metadata,
      networks: [network],
      enableReconnect: true,
      features: {
        analytics: false,
        email: false,
        onramp: false,
        socials: false,
        swaps: false,
      },
    });
  }

  return { appKit, provider };
}

export async function connectHashPack() {
  const wallet = await getWallet();
  await wallet.appKit.open({ view: "Connect" });
}

export async function submitReaction(message: string): Promise<WalletEvidence> {
  const bytes = encoder.encode(message);
  if (bytes.length > 900) {
    throw new Error(`Event is ${bytes.length} bytes; maximum is 900.`);
  }

  const wallet = await getWallet();
  const account = wallet.provider.session?.namespaces?.hedera?.accounts?.[0];
  if (!account?.startsWith("hedera:testnet:")) {
    throw new Error("Connect a HashPack testnet account first.");
  }
  const accountId = account.slice("hedera:testnet:".length);
  const transaction = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(bytes)
    .setMaxChunks(1);
  const result = await wallet.provider.hedera_signAndExecuteTransaction({
    signerAccountId: account,
    transactionList: transactionToBase64String(transaction),
  });
  const transactionId = String(result.transactionId);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${mirrorUrl}/api/v1/topics/${topicId}/messages?limit=25&order=desc`);
    if (response.ok) {
      const payload = (await response.json()) as {
        messages?: Array<{
          consensus_timestamp: string;
          message: string;
          payer_account_id: string;
          sequence_number: number;
        }>;
      };
      const mirrorMessage = payload.messages?.find((candidate) => {
        const candidateBytes = Uint8Array.from(atob(candidate.message), (character) =>
          character.charCodeAt(0),
        );
        return (
          candidate.payer_account_id === accountId &&
          candidateBytes.length === bytes.length &&
          candidateBytes.every((value, index) => value === bytes[index])
        );
      });
      if (mirrorMessage) {
        const mirrorBytes = Uint8Array.from(atob(mirrorMessage.message), (character) =>
          character.charCodeAt(0),
        );
        return {
          accountId,
          consensusTimestamp: mirrorMessage.consensus_timestamp,
          messageBytes: mirrorBytes.length,
          sequenceNumber: mirrorMessage.sequence_number,
          transactionId,
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Mirror confirmation timed out. The event is not yet formal.");
}

export async function submitPreparedBallot(preparation: PreparedBallot) {
  const bytes = Uint8Array.from(atob(preparation.message_base64), (character) => character.charCodeAt(0));
  if (bytes.length !== preparation.message_bytes || bytes.length === 0 || bytes.length > 900) throw new Error("Prepared Ballot bytes are invalid.");
  const wallet = await getWallet();
  const account = wallet.provider.session?.namespaces?.hedera?.accounts?.[0];
  if (!account?.startsWith("hedera:testnet:")) throw new Error("Connect a HashPack testnet account first.");
  const accountId = account.slice("hedera:testnet:".length);
  if (accountId !== preparation.account_id) throw new Error("Prepared Ballot payer does not match HashPack.");
  void wallet.provider.rpcProviders;
  if (!wallet.provider.nativeProvider) throw new Error("Reconnect HashPack before submitting the Ballot.");
  const transaction = new TopicMessageSubmitTransaction().setTopicId(preparation.topic_id).setMessage(bytes).setMaxChunks(1);
  const result = await wallet.provider.hedera_signAndExecuteTransaction({ signerAccountId: account, transactionList: transactionToBase64String(transaction) });
  return String(result.transactionId);
}