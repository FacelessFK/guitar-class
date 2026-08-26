"use client";

import { useState } from "react";

import { TeacherCard } from "@/components/teachers/teacher-card";
import { ButtonLink, EmptyState, Mark, Tabs } from "@/components/ui";
import type { Instrument, Teacher } from "@/lib/api";
import { faNumber } from "@/lib/format";

/**
 * فهرست استادها با فیلتر ساز.
 *
 * فیلتر **در حافظه** است نه در آدرس، و این عمدی است: صفحه‌ی استادها
 * مهم‌ترین دارایی سئوی پروژه پس از صفحات ساز است و در زمان بیلد ساخته
 * می‌شود. خواندن `searchParams` کل صفحه را داینامیک می‌کرد و آن هم برای
 * کاری که کلاینت در صفر میلی‌ثانیه انجام می‌دهد.
 *
 * تنها بخش کلاینتیِ صفحه همین است؛ سرصفحه و بخش پایانی سروری می‌مانند.
 */
export function TeacherDirectory({
  teachers,
  instruments,
}: {
  teachers: Teacher[];
  instruments: Instrument[];
}) {
  const [filter, setFilter] = useState("all");

  const tabs = [
    { value: "all", label: "همه" },
    ...instruments.map((i) => ({ value: i.slug, label: i.nameFa })),
  ];

  const shown =
    filter === "all"
      ? teachers
      : teachers.filter((teacher) =>
          teacher.offerings.some((o) => o.instrumentSlug === filter),
        );

  return (
    <>
      <section className="mx-auto max-w-[1160px] px-4.5 md:px-6">
        <Tabs
          items={tabs}
          active={filter}
          onSelect={setFilter}
          underline="narrow"
          className="gap-x-1 gap-y-2 rule-bottom-24 pb-4.5"
          itemClassName="px-4 pt-2.5 pb-3.5 text-[15px]"
        />

        <div className="mt-5 flex items-center gap-3 text-sm text-meta">
          <Mark width="sm" className="w-4.5" />
          <span>استادهای تأییدشده هوگه</span>
          <span aria-hidden="true">·</span>
          <span>
            {shown.length > 0 ? `${faNumber(shown.length)} استاد` : "بدون نتیجه"}
          </span>
        </div>
      </section>

      <section className="mx-auto max-w-[1160px] px-4.5 pt-8 pb-18 md:px-6 md:pt-[clamp(32px,4vw,44px)] md:pb-[clamp(72px,9vw,112px)]">
        {shown.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:[grid-template-columns:repeat(auto-fit,minmax(330px,1fr))] md:gap-[clamp(20px,2.4vw,30px)]">
            {shown.map((teacher) => (
              <TeacherCard key={teacher.profileId} teacher={teacher} />
            ))}
          </div>
        ) : (
          <div className="py-10 md:py-[clamp(56px,7vw,88px)]">
            <EmptyState
              title={
                filter === "all"
                  ? "هنوز استادی تأیید نشده است."
                  : "فعلاً استادی برای این ساز پیدا نشد."
              }
              action={
                filter === "all" ? undefined : (
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="btn-primary"
                  >
                    همه‌ی استادها
                  </button>
                )
              }
            >
              می‌توانی همه‌ی استادها را ببینی یا سازِ دیگری را انتخاب کنی.
            </EmptyState>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-[1160px] px-4.5 pb-18 md:px-6 md:pb-[clamp(96px,12vw,140px)]">
        <div className="rule-top flex flex-col items-start pt-12 md:pt-[clamp(48px,6vw,76px)]">
          <span
            aria-hidden="true"
            className="mb-6.5 h-px w-18 [background:linear-gradient(to_left,transparent,var(--color-wood),transparent)]"
          />
          <h2 className="max-w-[24ch] text-[clamp(24px,3vw,34px)] leading-[1.45] font-semibold tracking-[-0.02em] text-ink">
            هنوز مطمئن نیستی کدام استاد مناسب توست؟
          </h2>
          <p className="mt-4.5 max-w-[44ch] text-[17px] leading-[1.9] text-ink-2">
            جلسه معارفه‌ی بیست دقیقه‌ای رایگان است — استاد را ببین، بعد تصمیم
            بگیر.
          </p>
          {/*
            پروتوتایپ این دکمه را به صفحه‌ی ورود می‌فرستاد و بازبینی
            (بند C-04) همان را گرفت: پیش از آنکه کسی استادی انتخاب کرده
            باشد، ثبت‌نام خواستن زود است. مقصد جریان رزرو است و گاردِ
            ورود خودش با `?next=` کاربر را بعد از ورود همان‌جا برمی‌گرداند
            — همان صفحه، ولی بی‌آنکه مسیر گم شود.
          */}
          <ButtonLink href="/dashboard/book" size="lg" className="mt-7">
            رزرو جلسه معارفه
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
