import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { Public } from "../auth/auth.guard.js";
import { CurrentUserId } from "../common/current-user.decorator.js";
import { zodPipe } from "../common/validation.pipe.js";
import { issueUploadTicket, MEDIA_PURPOSES, type MediaPurpose } from "./media.service.js";
import { InMemoryObjectStorage, objectStorage } from "./storage.port.js";

@Injectable()
export class MediaProvider {
  readonly issue = issueUploadTicket;
}

const uploadRequestSchema = z.object({
  purpose: z.enum(Object.keys(MEDIA_PURPOSES) as [MediaPurpose, ...MediaPurpose[]], {
    message: "مقصد فایل نامعتبر است",
  }),
  fileName: z.string().trim().min(1, "نام فایل لازم است").max(200),
  contentType: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[\w.+-]+\/[\w.+-]+$/, "نوع فایل نامعتبر است"),
  sizeBytes: z
    .number()
    .int("حجم فایل باید عدد صحیح باشد")
    .min(1, "فایل خالی است")
    .max(500 * 1024 * 1024, "حجم فایل بیش از حد بزرگ است"),
});

/**
 * آپلود مستقیم به آبجکت‌استوریج.
 *
 * فایل هرگز از این پروسه عبور نمی‌کند — به‌جز در آداپتور توسعه، که
 * صریحاً برای همین هست. مرورگر بلیت می‌گیرد، خودش `PUT` می‌زند، و بعد
 * `objectKey` را به اندپوینت مقصد (اجرای هنرجو، بازخورد) می‌دهد.
 */
@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaProvider) {}

  /**
   * بلیت آپلود.
   *
   * پاسخ عمداً `objectKey` را جدا از `uploadUrl` می‌دهد: کلاینت باید
   * همان `objectKey` را به اندپوینت بعدی بدهد، نه نشانی را. نشانی
   * نهایی را سرور از روی کلید می‌سازد، وگرنه هر رشته‌ای می‌توانست به‌جای
   * فایل ثبت شود.
   */
  @Post("upload-url")
  @HttpCode(HttpStatus.CREATED)
  async requestUpload(
    @CurrentUserId() userId: string,
    @Body(zodPipe(uploadRequestSchema)) body: z.infer<typeof uploadRequestSchema>,
  ): Promise<{
    objectKey: string;
    uploadUrl: string;
    headers: Record<string, string>;
    expiresAt: string;
  }> {
    const ticket = await this.media.issue({ userId, ...body });

    return {
      objectKey: ticket.objectKey,
      uploadUrl: ticket.uploadUrl,
      headers: ticket.headers,
      expiresAt: ticket.expiresAt.toISOString(),
      // `publicUrl` عمداً برنمی‌گردد: تا وقتی فایل به یک رکورد وصل
      // نشده، نشانی‌اش به درد کلاینت نمی‌خورد و برگرداندنش این توهم را
      // می‌سازد که همان را باید ثبت کند.
    };
  }

  /**
   * آپلود در حالت توسعه.
   *
   * فقط وقتی وجود دارد که آداپتور حافظه فعال باشد؛ با تنظیمات واقعی
   * S3، آدرس بلیت اصلاً به اینجا اشاره نمی‌کند و این مسیر ۴۰۴ می‌دهد.
   *
   * `@Public()` است چون آدرسِ بلیت در حالت واقعی هم بدون هدر
   * `Authorization` صدا زده می‌شود — امضا جای احراز هویت را می‌گیرد.
   * محافظتش این است که کلید تصادفی و غیرقابل حدس است و بدون بلیتِ
   * ردیس، فایلِ آپلودشده به هیچ رکوردی وصل نمی‌شود.
   */
  @Public()
  @Put("dev/*path")
  @HttpCode(HttpStatus.OK)
  async devUpload(
    @Param("path") path: string | string[],
    @Req() request: Request,
  ): Promise<{ objectKey: string }> {
    const storage = requireDevStorage();
    const objectKey = joinPath(path);

    const body = await readBody(request);
    storage.put(objectKey, body, request.header("content-type") ?? "application/octet-stream");

    return { objectKey };
  }

  /** خواندن فایل در حالت توسعه. */
  @Public()
  @Get("dev/*path")
  @Header("cache-control", "private, max-age=60")
  async devDownload(
    @Param("path") path: string | string[],
    @Res() response: Response,
  ): Promise<void> {
    const storage = requireDevStorage();
    const object = storage.get(joinPath(path));

    if (!object) throw new NotFoundException({ code: "NOT_FOUND", message: "فایل پیدا نشد." });

    response.setHeader("content-type", object.contentType);
    response.send(object.body);
  }
}

function requireDevStorage(): InMemoryObjectStorage {
  const storage = objectStorage();

  if (!(storage instanceof InMemoryObjectStorage)) {
    throw new NotFoundException({
      code: "NOT_FOUND",
      message: "این مسیر فقط در حالت توسعه فعال است.",
    });
  }

  return storage;
}

/** پارامتر وایلدکارت بسته به نسخه، رشته یا آرایه می‌آید. */
function joinPath(path: string | string[]): string {
  return Array.isArray(path) ? path.join("/") : path;
}

/**
 * بدنه‌ی خام درخواست.
 *
 * پارسر JSON نست این مسیر را دست نمی‌زند چون `content-type` فایل است،
 * پس جریان را دستی می‌خوانیم. سقف حجم دارد تا یک درخواست بی‌انتها
 * حافظه‌ی پروسه‌ی توسعه را نبلعد.
 */
const DEV_MAX_BYTES = 100 * 1024 * 1024;

async function readBody(request: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    total += buffer.length;

    if (total > DEV_MAX_BYTES) {
      throw new NotFoundException({
        code: "PAYLOAD_TOO_LARGE",
        message: "فایل برای ذخیره‌سازی توسعه بزرگ است.",
      });
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}
