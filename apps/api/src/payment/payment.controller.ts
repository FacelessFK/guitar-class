import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client.js";
import { ledgerEntries, orders, teacherProfiles } from "../db/schema/index.js";
import { Public } from "../auth/auth.guard.js";
import { CurrentUserId } from "../common/current-user.decorator.js";
import { uuidSchema } from "../common/schemas.js";
import { zodPipe } from "../common/validation.pipe.js";
import { PaymentError } from "./errors.js";
import {
  settleOrder,
  startCheckout,
  teacherEarningsBreakdown,
  type SettlementResult,
} from "./payment.service.js";

@Injectable()
export class PaymentProvider {
  readonly checkout = startCheckout;
  readonly settle = settleOrder;
  readonly earnings = teacherEarningsBreakdown;
}

/**
 * دقیقاً یکی از رزرو یا پکیج.
 *
 * جلسه‌ی تکی با `bookingId` پرداخت می‌شود و پکیج با `enrollmentId` —
 * نه جلسه‌به‌جلسه. اگر جلسات پکیج جدا پرداخت می‌شدند، هنرجو می‌توانست
 * دو جلسه را بخرد و دو تای دیگر منقضی شوند و ثبت‌نام نیمه‌فعال بماند.
 */
const checkoutSchema = z
  .object({
    bookingId: uuidSchema.optional(),
    enrollmentId: uuidSchema.optional(),
  })
  .refine(
    (value) => (value.bookingId === undefined) !== (value.enrollmentId === undefined),
    { message: "باید دقیقاً یکی از bookingId یا enrollmentId فرستاده شود" },
  );

/**
 * پارامترهای بازگشت از درگاه.
 *
 * `Status` گرفته می‌شود ولی در تصمیم‌گیری استفاده نمی‌شود؛ فقط لاگ
 * می‌شود. تأیید همیشه سرور به سرور انجام می‌گیرد، چون این آدرس عمومی
 * است و هر کسی می‌تواند با `Status=OK` صدایش کند.
 */
const callbackSchema = z.object({
  Authority: z.string().min(1).max(120),
  Status: z.string().max(20).optional(),
});

interface OrderView {
  id: string;
  amount: string;
  status: string;
  gateway: string;
  refId: string | null;
  paidAt: string | null;
  createdAt: string;
}

@Controller("payments")
export class PaymentController {
  private readonly logger = new Logger("Payment");

  constructor(private readonly payment: PaymentProvider) {}

  /**
   * شروع پرداخت.
   *
   * سفارش ساخته می‌شود و آدرس درگاه برمی‌گردد. فرانت کاربر را به همان
   * آدرس می‌فرستد؛ خودِ مبلغ هرگز از سمت کلاینت نمی‌آید.
   */
  @Post("checkout")
  @HttpCode(HttpStatus.CREATED)
  async checkout(
    @CurrentUserId() studentId: string,
    @Body(zodPipe(checkoutSchema)) body: z.infer<typeof checkoutSchema>,
  ): Promise<{ orderId: string; amount: string; gateway: string; redirectUrl: string }> {
    const result = await this.payment.checkout({
      studentId,
      bookingId: body.bookingId,
      enrollmentId: body.enrollmentId,
    });

    return {
      orderId: result.orderId,
      amount: result.amount.toString(),
      gateway: result.gateway,
      redirectUrl: result.redirectUrl,
    };
  }

