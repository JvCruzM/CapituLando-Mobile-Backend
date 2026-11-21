import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";

export const opaqueToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");

export function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function matchesPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function issueAccessToken(user, sessionId, config) {
  return jwt.sign(
    { sid: sessionId, tokenVersion: user.token_version },
    config.JWT_SECRET,
    {
      algorithm: "HS256",
      issuer: config.JWT_ISSUER,
      audience: "capitulando-mobile",
      subject: user.id,
      expiresIn: config.ACCESS_TOKEN_SECONDS,
    },
  );
}

export function verifyAccessToken(token, config) {
  return jwt.verify(token, config.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: config.JWT_ISSUER,
    audience: "capitulando-mobile",
  });
}
