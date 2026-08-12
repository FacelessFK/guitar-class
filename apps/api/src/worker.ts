import "reflect-metadata";

import { Logger } from "@nestjs/common";

import { sqlClient } from "./db/client.js";
import { closeRedis } from "./redis/client.js";
import {
  closeQueues,
  registerSchedulers,
  runNightlySweepsNow,
} from "./queue/queues.js";
import { createMaintenanceWorker } from "./queue/worker.js";
import { EXPIRE_HOLDS_INTERVAL_MS } from "./queue/maintenance.job.js";

/**
 * پروسه‌ی وُرکر — جدا از API.
 *
 * دو پروسه‌ی جدا چون بار و نحوه‌ی مقیاس‌دادنشان فرق دارد: از API چند
 * نمونه بالا می‌آید ولی وُرکر می‌تواند یکی بماند. اگر وُرکر داخل API
 * می‌نشست، هر نمونه‌ی API جارو را جدا اجرا می‌کرد.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger("Worker");

  await registerSchedulers();
  const worker = createMaintenanceWorker();

  // جاروهای شبانه یک بار همین حالا هم اجرا می‌شوند — تا اجرای ازدست‌رفته
  // جبران شود و سلامت پس از استقرار یک روز `degraded` نماند
  await runNightlySweepsNow();

  logger.log(
    `وُرکر بالا آمد — جارو هر ${EXPIRE_HOLDS_INTERVAL_MS / 1000} ثانیه اجرا می‌شود.`,
  );

  /**
   * خاموشی تمیز.
   *
   * `worker.close()` منتظر تمام شدن جابِ در حال اجرا می‌ماند. بدون آن،
   * کشتن پروسه وسط یک تراکنش، جاب را در وضعیت «در حال اجرا» رها می‌کند
   * تا مهلت قفلش تمام شود.
   */
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.log(`${signal} دریافت شد — در حال خاموش شدن...`);

    await worker.close();
    await closeQueues();
    await sqlClient.end();
    await closeRedis();

    logger.log("وُرکر تمیز خاموش شد.");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrap();
