import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { BookingExceptionFilter } from "./common/booking-exception.filter.js";
import { BigIntSerializationInterceptor } from "./common/serialization.interceptor.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix("api");
  app.enableShutdownHooks();

  // `ValidationPipe` سراسری نست عمداً استفاده نمی‌شود: به
  // `class-validator` و `class-transformer` نیاز دارد و ما اعتبارسنجی
  // را با Zod انجام می‌دهیم. هر اندپوینت اسکیمای خودش را صریح اعلام
  // می‌کند، پس ورودی اعتبارسنجی‌نشده‌ای وجود ندارد.
  app.useGlobalFilters(new BookingExceptionFilter());
  app.useGlobalInterceptors(new BigIntSerializationInterceptor());

  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);

  const logger = new Logger("Bootstrap");
  logger.log(`API روی http://localhost:${port}/api بالا آمد`);
}

void bootstrap();
