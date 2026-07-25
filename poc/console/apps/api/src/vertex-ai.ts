import { GoogleGenAI } from "@google/genai";

import { getVertexAiEnvironment } from "./config.js";

let vertexAiClient: GoogleGenAI | undefined;

export function getVertexAiClient(): GoogleGenAI {
  if (vertexAiClient) {
    return vertexAiClient;
  }

  const { project, location } = getVertexAiEnvironment();
  const client = new GoogleGenAI({
    vertexai: true,
    project,
    location,
  });

  if (!client.vertexai) {
    throw new Error("Google Gen AI SDK must use the Vertex AI backend.");
  }

  vertexAiClient = client;
  return client;
}