  /**
   * بازگشت از درگاه.
   *
   * عمومی است — کاربر با ریدایرکت مرورگر برمی‌گردد و هدر `Authorization`
   * همراهش نیست. امنیت از توکن نمی‌آید، از این می‌آید که تنها راه قطعی
   * شدن سفارش، تأیید موفقِ سرورِ درگاه با مبلغ درست است.
   *
   * پاسخ همیشه ریدایرکت است، حتی وقتی پرداخت ناموفق بوده: کاربر در
   * مرورگر است و باید صفحه ببیند، نه JSON.
   */
  @Public()
  @Get("callback")
  async callback(
    @Query(zodPipe(callbackSchema)) query: z.infer<typeof callbackSchema>,
    @Res() response: Response,
  ): Promise<void> {
    let result: SettlementResult | null = null;
    let errorCode: string | null = null;

    try {
      result = await this.payment.settle({ authority: query.Authority });
    } catch (error) {
      errorCode = error instanceof PaymentError ? error.code : "UNEXPECTED";
      this.logger.error(
        `تأیید پرداخت ${query.Authority} (Status=${query.Status ?? "-"}) شکست خورد: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    response.redirect(HttpStatus.FOUND, buildResultUrl(result, errorCode));
  }

  /** وضعیت یک سفارش. فقط صاحبش می‌بیند. */
  @Get("orders/:orderId")
  async getOrder(
    @CurrentUserId() studentId: string,
    @Param("orderId", zodPipe(uuidSchema)) orderId: string,
  ): Promise<OrderView | null> {
    const [row] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.studentId, studentId)))
      .limit(1);

    return row ? toOrderView(row) : null;
  }

  /** سفارش‌های کاربر جاری. */
  @Get("orders")
  async listOrders(
    @CurrentUserId() studentId: string,
  ): Promise<{ orders: OrderView[] }> {
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.studentId, studentId))
      .orderBy(desc(orders.createdAt))
      .limit(100);

    return { orders: rows.map(toOrderView) };
  }

  /**
   * درآمد استاد.
   *
   * `outstanding` همان چیزی است که در تسویه‌ی بعدی پرداخت می‌شود. چون
   * بازپرداخت در دفتر کل سطر منفی است، این عدد از پیش خالص است.
   *
   * `gross` و `commission` سطرهای تسویه را **نمی‌شمارند**: سطر تسویه
   * ناچار `gross` منفی دارد (قید دفتر کل `gross = commission + net` را
   * می‌خواهد و تسویه کمیسیون ندارد)، و بدون این تفکیک، «درآمد ناخالص»
   * استاد با گرفتنِ پول کم می‌شد.
   *
   * `net` هنوز هست و همان `outstanding` است — فرانتِ منتشرشده آن را
   * می‌خواند و شکستنش فقط برای تمیزی نام، صفحه‌ی درآمد را خالی می‌کرد.
   */
  @Get("earnings")
  async getEarnings(@CurrentUserId() userId: string): Promise<{
    gross: string;
    commission: string;
    net: string;
    earned: string;
    paidOut: string;
    outstanding: string;
    entries: Array<{
      type: string;
      gross: string;
      commission: string;
      net: string;
      description: string;
      createdAt: string;
    }>;
  }> {
    const [profile] = await db
      .select({ id: teacherProfiles.id })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.userId, userId))
      .limit(1);

    if (!profile) {
      return {
        gross: "0",
        commission: "0",
        net: "0",
        earned: "0",
        paidOut: "0",
        outstanding: "0",
        entries: [],
      };
    }

    const [breakdown, entries] = await Promise.all([
      this.payment.earnings(profile.id),
      db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.teacherId, profile.id))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(100),
    ]);

    return {
      gross: breakdown.gross.toString(),
      commission: breakdown.commission.toString(),
      net: breakdown.outstanding.toString(),
      earned: breakdown.earned.toString(),
      paidOut: breakdown.paidOut.toString(),
      outstanding: breakdown.outstanding.toString(),
      entries: entries.map((entry) => ({
        type: entry.type,
        gross: entry.grossAmount.toString(),
        commission: entry.commission.toString(),
        net: entry.netAmount.toString(),
        description: entry.description,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }
}

function toOrderView(row: typeof orders.$inferSelect): OrderView {
  return {
    id: row.id,
    amount: row.amount.toString(),
    status: row.status,
    gateway: row.gateway,
    refId: row.gatewayRefId,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * آدرس صفحه‌ی نتیجه در فرانت.
 *
 * `paid_unmatched` حالت نادر ولی مهمی است: پول گرفته شده اما در همان
 * فاصله مهلت رزرو تمام شده و اسلات آزاد شده. صفحه‌ی نتیجه باید صریح
 * بگوید پول برمی‌گردد، نه اینکه «موفق» نشان دهد.
 */
function buildResultUrl(result: SettlementResult | null, errorCode: string | null): string {
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const url = new URL("/payment/result", origin);

  if (!result) {
    url.searchParams.set("status", "error");
    url.searchParams.set("code", errorCode ?? "UNEXPECTED");
    return url.toString();
  }

  url.searchParams.set("order", result.orderId);

  if (result.status === "FAILED") {
    url.searchParams.set("status", "failed");
    if (result.reason) url.searchParams.set("reason", result.reason);
    return url.toString();
  }

  url.searchParams.set(
    "status",
    result.unconfirmedBookingIds.length > 0 ? "paid_unmatched" : "paid",
  );

  return url.toString();
}
