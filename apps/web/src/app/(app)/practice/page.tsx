"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import { getPractice, type PracticeItem } from "@/lib/app-api";
import { formatJalaliDate } from "@/lib/format";

const STATUS_BADGE: Record<PracticeItem["status"], { label: string; tone: string }> = {
  ASSIGNED: { label: "در انتظار اجرا", tone: "badge-wait" },
  SUBMITTED: { label: "منتظر بازخورد", tone: "badge-neutral" },
  REVIEWED: { label: "بازخورد داده شد", tone: "badge-ok" },
};

/**
 * تمرین‌های همه‌ی جلسه‌ها، یک‌جا.
 *
 * پرونده‌ی هر جلسه تمرین‌های همان جلسه را دارد، ولی سؤال واقعی کاربر
 * بین دو کلاس این نیست که «جلسه‌ی سه‌شنبه چه گفت»، بلکه «الان چه باید
 * تمرین کنم» است — و برای استاد «چه چیزی منتظر من است». هر دو یک
 * فهرست‌اند از دو طرف.
 *
 * قرارداد برای هر آیتم نقش صریح دارد. این مسیر دنیای هنرجوست، پس
 * آیتم‌های `TEACHER` حساب دو‌نقشی را وارد صفحه نمی‌کند.
 */
export default function PracticePage() {
  const [items, setItems] = useState<PracticeItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPractice()
      .then((loaded) => setItems(loaded.filter((item) => item.role === "STUDENT")))
      .catch((caught: unknown) => setError(errorMessage(caught)));
  }, []);

  const open = (items ?? []).filter(
    (item) => item.role === "STUDENT" && item.status === "ASSIGNED",
  );
  const rest = (items ?? []).filter(
    (item) => item.role === "STUDENT" && item.status !== "ASSIGNED",
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold">تمرین‌ها</h1>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      {items === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : items.length === 0 ? (
        <p className="alert-info mt-8">
          هنوز تمرینی برایتان تعیین نشده است. بعد از اولین کلاس اینجا پر می‌شود.
        </p>
      ) : (
        <>
          <Section
            title="برای انجام"
            items={open}
          />
          <Section title="بقیه" items={rest} />
        </>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: PracticeItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">{title}</h2>
      <ul className="mt-4 space-y-3">
        {items.map((item) => {
          const badge = STATUS_BADGE[item.status];

          return (
            <li key={item.id}>
              <Link href={`/sessions/${item.bookingId}`} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{item.title}</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {item.instrumentName} · {item.counterpartName} · کلاس{" "}
                      {formatJalaliDate(item.scheduledAt.slice(0, 10))}
                    </p>
                  </div>
                  <span className={`badge ${badge.tone}`}>{badge.label}</span>
                </div>

                {item.dueDate ? (
                  <p className="mt-3 text-sm text-ink-muted">
                    مهلت: {formatJalaliDate(item.dueDate)}
                  </p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
