import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * اعتبارسنجی ورودی با Zod.
 *
 * به‌جای `class-validator` استفاده می‌شود چون اسکیما هم‌زمان تایپ
 * TypeScript را استنتاج می‌کند — یک منبع حقیقت به‌جای دو تا (کلاس DTO
 * به‌علاوه‌ی دکوراتورها). ضمناً به فراداده‌ی دکوراتور تکیه ندارد.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "ورودی نامعتبر است.",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}

/** میان‌بر برای خوانایی بیشتر در امضای کنترلرها. */
export function zodPipe<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
