import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { map, type Observable } from "rxjs";

/**
 * `BigInt` را برای JSON قابل سریال‌سازی می‌کند.
 *
 * مبالغ به ریال با `bigint` نگه‌داری می‌شوند و `JSON.stringify` روی
 * `BigInt` استثنا پرتاب می‌کند. تبدیل به **رشته** انجام می‌شود نه عدد،
 * چون کلاینت‌های جاوااسکریپتی مبالغ بزرگ را به ممیز شناور تبدیل می‌کنند
 * و خطای گردکردن وارد نمایش مالی می‌شود.
 *
 * جایگزین رایج، دستکاری `BigInt.prototype.toJSON` است که یک نوع پایه‌ی
 * زبان را برای کل فرایند عوض می‌کند. این راه محدود و صریح است.
 */
@Injectable()
export class BigIntSerializationInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value) => serializeBigInts(value)));
  }
}

export function serializeBigInts(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeBigInts);
  }

  // `Date` و مقادیر غیرشیء دست‌نخورده می‌مانند تا سریال‌ساز پیش‌فرض
  // آن‌ها را به ISO تبدیل کند
  if (value instanceof Date || value === null || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = serializeBigInts(item);
  }
  return output;
}
