import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, rial, tstz, updatedAt } from "./columns.js";
import { creditReason, ledgerType, orderStatus, payoutStatus } from "./enums.js";
import { users } from "./identity.js";
import { teacherProfiles } from "./catalog.js";
import { bookings, enrollments } from "./booking.js";

export const orders = pgTable(
  "orders",
  {
    id: primaryId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    /** ریال — کل مبلغ سفارش، پیش از کسر اعتبار */
    amount: rial("amount").notNull(),
    /**
     * چقدر از `amount` با اعتبار هنرجو پرداخت می‌شود.
     *
     * `amount` عمداً کل قیمت می‌ماند و کم نمی‌شود: آن حقیقتِ «این سفارش
     * چقدر بود» است و گزارش‌های مالی رویش بنا شده‌اند. آنچه به درگاه
     * می‌رود `amount − credit_applied` است — در **هر دو** مرحله‌ی درخواست
     * و تأیید، از یک تابع (`gatewayAmountOf`). اگر این دو از هم جدا
     * شوند، درگاه مبلغ تأیید را با مبلغ درخواست نمی‌خواند و پرداخت با
     * خطای بی‌ربط رد می‌شود.
     *
     * برابر بودنش با `amount` یعنی سفارش اصلاً به درگاه نمی‌رود.
     */
    creditApplied: rial("credit_applied").notNull().default(sql`0`),
    status: orderStatus().notNull().default("PENDING"),

    gateway: varchar({ length: 40 }).notNull(),
    /** شناسه‌ی مرحله‌ی شروع پرداخت در درگاه */
    gatewayAuthority: varchar("gateway_authority", { length: 120 }),
    /** کد رهگیری نهایی */
    gatewayRefId: varchar("gateway_ref_id", { length: 120 }),

    paidAt: tstz("paid_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("orders_student_status_idx").on(table.studentId, table.status),
    /**
     * شناسه‌ی درگاه یکتاست، نه فقط ایندکس‌شده.
     *
     * کال‌بک درگاه فقط همین شناسه را دارد و سفارش از روی آن پیدا
     * می‌شود. اگر دو سفارش یک شناسه بگیرند، تأیید پرداخت ممکن است
     * سفارش اشتباه را قطعی کند. `NULL` چندتایی مجاز است، چون سفارش
     * پیش از رفتن به درگاه هنوز شناسه ندارد.
     */
    uniqueIndex("orders_gateway_authority_key").on(table.gatewayAuthority),
    check("orders_amount_positive", sql`${table.amount} > 0`),
    /**
     * اعتبار اعمال‌شده نه منفی است و نه از خود سفارش بیشتر.
     *
     * بیشتر بودنش یعنی سفارشی که مبلغ منفی به درگاه می‌فرستد؛ منفی بودنش
     * یعنی سفارشی که به هنرجو اعتبار می‌دهد. هیچ‌کدام مسیر کد ندارند،
     * ولی این ستون با حساب پر می‌شود و حسابِ اشتباه بی‌صداست.
     */
    check(
      "orders_credit_applied_within_amount",
      sql`${table.creditApplied} >= 0 AND ${table.creditApplied} <= ${table.amount}`,
    ),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: primaryId(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
    amount: rial("amount").notNull(),
  },
  (table) => [
    index("order_items_order_idx").on(table.orderId),
    // هر قلم باید دقیقاً به یکی از دو چیز وصل باشد
    check(
      "order_items_exactly_one_target",
      sql`(${table.bookingId} IS NOT NULL) <> (${table.enrollmentId} IS NOT NULL)`,
    ),
  ],
);

/**
 * دفتر کل — فقط افزودنی، هرگز ویرایش یا حذف نمی‌شود.
 *
 * از روز اول وجود دارد چون اضافه کردن حسابداری به سیستمی که ماه‌ها بدون
 * آن کار کرده، یعنی بازسازی تاریخچه از روی داده‌ی ناقص.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: primaryId(),
    type: ledgerType().notNull(),
    orderId: uuid("order_id").references(() => orders.id),
    bookingId: uuid("booking_id").references(() => bookings.id),
    teacherId: uuid("teacher_id").references(() => teacherProfiles.id),

    /** همه به ریال */
    grossAmount: rial("gross_amount").notNull(),
    commission: rial("commission").notNull(),
    netAmount: rial("net_amount").notNull(),

    description: varchar({ length: 200 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("ledger_teacher_created_idx").on(table.teacherId, table.createdAt),
    index("ledger_type_created_idx").on(table.type, table.createdAt),
    /**
     * هر رزرو حداکثر یک سطر درآمد دارد.
     *
     * کال‌بک درگاه ممکن است چند بار برسد — کاربر صفحه را رفرش می‌کند،
     * یا درگاه دوباره می‌فرستد. سرویس پرداخت با یک `UPDATE` شرطی
     * ایدمپوتنت است، ولی دفتر کل جایی نیست که به درستی کد اپلیکیشن
     * تکیه کنیم: درآمد دوباره‌ثبت‌شده یعنی دو برابر پول به استاد.
     * این ایندکس آن را در سطح دیتابیس ناممکن می‌کند.
     *
     * بازپرداخت‌ها عمداً بیرون شرط‌اند: یک رزرو می‌تواند درآمد داشته
     * باشد و بعد بازپرداخت.
     */
    uniqueIndex("ledger_one_earning_per_booking")
      .on(table.bookingId)
      .where(sql`${table.type} = 'EARNING'`),
    /**
     * و به همان دلیل، حداکثر یک سطر بازپرداخت.
     *
     * از وقتی جاروی عدم حضور هم می‌تواند بازپرداخت بزند، دو مسیر مستقل
     * (لغو دستی و عدم حضور استاد) به یک رزرو می‌رسند.
     * `recordCancellationRefund` قبل از درج بررسی می‌کند سطری هست یا نه،
     * ولی بررسی‌کردن-سپس-درج‌کردن در برابر دو اجرای هم‌زمان مصون نیست.
     * درج دوم اینجا به خطا می‌خورد، جاب دوباره تلاش می‌کند و این بار
     * سطر موجود را می‌بیند — به جای اینکه پول دو بار برگردد.
     */
    uniqueIndex("ledger_one_refund_per_booking")
      .on(table.bookingId)
      .where(sql`${table.type} = 'REFUND'`),
    check(
      "ledger_amounts_balance",
      sql`${table.grossAmount} = ${table.commission} + ${table.netAmount}`,
    ),
  ],
);

/**
 * اعتبار هنرجو — فقط افزودنی، دقیقاً مثل دفتر کل.
 *
 * **این دفتر کلِ استاد نیست و نباید با آن جمع شود.** `ledger_entries`
 * می‌گوید پلتفرم به استاد چه بدهکار است، این می‌گوید به هنرجو. یک لغو
 * هر دو را می‌نویسد: سطر منفی `REFUND` سهم استاد را برمی‌گرداند و سطر
 * مثبت `CANCELLATION` همان پول را به هنرجو. یعنی پس از لغو، کمیسیون هم
 * برگشته و کل مبلغ به شکل بدهی به هنرجو نزد پلتفرم می‌ماند — که دقیقاً
 * معنای «جلسه به اعتبار برمی‌گردد» در سیاست لغو است.
 *
 * موجودی جمع ساده‌ی `amount` است. ستون `users.credit_balance` کشِ همین
 * جمع است و از روی آن نوشته می‌شود، نه جدا از آن.
 */
export const creditEntries = pgTable(
  "credit_entries",
  {
    id: primaryId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    reason: creditReason().notNull(),
    /** ریال. مثبت یعنی اعطا، منفی یعنی خرج. */
    amount: rial("amount").notNull(),

    /** رزروی که این اعتبار از لغوش آمده */
    bookingId: uuid("booking_id").references(() => bookings.id),
    /** سفارشی که این اعتبار در آن خرج شده */
    orderId: uuid("order_id").references(() => orders.id),
    /** ادمینی که اعطای دستی را ثبت کرده — فقط برای `ADMIN_ADJUSTMENT` */
    createdById: uuid("created_by_id").references(() => users.id),

    description: varchar({ length: 200 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("credit_student_created_idx").on(table.studentId, table.createdAt),
    /**
     * هر رزرو حداکثر یک بار به اعتبار تبدیل می‌شود.
     *
     * قرینه‌ی `ledger_one_refund_per_booking` و به همان دلیل: دو مسیر
     * مستقل (لغو دستی و جاروی عدم حضور) به یک رزرو می‌رسند و
     * «اول ببین هست، بعد درج کن» در برابر دو اجرای هم‌زمان مصون نیست.
     * درج دوم اینجا به خطا می‌خورد — به جای اینکه هنرجو دو برابر اعتبار
     * بگیرد.
     *
     * هر دو سطر (دفتر کل و اعتبار) در یک تراکنش نوشته می‌شوند، پس این
     * قید و آن یکی با هم می‌ایستند یا با هم عقب می‌روند.
     */
    uniqueIndex("credit_one_cancellation_per_booking")
      .on(table.bookingId)
      .where(sql`${table.reason} = 'CANCELLATION'`),
    /**
     * و هر سفارش حداکثر یک بار اعتبار خرج می‌کند.
     *
     * تأیید پرداخت ایدمپوتنت است ولی چند بار صدا زده می‌شود (رفرش صفحه‌ی
     * بازگشت، ارسال دوباره‌ی درگاه). بدون این قید، تلاش دوم می‌توانست
     * اعتبار را دوباره کم کند در حالی که سفارش قبلاً قطعی شده.
     */
    uniqueIndex("credit_one_spend_per_order")
      .on(table.orderId)
      .where(sql`${table.reason} = 'SPEND'`),
    check("credit_amount_not_zero", sql`${table.amount} <> 0`),
    /**
     * علامت مبلغ باید با دلیلش بخواند.
     *
     * همان قاعده‌ی `isCreditAmountValid` در `packages/shared`. دو جا
     * بودنش عمدی است: تابع خطای قابل فهم می‌دهد و قید جلوی هر مسیری را
     * می‌گیرد که فردا آن تابع را صدا نزند. یک `SPEND` مثبت یعنی خرج
     * کردنی که به موجودی اضافه می‌کند.
     */
    check(
      "credit_amount_sign_matches_reason",
      sql`(${table.reason} = 'CANCELLATION' AND ${table.amount} > 0)
        OR (${table.reason} = 'SPEND' AND ${table.amount} < 0)
        OR ${table.reason} = 'ADMIN_ADJUSTMENT'`,
    ),
  ],
);

/** تسویه با استاد. در فاز فعلی دستی انجام می‌شود؛ این جدول فقط ثبت می‌کند. */
export const payouts = pgTable(
  "payouts",
  {
    id: primaryId(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teacherProfiles.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    amount: rial("amount").notNull(),
    status: payoutStatus().notNull().default("PENDING"),

    paidAt: tstz("paid_at"),
    trackingCode: varchar("tracking_code", { length: 120 }),
    note: text(),

    createdAt: createdAt(),
  },
  (table) => [
    index("payouts_teacher_status_idx").on(table.teacherId, table.status),
    check("payouts_period_ordered", sql`${table.periodEnd} >= ${table.periodStart}`),
    /**
     * یک تسویه به ازای هر استاد و هر دوره.
     *
     * جاروی ماهانه هر شب اجرا می‌شود و باید بتواند بگوید «دوره‌ی ماه
     * پیش را قبلاً ساخته‌ام». تکیه به بررسیِ «قبلاً هست؟» در کد کافی
     * نیست: دو اجرای هم‌زمان هر دو خالی بودن را می‌بینند و هر دو درج
     * می‌کنند — و برخلاف یک اعلان تکراری، اینجا نتیجه‌اش **دو برابر
     * پرداختن به استاد** است.
     *
     * قید کامل است و شرط جزئی ندارد، چون `payout_status` فقط `PENDING`
     * و `PAID` دارد و هیچ‌کدام «باطل» نیست. اگر روزی حالت لغو اضافه شد،
     * این ایندکس باید جزئی شود وگرنه یک تسویه‌ی لغوشده آن دوره را برای
     * همیشه غیرقابل‌پرداخت می‌کند.
     */
    uniqueIndex("payouts_one_per_teacher_period").on(
      table.teacherId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  student: one(users, { fields: [orders.studentId], references: [users.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  booking: one(bookings, { fields: [orderItems.bookingId], references: [bookings.id] }),
  enrollment: one(enrollments, {
    fields: [orderItems.enrollmentId],
    references: [enrollments.id],
  }),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  order: one(orders, { fields: [ledgerEntries.orderId], references: [orders.id] }),
  booking: one(bookings, { fields: [ledgerEntries.bookingId], references: [bookings.id] }),
  teacher: one(teacherProfiles, {
    fields: [ledgerEntries.teacherId],
    references: [teacherProfiles.id],
  }),
}));

export const creditEntriesRelations = relations(creditEntries, ({ one }) => ({
  student: one(users, { fields: [creditEntries.studentId], references: [users.id] }),
  booking: one(bookings, { fields: [creditEntries.bookingId], references: [bookings.id] }),
  order: one(orders, { fields: [creditEntries.orderId], references: [orders.id] }),
}));

export const payoutsRelations = relations(payouts, ({ one }) => ({
  teacher: one(teacherProfiles, {
    fields: [payouts.teacherId],
    references: [teacherProfiles.id],
  }),
}));
