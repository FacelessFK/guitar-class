import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { sql } from "drizzle-orm";

import { db } from "./db/client.js";
import { redis } from "./redis/client.js";
import { AuthGuard, Public } from "./auth/auth.guard.js";
import { AdminController, AdminProvider } from "./admin/admin.controller.js";
import { AuthController, AuthProvider } from "./auth/auth.controller.js";
import {
  AvailabilityController,
  AvailabilityProvider,
} from "./availability/availability.controller.js";
import { BlogController, BlogProvider } from "./blog/blog.controller.js";
import { BookingController, BookingProvider } from "./booking/booking.controller.js";
import { CatalogController, CatalogService } from "./catalog/catalog.controller.js";
import {
  ClassroomController,
  ClassroomProvider,
} from "./classroom/classroom.controller.js";
import {
  JitsiHookController,
  JitsiHookProvider,
} from "./classroom/hook.controller.js";
import { LearningController, LearningProvider } from "./learning/learning.controller.js";
import { MediaController, MediaProvider } from "./media/media.controller.js";
import {
  NotificationController,
  NotificationProvider,
} from "./notification/notification.controller.js";
import { PaymentController, PaymentProvider } from "./payment/payment.controller.js";
import { ReviewController, ReviewProvider } from "./review/review.controller.js";
import { TeacherController, TeacherProvider } from "./teacher/teacher.controller.js";
import {
  readHookLastEventAt,
  readWorkerStatus,
  type WorkerStatus,
} from "./queue/heartbeat.js";

@Controller("health")
export class HealthController {
  /**
   * سلامت سرویس.
   *
   * عمداً به دیتابیس و ردیس هم می‌زند: اپلیکیشنی که بالا باشد ولی به
   * آن‌ها نرسد، از نظر عملی پایین است و لودبالانسر باید بداند.
   *
   * وُرکر هم گزارش می‌شود، چون پروسه‌ی جدایی است و مرگش از بیرون دیده
   * نمی‌شود. وُرکرِ خوابیده یعنی اسلات‌های رزروِ پرداخت‌نشده هرگز آزاد
   * نمی‌شوند — خرابی‌ای که هیچ درخواستی خطا نمی‌دهد.
   */
  @Public()
  @Get()
  async check(): Promise<{
    status: string;
    database: string;
    redis: string;
    worker: string;
    workerLastRunAt: string | null;
    sweeps: Record<string, string>;
    classroomHookLastEventAt: string | null;
  }> {
    const [database, redisStatus, worker, hookLastEventAt] = await Promise.all([
      db
        .execute(sql`SELECT 1`)
        .then(() => "ok")
        .catch(() => "unreachable"),
      redis
        .ping()
        .then(() => "ok")
        .catch(() => "unreachable"),
      readWorkerStatus().catch(
        (): WorkerStatus => ({ status: "never", lastRunAt: null, sweeps: [] }),
      ),
      readHookLastEventAt().catch(() => null),
    ]);

    const healthy = database === "ok" && redisStatus === "ok" && worker.status === "ok";

    return {
      status: healthy ? "ok" : "degraded",
      database,
      redis: redisStatus,
      worker: worker.status,
      workerLastRunAt: worker.lastRunAt,
      /**
       * به تفکیک جارو.
       *
       * با پنج جارو، «worker: stale» به‌تنهایی نمی‌گوید کدامشان خوابیده
       * — و چون هر کدام آستانه‌ی متفاوتی دارند، از روی `workerLastRunAt`
       * هم نمی‌شود فهمید.
       */
      sweeps: Object.fromEntries(
        worker.sweeps.map((entry) => [entry.sweep, entry.status]),
      ),
      /**
       * روی `status` اثر ندارد و عمدی است: هوک فقط وقتی حرف می‌زند که
       * کلاسی برگزار شود، پس سکوتش شب‌ها و روزهای خلوت طبیعی است.
       * `null` بودنش بعد از اولین کلاس آزمایشی یعنی ماژول prosody نصب
       * نشده — و آن یعنی حضور همچنان فقط حرفِ مرورگر است.
       */
      classroomHookLastEventAt: hookLastEventAt,
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
    BlogController,
    AvailabilityController,
    BookingController,
    ClassroomController,
    JitsiHookController,
    PaymentController,
    TeacherController,
    AdminController,
    MediaController,
    LearningController,
    NotificationController,
    ReviewController,
  ],
  providers: [
    AuthProvider,
    AdminProvider,
    MediaProvider,
    LearningProvider,
    NotificationProvider,
    CatalogService,
    BlogProvider,
    AvailabilityProvider,
    BookingProvider,
    ClassroomProvider,
    JitsiHookProvider,
    PaymentProvider,
    TeacherProvider,
    ReviewProvider,
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
