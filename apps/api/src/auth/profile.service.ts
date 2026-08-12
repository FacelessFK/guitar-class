/**
 * پروفایل خودِ کاربر.
 *
 * تا امروز هیچ مسیر نوشتنی روی `users` وجود نداشت. نام هنگام اولین
 * ورود گرفته می‌شد و بعد از آن غیرقابل تغییر بود — کسی که در عجله
 * «علی» تایپ کرده بود تا ابد برای استادش «علی» می‌ماند، و عکس پروفایل
 * ستونی بود که هیچ‌کس پرش نمی‌کرد.
 *
 * جدا از `teacher.service` است و نه داخلش: آنجا پروفایل *استاد* است و
 * فقط استادها دارند. این یکی برای هر کاربر واردشده‌ای است، از جمله
 * هنرجویی که هیچ‌وقت استاد نمی‌شود.
 */

import { eq } from "drizzle-orm";

import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { consumeUploadTicket } from "../media/media.service.js";
import { objectStorage } from "../media/storage.port.js";

export interface UpdateProfileInput {
  fullName?: string;
  /**
   * کلید آبجکتی که همین کاربر بلیتش را گرفته — نه نشانی.
   *
   * `null` یعنی «عکس را بردار». اگر نشانی گرفته می‌شد، هر رشته‌ای
   * قابل ثبت بود، از جمله `javascript:` که در هر صفحه‌ای که آواتار
   * را نشان می‌دهد رندر می‌شود.
   */
  avatarObjectKey?: string | null;
}

export interface ProfileUpdate {
  fullName: string;
  avatarUrl: string | null;
}

/**
 * نام و عکس پروفایل را عوض می‌کند.
 *
 * شماره‌ی موبایل عمداً اینجا نیست: هویتِ ورود است و عوض کردنش یعنی
 * تصاحب حسابِ صاحبِ شماره‌ی جدید. اگر روزی لازم شد، مسیر خودش را
 * می‌خواهد — با تأیید کد روی شماره‌ی تازه.
 */
export async function updateOwnProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<ProfileUpdate> {
  const changes: { fullName?: string; avatarUrl?: string | null } = {};

  if (input.fullName !== undefined) changes.fullName = input.fullName;

  if (input.avatarObjectKey !== undefined) {
    // نشانی از بلیت درمی‌آید، نه از بدنه‌ی درخواست
    changes.avatarUrl = input.avatarObjectKey
      ? (await consumeUploadTicket(input.avatarObjectKey, userId, "AVATAR")).url
      : null;
  }

  if (Object.keys(changes).length === 0) return readProfile(userId);

  /**
   * عکس قبلی، پیش از بازنویسی.
   *
   * بدون این، هر بار عوض کردن عکس یک فایل یتیم در باکت جا می‌گذارد که
   * هیچ سطری به آن اشاره نمی‌کند — و جاروی پاک‌سازی هم پیدایش نمی‌کند،
   * چون از روی جدول کار می‌کند نه فهرست باکت. همان مسئله‌ای که در
   * بازخورد صوتی هم بود و همان‌جور حل می‌شود.
   */
  const previous =
    changes.avatarUrl !== undefined ? (await readProfile(userId)).avatarUrl : null;

  const [row] = await db
    .update(users)
    .set(changes)
    .where(eq(users.id, userId))
    .returning({ fullName: users.fullName, avatarUrl: users.avatarUrl });

  if (previous && previous !== row!.avatarUrl) {
    // اثر جانبی است، نه بخشی از کاری که کاربر خواسته: نرسیدن به
    // استوریج نباید تغییر نامِ ثبت‌شده را برگرداند
    await objectStorage()
      .deleteObject(objectKeyOf(previous))
      .catch(() => undefined);
  }

  return { fullName: row!.fullName, avatarUrl: row!.avatarUrl };
}

async function readProfile(userId: string): Promise<ProfileUpdate> {
  const [row] = await db
    .select({ fullName: users.fullName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return { fullName: row?.fullName ?? "", avatarUrl: row?.avatarUrl ?? null };
}

/**
 * کلید را از نشانی درمی‌آورد — تنها جایی در پروژه که این کار انجام
 * می‌شود، و به‌عمد فقط برای **حذف** فایلِ جایگزین‌شده.
 *
 * جای درستش ستون کلید کنار ستون نشانی است، همان کاری که برای اجرای
 * هنرجو و بازخورد صوتی شد. برای آواتار این کار یک مایگریشن روی
 * `users` می‌خواست تا فقط پاک کردن یک فایل چند کیلوبایتی را درست کند.
 * بدترین حالتِ این میان‌بر، یک فایل یتیم است — نه داده‌ی غلط — و اگر
 * `S3_PUBLIC_BASE_URL` عوض شود، عکس‌های قدیمی همان یتیم می‌شوند.
 */
function objectKeyOf(url: string): string {
  const base = objectStorage().publicUrlFor("");
  return url.startsWith(base) ? url.slice(base.length) : url;
}
