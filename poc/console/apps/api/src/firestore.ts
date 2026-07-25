import { Firestore } from "@google-cloud/firestore";
import { environment } from "./config.js";

let firestore: Firestore | null = null;

export function getFirestore() {
  if (!environment.GOOGLE_CLOUD_PROJECT) {
    throw new Error("GOOGLE_CLOUD_PROJECT is required for Firestore.");
  }

  firestore ??= new Firestore({ projectId: environment.GOOGLE_CLOUD_PROJECT });
  return firestore;
}