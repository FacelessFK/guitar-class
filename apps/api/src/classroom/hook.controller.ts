import { createHash, timingSafeEqual } from "node:crypto";

import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AttendanceEvent } from "@music/shared";

import { Public } from "../auth/auth.guard.js";
import { zodPipe } from "../common/validation.pipe.js";
import { recordHookEvent } from "../queue/heartbeat.js";
import { recordHookAttendance, type HookOutcome } from "./hook.service.js";

/**
 * هوک سمت سرور جیتسی.
 *
 * فرستنده `mod_event_sync_component` روی prosody است و مسیرهایش را
 * خودش می‌سازد: `api_prefix` + `/events/occupant/joined` و سه تای دیگر.
 * پس شکل مسیرها اینجا انتخاب ما نیست — با آن ماژول قفل است.
 *
 * روی سرور: `api_prefix = "https://api.<domain>/api/classroom/hook"`.
 */

// ---------------------------------------------------------------------------
// راز مشترک
// ---------------------------------------------------------------------------

/**
 * تنها چیزی که این مسیر را از یک اندپوینت عمومیِ «هر کسی را حاضر ثبت کن»
 * جدا می‌کند.
 *
 * توکن جیتسی به درد این کار نمی‌خورد: آن را خودمان به کاربر داده‌ایم، پس
 * کاربر هم دارد. راز مشترک فقط روی سرور جیتسی و اینجاست.
 *
 * نبودن مقدار یعنی **همه چیز رد می‌شود**، نه اینکه بررسی دور زده شود.
 * پیش‌فرضِ باز در این یک مورد یعنی هر کسی می‌تواند حضور جعل کند — دقیقاً
 * همان چیزی که این ماژول برای بستنش نوشته شده. در تولید، `env.ts` نبودنش
 * را هنگام بالا آمدن می‌گیرد.
 */
