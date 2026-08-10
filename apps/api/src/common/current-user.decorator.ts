import {
  UnauthorizedException,
  createParamDecorator,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";

/**
 * ⚠️ جای‌نگه‌دار موقت تا احراز هویت ساخته شود.
 *
 * فعلاً شناسه‌ی کاربر از هدر `x-user-id` خوانده می‌شود. **این احراز هویت
 * نیست** — هر کسی می‌تواند هر شناسه‌ای بفرستد و به جای هر کاربری عمل کند.
 *
 * هدف صرفاً این است که تا آمدن ورود با کد پیامکی، اندپوینت‌ها قابل
 * آزمایش باشند. وقتی ماژول `auth` ساخته شد، فقط بدنه‌ی همین دکوراتور
 * عوض می‌شود و هیچ کنترلری دست نمی‌خورد.
 *
 * پیش از اولین استقرار عمومی باید جایگزین شود.
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.header("x-user-id");

    if (!userId) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "برای این عملیات باید وارد شوید.",
      });
    }

    return userId;
  },
);
