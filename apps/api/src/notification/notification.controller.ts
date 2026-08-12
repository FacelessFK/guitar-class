import { Body, Controller, Get, HttpCode, HttpStatus, Injectable, Post } from "@nestjs/common";
import { z } from "zod";

import { CurrentUserId } from "../common/current-user.decorator.js";
import { uuidSchema } from "../common/schemas.js";
import { zodPipe } from "../common/validation.pipe.js";
import {
  listNotifications,
  markRead,
  type NotificationView,
} from "./in-app.service.js";

@Injectable()
export class NotificationProvider {
  readonly list = listNotifications;
  readonly markRead = markRead;
}

/** `ids` نیامده یعنی «همه را خوانده کن». */
const markReadSchema = z.object({
  ids: z.array(uuidSchema).max(100).optional(),
});

@Controller("notifications")
export class NotificationController {
  constructor(private readonly notifications: NotificationProvider) {}

  /**
   * اعلان‌های کاربر جاری.
   *
   * شمارنده‌ی نخوانده‌ها در همین پاسخ می‌آید، نه در اندپوینت جدا: پوسته‌ی
   * اپ برای نشان دادن نشانِ زنگ به آن نیاز دارد و درخواست دوم فقط یک
   * رفت‌وبرگشت اضافه روی اینترنتی است که کند است.
   */
  @Get()
  async list(
    @CurrentUserId() userId: string,
  ): Promise<{ notifications: NotificationView[]; unread: number }> {
    return this.notifications.list(userId);
  }

  @Post("read")
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUserId() userId: string,
    @Body(zodPipe(markReadSchema)) body: z.infer<typeof markReadSchema>,
  ): Promise<{ updated: number }> {
    return { updated: await this.notifications.markRead(userId, body.ids) };
  }
}