function configuredSecret(): string | null {
  const secret = process.env.JITSI_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

/**
 * مقایسه‌ی زمان‌ثابت روی هشِ دو طرف.
 *
 * هش گرفتن دو کار می‌کند: طول را از معادله بیرون می‌برد (پس
 * `timingSafeEqual` با طول نابرابر پرتاب نمی‌کند) و خودِ طولِ راز را هم
 * از زمان پاسخ نشت نمی‌دهد.
 */
function secretMatches(provided: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

@Injectable()
export class JitsiHookGuard implements CanActivate {
  private readonly logger = new Logger("JitsiHook");

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const expected = configuredSecret();

    if (!expected) {
      this.logger.error(
        "JITSI_WEBHOOK_SECRET تعریف نشده است؛ رویداد حضور از سرور جیتسی رد شد. " +
          "تا وقتی این متغیر ست نشود، حضور فقط از گزارش کلاینت می‌آید و برای تصمیم مالی معتبر نیست.",
      );
      throw new UnauthorizedException();
    }

    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const token = value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : null;

    if (!token || !secretMatches(token, expected)) {
      this.logger.warn("رویداد حضور با راز نادرست رد شد.");
      throw new UnauthorizedException();
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// شکل بدنه — دقیقاً آنچه ماژول prosody می‌فرستد
// ---------------------------------------------------------------------------

/**
 * زمان‌های prosody با `os.time()` ساخته می‌شوند: **ثانیه‌ی یونیکس**، نه
 * میلی‌ثانیه. یک بار ضرب‌نکردن اینجا یعنی تاریخ‌هایی در سال ۱۹۷۰ که هیچ
 * تستی نمی‌گیردشان چون در هیچ تصمیمی خوانده نمی‌شوند.
 */
const epochSeconds = z
  .number()
  .int()
  .positive()
  .transform((seconds) => new Date(seconds * 1000));

const occupantSchema = z.object({
  /**
   * ادعای `context.user.id` توکن. اگر تهی باشد یعنی کسی بدون توکن وارد
   * شده — که با `ENABLE_GUESTS=0` نباید ممکن باشد و اگر دیده شد، خودِ
   * پیکربندی سرور مشکل دارد.
   */
  id: z.string().uuid().optional().nullable(),
  occupant_jid: z.string().optional().nullable(),
  joined_at: epochSeconds.optional().nullable(),
  left_at: epochSeconds.optional().nullable(),
});

/**
 * نام اتاق.
 *
 * `room_name` را ماژول از `event_sync_extra_payload` می‌آورد که هنگام
 * ساخت اتاق ست می‌شود. اگر prosody وسط کار ری‌استارت شده باشد ممکن است
 * نباشد، پس نودِ `room_jid` هم به عنوان پشتیبان خوانده می‌شود.
 */
const roomFields = {
  room_name: z.string().optional().nullable(),
  room_jid: z.string().optional().nullable(),
};

const occupantEventSchema = z.object({
  ...roomFields,
  event_name: z.string().optional(),
  occupant: occupantSchema,
});

const roomEventSchema = z.object({
  ...roomFields,
  event_name: z.string().optional(),
  all_occupants: z.array(occupantSchema).optional().nullable(),
});

type OccupantPayload = z.infer<typeof occupantSchema>;

function roomNameOf(payload: {
  room_name?: string | null;
  room_jid?: string | null;
}): string | null {
  if (payload.room_name) return payload.room_name;

  const node = payload.room_jid?.split("@")[0];
  return node ? node : null;
}

// ---------------------------------------------------------------------------
// کنترلر
// ---------------------------------------------------------------------------

@Injectable()
export class JitsiHookProvider {
  readonly record = recordHookAttendance;
}

/**
 * چهار مسیر، چون ماژول prosody چهار تا صدا می‌زند و مسیرِ ناشناخته برایش
 * یعنی ۴۰۴ در لاگ سرور جیتسی و یک نگرانی الکی برای کسی که آن لاگ را
 * می‌خواند.
 *
 * ⚠️ همه‌ی پاسخ‌های «نادیده گرفتم» عمداً ۲۰۰ هستند. ماژول روی ۵xx دوباره
 * می‌فرستد، پس یک رویدادِ اتاقِ ناشناس با کد خطا تا ابد برمی‌گردد.
 */
@Public()
@UseGuards(JitsiHookGuard)
@Controller("classroom/hook/events")
export class JitsiHookController {
  private readonly logger = new Logger("JitsiHook");

  constructor(private readonly hook: JitsiHookProvider) {}

  /**
   * ساخته شدن اتاق.
   *
   * کاری با آن نداریم — رزرو از قبل هست و اتاق چیزی به آن اضافه نمی‌کند.
   * مسیرش فقط برای این وجود دارد که ۴۰۴ نگیرد. ولی همین که رسیده یعنی
   * هوک زنده است، و آن را ثبت می‌کنیم.
   */
  @Post("room/created")
  @HttpCode(HttpStatus.OK)
  async roomCreated(): Promise<{ ok: true }> {
    await recordHookEvent();
    return { ok: true };
  }

  /**
   * نابود شدن اتاق — و آشتی‌دهی.
   *
   * بدنه‌اش `all_occupants` دارد: همه‌ی کسانی که در طول جلسه آمدند، با
   * لحظه‌ی ورود و خروجشان. یعنی اگر رویداد تکیِ کسی گم شده باشد (تلاش
   * مجددِ ناموفق، ری‌استارت وُرکر، قطعی لحظه‌ای شبکه)، همین‌جا جبران
   * می‌شود.
   *
   * ارزشش را دارد چون جهت خطا نامتقارن است: ورودِ گم‌شده‌ی استاد یعنی
   * `NO_SHOW_TEACHER`، یعنی بازپرداختِ ناحق و پرونده‌ای روی میز ادمین.
   * قید یکتای تحویل باعث می‌شود آنچه رسیده بود دوباره ثبت نشود.
   */
  @Post("room/destroyed")
  @HttpCode(HttpStatus.OK)
  async roomDestroyed(
    @Body(zodPipe(roomEventSchema)) body: z.infer<typeof roomEventSchema>,
  ): Promise<{ ok: true; recovered: number }> {
    await recordHookEvent();

    const roomName = roomNameOf(body);
    let recovered = 0;

    for (const occupant of body.all_occupants ?? []) {
      if (occupant.joined_at) {
        const result = await this.ingest(
          roomName,
          occupant,
          AttendanceEvent.JOINED,
          occupant.joined_at,
        );
        if (result === "RECORDED") recovered += 1;
      }

      if (occupant.left_at) {
        const result = await this.ingest(
          roomName,
          occupant,
          AttendanceEvent.LEFT,
          occupant.left_at,
        );
        if (result === "RECORDED") recovered += 1;
      }
    }

    if (recovered > 0) {
      this.logger.warn(
        `${recovered} رویداد حضور موقع بسته شدن اتاق ${roomName} جبران شد — ` +
          "یعنی تحویل تکی‌شان شکست خورده بود.",
      );
    }

    return { ok: true, recovered };
  }

  @Post("occupant/joined")
  @HttpCode(HttpStatus.OK)
  async occupantJoined(
    @Body(zodPipe(occupantEventSchema)) body: z.infer<typeof occupantEventSchema>,
  ): Promise<{ ok: true; outcome: HookOutcome | "NO_IDENTITY" }> {
    await recordHookEvent();

    const outcome = await this.ingest(
      roomNameOf(body),
      body.occupant,
      AttendanceEvent.JOINED,
      body.occupant.joined_at ?? null,
    );

    return { ok: true, outcome };
  }

  @Post("occupant/left")
  @HttpCode(HttpStatus.OK)
  async occupantLeft(
    @Body(zodPipe(occupantEventSchema)) body: z.infer<typeof occupantEventSchema>,
  ): Promise<{ ok: true; outcome: HookOutcome | "NO_IDENTITY" }> {
    await recordHookEvent();

    const outcome = await this.ingest(
      roomNameOf(body),
      body.occupant,
      AttendanceEvent.LEFT,
      body.occupant.left_at ?? body.occupant.joined_at ?? null,
    );

    return { ok: true, outcome };
  }

  /**
   * مسیر مشترک هر چهار حالت.
   *
   * «هویت ندارد» جدا از بقیه گزارش می‌شود چون معنایش پیکربندی است نه
   * داده: یعنی کسی بدون توکن وارد اتاق شده و `ENABLE_GUESTS` روی سرور
   * جیتسی باز مانده. آن سرور دیگر فقط بلد نیست حضور را تأیید کند —
   * اتاق‌هایش هم برای هر کسی که نام اتاق را دارد باز است.
   */
  private async ingest(
    roomName: string | null,
    occupant: OccupantPayload,
    event: AttendanceEvent,
    reportedAt: Date | null,
  ): Promise<HookOutcome | "NO_IDENTITY"> {
    if (!roomName) {
      this.logger.warn("رویداد حضور بدون نام اتاق رسید و نادیده گرفته شد.");
      return "UNKNOWN_ROOM";
    }

    if (!occupant.id) {
      this.logger.error(
        `رویداد حضور اتاق ${roomName} بدون هویت رسید — یعنی کسی بدون توکن وارد شده. ` +
          "ENABLE_GUESTS روی سرور جیتسی را بررسی کنید.",
      );
      return "NO_IDENTITY";
    }

    const result = await this.hook.record({
      roomName,
      userId: occupant.id,
      event,
      reportedAt,
      occupantJid: occupant.occupant_jid ?? null,
    });

    if (result.outcome === "NOT_PARTICIPANT") {
      this.logger.error(
        `کاربر ${occupant.id} در اتاق ${roomName} بود ولی طرفِ آن رزرو نیست.`,
      );
    }

    return result.outcome;
  }
}
