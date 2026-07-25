import {
  AccountId,
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";
import { config as loadEnv } from "dotenv";

loadEnv({ path: new URL("../../.env", import.meta.url), quiet: true });

const mirrorUrl = process.env.MIRROR_URL ?? "https://testnet.mirrornode.hedera.com";
const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringECDSA(process.env.HEDERA_OPERATOR_KEY);
const client = Client.forTestnet().setOperator(operatorId, operatorKey);

async function readMirrorMessages(topicId, expectedCount) {
  const endpoint = `${mirrorUrl}/api/v1/topics/${topicId}/messages?limit=100&order=asc`;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Mirror request failed with HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.messages.length >= expectedCount) {
      return payload;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Mirror did not expose ${expectedCount} chunks within the polling budget.`);
}

try {
  const createResponse = await new TopicCreateTransaction()
    .setTopicMemo("oshikatsu-gate-0-c-boundary")
    .execute(client);
  const createReceipt = await createResponse.getReceipt(client);
  const topicId = createReceipt.topicId.toString();
  const cases = [];
  let expectedChunkCount = 0;

  for (const size of [1023, 1024, 1025]) {
    const message = new Uint8Array(size).fill(size % 251);
    const responses = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .setChunkSize(1024)
      .setMaxChunks(4)
      .executeAll(client);
    const receipts = await Promise.all(responses.map((response) => response.getReceipt(client)));

    expectedChunkCount += responses.length;
    cases.push({
      bytes: size,
      chunk_count: responses.length,
      transactions: responses.map((response, index) => ({
        status: receipts[index].status.toString(),
        topic_sequence_number: receipts[index].topicSequenceNumber?.toString() ?? null,
        transaction_id: response.transactionId.toString(),
      })),
    });
  }

  const mirror = await readMirrorMessages(topicId, expectedChunkCount);
  const evidence = {
    generated_at: new Date().toISOString(),
    network: "testnet",
    operator_id: operatorId.toString(),
    topic_id: topicId,
    cases,
    mirror_messages: mirror.messages.map((message) => ({
      chunk_info: message.chunk_info,
      consensus_timestamp: message.consensus_timestamp,
      message_bytes: Buffer.from(message.message, "base64").length,
      payer_account_id: message.payer_account_id,
      sequence_number: message.sequence_number,
      topic_id: message.topic_id,
    })),
  };

  console.log(JSON.stringify(evidence, null, 2));
} finally {
  client.close();
}