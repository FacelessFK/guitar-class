"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Avatar } from "@/components/avatar";
import { CheckIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-client";
import {
  getPractice,
  setAssignmentCompletion,
  type PracticeItem,
} from "@/lib/app-api";
import { faNumber, formatJalaliDayMonth, formatJalaliShort } from "@/lib/format";
import {
  buildPracticeSections,
  practiceStateLabel,
  type PracticeSectionKey,
} from "@/lib/practice-presentation";

type StateFilter = "ALL" | PracticeSectionKey;

const STATE_FILTERS: ReadonlyArray<{ value: StateFilter; label: string }> = [
  { value: "ALL", label: "همه" },
  { value: "ACTIVE", label: "برای تمرین" },
  { value: "WAITING", label: "ارسال‌شده" },
  { value: "FEEDBACK", label: "بازخورد گرفته" },
  { value: "COMPLETED", label: "انجام‌شده" },
];

/** Student practice inbox, backed only by the Phase 5A practice contract. */
export default function PracticePage() {
  const [items, setItems] = useState<PracticeItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [instrument, setInstrument] = useState("همه سازها");
  const [stateFilter, setStateFilter] = useState<StateFilter>("ALL");

  const load = useCallback(async () => {
    try {
      const loaded = await getPractice();
      setItems(loaded.filter((item) => item.role === "STUDENT"));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const instruments = useMemo(
    () => [
      "همه سازها",
      ...Array.from(new Set((items ?? []).map((item) => item.instrumentName))),
    ],
    [items],
  );

  const visibleItems = (items ?? []).filter(
    (item) => instrument === "همه سازها" || item.instrumentName === instrument,
  );
  const sections = buildPracticeSections(visibleItems).filter(
    (section) => stateFilter === "ALL" || section.key === stateFilter,
  );

  const activeCount = (items ?? []).filter(
    (item) => !item.completedAt && item.status === "ASSIGNED",
  ).length;
  const waitingCount = (items ?? []).filter(
    (item) => !item.completedAt && item.status === "SUBMITTED",
  ).length;

  async function toggleCompletion(item: PracticeItem) {
    if (pendingIds.has(item.id)) return;

    const completed = !item.completedAt;
    const previous = item.completedAt;

    setPendingIds((current) => new Set(current).add(item.id));
    setItemErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setItems((current) =>
      current?.map((entry) =>
        entry.id === item.id
          ? { ...entry, completedAt: completed ? new Date().toISOString() : null }
          : entry,
      ) ?? null,
    );

    try {
      const result = await setAssignmentCompletion(item.id, completed);
      setItems((current) =>
        current?.map((entry) =>
          entry.id === item.id ? { ...entry, completedAt: result.completedAt } : entry,
        ) ?? null,
      );
    } catch (caught) {
      setItems((current) =>
        current?.map((entry) =>
          entry.id === item.id ? { ...entry, completedAt: previous } : entry,
        ) ?? null,
      );
      setItemErrors((current) => ({ ...current, [item.id]: errorMessage(caught) }));
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] px-4.5 pt-6 pb-19 md:px-6 md:pt-9 md:pb-26">
      <PageIntro />

      {items && (activeCount > 0 || waitingCount > 0) ? (
        <p className="mt-3 text-[13.5px] text-meta">
          {faNumber(activeCount)} تمرین فعال · {faNumber(waitingCount)} تمرین منتظر بازخورد
        </p>
      ) : null}

      {error ? (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <p className="alert-error flex-1">{error}</p>
          <button type="button" className="btn-quiet" onClick={() => void load()}>
            تلاش دوباره
          </button>
        </div>
      ) : null}

      {items === null && !error ? (
        <PracticeSkeleton />
      ) : items?.length === 0 ? (
        <EmptyPractice />
      ) : items ? (
        <>
          <div className="mt-7 border-b border-divider pb-4 md:mt-8">
            <div className="-mx-4.5 flex gap-2 overflow-x-auto px-4.5 pb-3 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
              {instruments.map((label) => {
                const active = instrument === label;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setInstrument(label)}
                    className={`min-h-10 shrink-0 rounded-full px-4 text-[13.5px] transition ${
                      active
                        ? "bg-violet-tint text-violet-strong shadow-[inset_0_0_0_1px_var(--color-violet-border)]"
                        : "text-ink-2 shadow-[inset_0_0_0_1px_var(--color-divider)]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13.5px]">
              {STATE_FILTERS.map((filter) => {
                const active = stateFilter === filter.value;
                return (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStateFilter(filter.value)}
                    className={`min-h-10 border-b py-2 transition ${
                      active
                        ? "border-violet text-violet-strong"
                        : "border-transparent text-meta hover:text-ink-2"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>

          {sections.length === 0 ? (
            <div className="max-w-[44ch] pt-12">
              <p className="text-[17px] text-ink">تمرینی با این فیلتر پیدا نشد.</p>
              <p className="mt-2 text-[15px] text-ink-2">
                فیلترها را تغییر بده یا همه تمرین‌ها را ببین.
              </p>
              <button
                type="button"
                className="btn-ghost mt-3 min-h-11"
                onClick={() => {
                  setInstrument("همه سازها");
                  setStateFilter("ALL");
                }}
              >
                پاک کردن فیلترها
              </button>
            </div>
          ) : (
            sections.map((section) => (
              <PracticeSection
                key={section.key}
                sectionKey={section.key}
                title={section.label}
                items={section.items}
                itemErrors={itemErrors}
                pendingIds={pendingIds}
                onToggle={toggleCompletion}
              />
            ))
          )}
        </>
      ) : null}
    </div>
  );
}

function PageIntro() {
  return (
    <header>
      <div className="flex items-center gap-2.5 text-[13px] tracking-[0.08em] text-meta">
        <span className="h-px w-5 bg-wood" />
        <span>فضای تمرین</span>
      </div>
      <h1 className="mt-3.5 text-[clamp(25px,3vw,32px)] font-semibold tracking-[-0.02em] text-ink">
        تمرین‌های من
      </h1>
      <p className="mt-2.5 max-w-[52ch] text-[15.5px] leading-[1.95] text-ink-2">
        تمرین‌هایی که از کلاس‌هایت مانده، یک‌جا اینجاست.
      </p>
    </header>
  );
}

function PracticeSection({
  sectionKey,
  title,
  items,
  itemErrors,
  pendingIds,
  onToggle,
}: {
  sectionKey: PracticeSectionKey;
  title: string;
  items: PracticeItem[];
  itemErrors: Record<string, string>;
  pendingIds: Set<string>;
  onToggle: (item: PracticeItem) => Promise<void>;
}) {
  const strong = sectionKey === "ACTIVE";

  return (
    <section className="pt-9 md:pt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2
          className={`flex items-center gap-3 ${
            strong
              ? "text-[19px] font-semibold text-ink"
              : "text-[13px] tracking-[0.08em] text-meta"
          }`}
        >
          <span className={`h-px ${strong ? "w-5.5 bg-violet" : "w-5 bg-divider"}`} />
          {title}
        </h2>
        <span className="text-[13.5px] text-meta">{faNumber(items.length)} تمرین</span>
      </div>

      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <PracticeCard
            key={item.id}
            item={item}
            pending={pendingIds.has(item.id)}
            error={itemErrors[item.id]}
            onToggle={onToggle}
          />
        ))}
      </ul>
    </section>
  );
}

function PracticeCard({
  item,
  pending,
  error,
  onToggle,
}: {
  item: PracticeItem;
  pending: boolean;
  error?: string;
  onToggle: (item: PracticeItem) => Promise<void>;
}) {
  const done = Boolean(item.completedAt);
  const emphasized = item.status === "SUBMITTED" || item.status === "REVIEWED";

  return (
    <li
      className={`overflow-hidden rounded-panel bg-surface shadow-[inset_0_0_0_1px_var(--color-divider)] ${
        done && !emphasized ? "opacity-80" : ""
      }`}
    >
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:gap-5 md:p-5">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 md:gap-3.5">
          <button
            type="button"
            aria-label={done ? `برداشتن علامت انجام‌شده از ${item.title}` : `علامت زدن ${item.title} به‌عنوان انجام‌شده`}
            aria-pressed={done}
            disabled={pending}
            onClick={() => void onToggle(item)}
            className="-m-2 grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-50"
          >
            <span
              className={`grid size-[22px] place-items-center rounded-full transition ${
                done
                  ? "bg-ok-surface text-ok shadow-[inset_0_0_0_1px_var(--color-ok)]"
                  : emphasized
                    ? "text-transparent shadow-[inset_0_0_0_1px_var(--color-violet)]"
                    : "text-transparent shadow-[inset_0_0_0_1px_var(--color-divider-strong)]"
              }`}
            >
              {done ? <CheckIcon /> : null}
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <h3 className={`text-[16.5px] font-semibold ${done ? "text-ink-2" : "text-ink"}`}>
              {item.title}
            </h3>
            {item.description ? (
              <p className="mt-1.5 whitespace-pre-line text-[14.5px] leading-[1.9] text-ink-2">
                {item.description}
              </p>
            ) : null}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px] text-meta">
              <Avatar
                name={item.counterpartName}
                url={item.counterpartAvatarUrl}
                className="size-5 rounded-full"
                textClassName="text-[8px]"
              />
              <span>
                {item.instrumentName} با {item.counterpartName}
              </span>
              <span className="size-[3px] rounded-full bg-divider-strong" />
              <span>از جلسه {formatJalaliDayMonth(item.scheduledAt.slice(0, 10))}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-4 md:w-44 md:flex-col md:items-end md:border-0 md:pt-0 md:text-end">
          {item.dueDate ? (
            <div>
              <div className="text-[12.5px] text-meta">مهلت</div>
              <div className="mt-0.5 text-sm text-ink-2">{formatJalaliShort(item.dueDate)}</div>
            </div>
          ) : null}
          <div>
            <div
              className={`text-[13px] ${
                item.status === "REVIEWED"
                  ? "text-violet-strong"
                  : item.status === "SUBMITTED"
                    ? "text-violet-strong"
                    : done
                      ? "text-ok"
                      : "text-meta"
              }`}
            >
              {pending ? "در حال ذخیره…" : practiceStateLabel(item)}
            </div>
            {item.latestSubmission ? (
              <div className="mt-1 text-[12.5px] text-meta">
                ارسال {formatJalaliShort(item.latestSubmission.createdAt.slice(0, 10))}
              </div>
            ) : null}
          </div>
          <Link href={`/sessions/${item.bookingId}`} className="min-h-11 py-2 text-[13.5px]">
            {item.status === "REVIEWED"
              ? "دیدن بازخورد ←"
              : item.status === "ASSIGNED"
                ? "جزئیات و ارسال اجرا ←"
                : "دیدن پرونده جلسه ←"}
          </Link>
        </div>
      </div>

      {error ? (
        <div className="border-t border-divider px-4 py-3 md:px-5">
          <p className="text-[13.5px] text-error">{error} دوباره تلاش کن.</p>
        </div>
      ) : null}
    </li>
  );
}

function PracticeSkeleton() {
  return (
    <div className="mt-8" aria-label="در حال بارگذاری تمرین‌ها">
      <div className="flex gap-2 border-b border-divider pb-4">
        <Skeleton className="h-10 w-28 rounded-full" />
        <Skeleton className="h-10 w-24 rounded-full" delay={1} />
        <Skeleton className="h-10 w-20 rounded-full" delay={2} />
      </div>
      <Skeleton className="mt-11 h-6 w-32" />
      <div className="mt-5 space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" delay={1} />
        <Skeleton className="h-40 w-full" delay={2} />
      </div>
    </div>
  );
}

function EmptyPractice() {
  return (
    <section className="max-w-[46ch] pt-12">
      <div className="mb-3.5 flex items-center gap-3">
        <span className="h-px w-5 bg-wood" />
        <span className="text-[13px] tracking-[0.08em] text-meta">برای تمرین</span>
      </div>
      <h2 className="text-lg text-ink">هنوز تمرینی برایت ثبت نشده.</h2>
      <p className="mt-2 text-[15px] leading-[1.95] text-ink-2">
        بعد از اولین کلاس، نکات و تمرین‌های استاد اینجا می‌آید.
      </p>
      <Link href="/dashboard" className="mt-4 inline-flex min-h-11 items-center text-sm">
        دیدن کلاس‌های من ←
      </Link>
    </section>
  );
}
