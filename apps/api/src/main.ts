import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { AuthExceptionFilter } from "./common/auth-exception.filter.js";
import { DomainExceptionFilter } from "./common/domain-exception.filter.js";
import { BigIntSerializationInterceptor } from "./common/serialization.interceptor.js";
import { assertEnvironment } from "./config/env.js";

async function bootstrap(): Promise<void> {
  /**
   * پیش از ساختن اپ.
   *
   * `NestFactory.create` ماژول‌ها را می‌سازد و کارخانه‌های پیامک، درگاه و
   * ذخیره‌سازی همان‌جا اجرا می‌شوند — یعنی خطای «SMS_API_KEY نیست» در
   * میان ردِ پشته‌ی تزریق وابستگی نست گم می‌شود. اینجا، پیامْ اولین و
   * تنها چیزی است که در لاگ می‌آید.
   */
  assertEnvironment();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix("api");
  app.enableShutdownHooks();

  // `ValidationPipe` سراسری نست عمداً استفاده نمی‌شود: به
  // `class-validator` و `class-transformer` نیاز دارد و ما اعتبارسنجی
  // را با Zod انجام می‌دهیم. هر اندپوینت اسکیمای خودش را صریح اعلام
  // می‌کند، پس ورودی اعتبارسنجی‌نشده‌ای وجود ندارد.
  app.useGlobalFilters(new AuthExceptionFilter(), new DomainExceptionFilter());
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
