import { Controller, Get, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { sql } from "drizzle-orm";

import { db } from "./db/client.js";
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
   * عمداً به دیتابیس هم می‌زند: اپلیکیشنی که بالا باشد ولی به پستگرس
   * نرسد، از نظر عملی پایین است و لودبالانسر باید بداند.
   */
  @Get()
  async check(): Promise<{ status: string; database: string }> {
    try {
      await db.execute(sql`SELECT 1`);
      return { status: "ok", database: "ok" };
    } catch {
      return { status: "degraded", database: "unreachable" };
    }
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
    CatalogController,
    AvailabilityController,
    BookingController,
  ],
  providers: [CatalogService, AvailabilityProvider, BookingProvider],
})
export class AppModule {}
