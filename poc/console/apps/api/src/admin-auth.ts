import type { NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { getAdminEnvironment } from "./config.js";

const client = new OAuth2Client();

export async function requireAdmin(request: Request, response: Response, next: NextFunction) {
  const authorization = request.header("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    response.status(401).json({ error: "Admin identity token is required." });
    return;
  }
  try {
    const environment = getAdminEnvironment();
    const ticket = await client.verifyIdToken({ idToken: authorization.slice(7), audience: environment.audience });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified || !environment.allowedEmails.has(payload.email)) {
      response.status(403).json({ error: "Admin identity is not allowed." });
      return;
    }
    response.locals.adminEmail = payload.email;
    next();
  } catch {
    response.status(401).json({ error: "Admin identity token is invalid." });
  }
}