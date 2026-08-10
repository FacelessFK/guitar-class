import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/client.js";
import { refreshTokens } from "../db/schema/index.js";

/**
 * توکن‌های نشست.
 *
 * دو نوع توکن با نقش‌های متفاوت:
 *
 *   • **دسترسی** — JWT کوتاه‌عمر (۱۵ دقیقه). حالت‌مند نیست و هر
 *     درخواست بدون رفتن به دیتابیس اعتبارسنجی می‌شود.
 *   • **تازه‌سازی** — رشته‌ی تصادفی بلندعمر (۳۰ روز) که **هش‌شده** در
 *     دیتابیس می‌نشیند. قابل ابطال است.
 *
 * چرا توکن تازه‌سازی JWT نیست: باید بشود ابطالش کرد. JWT بدون فهرست
 * ابطال، تا انقضایش معتبر است و «خروج از حساب» معنای واقعی پیدا نمی‌کند.
 *
 * چرا هش‌شده ذخیره می‌شود: نشت جدول `refresh_tokens` نباید به معنای
 * دسترسی به حساب‌ها باشد — دقیقاً همان استدلال ذخیره‌ی هشِ گذرواژه.
 */

export const TOKEN_CONFIG = {
  ACCESS_TTL_SECONDS: 15 * 60,
  REFRESH_TTL_DAYS: 30,
} as const;

const ISSUER = "music-platform";
const AUDIENCE = "music-platform-api";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET تعریف نشده یا کوتاه‌تر از ۳۲ کاراکتر است. با `openssl rand -base64 48` یکی بسازید.",
    );
  }

  return new TextEncoder().encode(secret);
}

export interface AccessTokenPayload {
  userId: string;
  isAdmin: boolean;
}

export async function issueAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ isAdmin: payload.isAdmin })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_CONFIG.ACCESS_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (!payload.sub) return null;

    return { userId: payload.sub, isAdmin: payload.isAdmin === true };
  } catch {
    // امضای نامعتبر، انقضا، یا دستکاری — همه یک نتیجه دارند
    return null;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export async function issueRefreshToken(
  userId: string,
  userAgent?: string,
): Promise<IssuedRefreshToken> {
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(
    Date.now() + TOKEN_CONFIG.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(token),
    userAgent: userAgent?.slice(0, 300) ?? null,
    expiresAt,
  });

  return { token, expiresAt };
}

export interface RotatedTokens {
  userId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * توکن تازه‌سازی را مصرف و یکی جدید صادر می‌کند.
 *
 * چرخش عمدی است: هر توکن تازه‌سازی فقط یک بار قابل استفاده است. اگر
 * توکنی دزدیده شود، اولین استفاده — چه توسط مهاجم چه کاربر — دیگری را
 * بی‌اعتبار می‌کند و مشکل زودتر معلوم می‌شود.
 */
export async function rotateRefreshToken(
  token: string,
  userAgent?: string,
): Promise<RotatedTokens | null> {
  const tokenHash = hashToken(token);

  const [existing] = await db
    .select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
      expiresAt: refreshTokens.expiresAt,
    })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
    .limit(1);

  if (!existing || existing.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const revoked = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, existing.id), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });

  // اگر صفر ردیف برگشت یعنی درخواست هم‌زمان دیگری زودتر مصرفش کرده
  if (revoked.length === 0) {
    return null;
  }

  const next = await issueRefreshToken(existing.userId, userAgent);

  return {
    userId: existing.userId,
    refreshToken: next.token,
    refreshExpiresAt: next.expiresAt,
  };
}

export async function revokeRefreshToken(token: string): Promise<boolean> {
  const result = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshTokens.tokenHash, hashToken(token)), isNull(refreshTokens.revokedAt)),
    )
    .returning({ id: refreshTokens.id });

  return result.length > 0;
}

/** خروج از همه‌ی دستگاه‌ها. */
export async function revokeAllUserTokens(userId: string): Promise<number> {
  const result = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });

  return result.length;
}
