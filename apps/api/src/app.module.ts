import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { sql } from "drizzle-orm";

import { db } from "./db/client.js";
import { redis } from "./redis/client.js";
import { AuthGuard, Public } from "./auth/auth.guard.js";
import { AuthController, AuthProvider } from "./auth/auth.controller.js";
import {
  AvailabilityController,
  AvailabilityProvider,
} from "./availability/availability.controller.js";
import { BookingController, BookingProvider } from "./booking/booking.controller.js";
import { CatalogController, CatalogService } from "./catalog/catalog.controller.js";

@Controller("health")
export class HealthController {
  /**
   * سلامت سرویس.
   *
   * عمداً به دیتابیس و ردیس هم می‌زند: اپلیکیشنی که بالا باشد ولی به
   * آن‌ها نرسد، از نظر عملی پایین است و لودبالانسر باید بداند.
   */
  @Public()
  @Get()
  async check(): Promise<{ status: string; database: string; redis: string }> {
    const [database, redisStatus] = await Promise.all([
      db
        .execute(sql`SELECT 1`)
        .then(() => "ok")
        .catch(() => "unreachable"),
      redis
        .ping()
        .then(() => "ok")
        .catch(() => "unreachable"),
    ]);

    const healthy = database === "ok" && redisStatus === "ok";

    return {
      status: healthy ? "ok" : "degraded",
      database,
      redis: redisStatus,
    };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // `.env` در ریشه‌ی مونوریپو است تا فرانت و بک یک منبع داشته باشند
      envFilePath: ["../../.env"],
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    CatalogController,
    AvailabilityController,
    BookingController,
  ],
  providers: [
    AuthProvider,
    CatalogService,
    AvailabilityProvider,
    BookingProvider,
    {
      /**
       * گارد احراز هویت سراسری است و مسیرها باید صریحاً با `@Public()`
       * معاف شوند.
       *
       * عکس این حالت — گارد اختیاری روی هر کنترلر — یعنی اندپوینت
       * جدیدی که یادت برود محافظتش کنی، بی‌سر و صدا باز می‌ماند. با
       * این ترتیب، فراموشی به سمت امن می‌افتد.
       */
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
