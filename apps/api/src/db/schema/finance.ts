import { relations, sql } from "drizzle-orm";
import { check, date, index, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { createdAt, primaryId, rial, tstz, updatedAt } from "./columns.js";
import { ledgerType, orderStatus, payoutStatus } from "./enums.js";
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
    /** ریال */
    amount: rial("amount").notNull(),
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
    index("orders_gateway_authority_idx").on(table.gatewayAuthority),
    check("orders_amount_positive", sql`${table.amount} > 0`),
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
    check(
      "ledger_amounts_balance",
      sql`${table.grossAmount} = ${table.commission} + ${table.netAmount}`,
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

export const payoutsRelations = relations(payouts, ({ one }) => ({
  teacher: one(teacherProfiles, {
    fields: [payouts.teacherId],
    references: [teacherProfiles.id],
  }),
}));
