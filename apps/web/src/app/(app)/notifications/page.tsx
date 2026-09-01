"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  BellIcon,
  CalendarIcon,
  ChatIcon,
  CreditCardIcon,
} from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-client";
import {
  getNotifications,
  markNotificationsRead,
  type AppNotification,
} from "@/lib/app-api";
import { formatTehranJalaliShort, formatTehranTime } from "@/lib/format";
import {
  groupNotifications,
  notificationCategory,
  type NotificationCategory,
  type NotificationGroupKey,
} from "@/lib/notification-grouping";

type Filter = "ALL" | "UNREAD" | NotificationCategory;

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: "ALL", label: "همه" },
  { value: "UNREAD", label: "خوانده‌نشده" },
  { value: "CLASS", label: "کلاس‌ها" },
  { value: "PRACTICE", label: "تمرین و بازخورد" },
  { value: "PAYMENT", label: "پرداخت" },
];

/** Notifications keep the server message/type intact and group dates locally. */
export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getNotifications();
      setItems(data.notifications);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () =>
      (items ?? []).filter((item) => {
        if (filter === "UNREAD") return !item.read;
        if (filter !== "ALL") return notificationCategory(item.type) === filter;
        return true;
      }),
    [filter, items],
  );
  const groups = groupNotifications(shown);
  const unreadCount = (items ?? []).filter((item) => !item.read).length;

  async function markAll() {
    if (!items || unreadCount === 0 || busy) return;
    const previous = items;
    setBusy(true);
    setError(null);
    setItems(items.map((item) => ({ ...item, read: true })));
    try {
      await markNotificationsRead();
      router.refresh();
    } catch (caught) {
      setItems(previous);
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function openNotification(notification: AppNotification) {
    if (!notification.read) {
      const previous = items;
      setItems((current) =>
        current?.map((item) =>
          item.id === notification.id ? { ...item, read: true } : item,
        ) ?? null,
      );
      try {
        await markNotificationsRead([notification.id]);
        router.refresh();
      } catch (caught) {
        setItems(previous);
        setError(errorMessage(caught));
        return;
      }
    }

    if (notification.href) router.push(notification.href as Route);
  }

  return (
    <div className="mx-auto max-w-[920px] px-4.5 pt-6 pb-19 md:px-6 md:pt-9 md:pb-26">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <header>
          <div className="flex items-center gap-2.5 text-[13px] tracking-[0.08em] text-meta">
            <span className="h-px w-5 bg-wood" />
            <span>پیگیری</span>
          </div>
          <h1 className="mt-3.5 text-[clamp(25px,3vw,32px)] font-semibold tracking-[-0.02em] text-ink">
            اعلان‌ها
          </h1>
          <p className="mt-2.5 max-w-[52ch] text-[15.5px] leading-[1.95] text-ink-2">
            اتفاق‌های مهم کلاس‌ها و تمرین‌هایت اینجا جمع می‌شوند.
          </p>
        </header>

        {items && unreadCount > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void markAll()}
            className="btn-ghost min-h-11 text-[13.5px]"
          >
            {busy ? "در حال ذخیره…" : "همه را خوانده‌شده علامت بزن"}
          </button>
        ) : items && items.length > 0 ? (
          <div className="mt-2 flex items-center gap-2.5 text-[13.5px] text-meta">
            <span className="h-px w-4 bg-divider" />
            <span>همه اعلان‌ها را دیده‌ای.</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <p className="alert-error flex-1">{error}</p>
          <button type="button" className="btn-quiet" onClick={() => void load()}>
            تلاش دوباره
          </button>
        </div>
      ) : null}

      {items === null && !error ? (
        <NotificationsSkeleton />
      ) : items?.length === 0 ? (
        <EmptyNotifications />
      ) : items ? (
        <>
          <div className="-mx-4.5 mt-6 flex gap-5 overflow-x-auto border-b border-divider px-4.5 pb-1 [scrollbar-width:none] md:mx-0 md:mt-7 md:flex-wrap md:px-0">
            {FILTERS.map((entry) => {
              const active = entry.value === filter;
              return (
                <button
                  key={entry.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(entry.value)}
                  className={`min-h-11 shrink-0 border-b py-2 text-[13.5px] transition ${
                    active
                      ? "border-violet text-violet-strong"
                      : "border-transparent text-meta hover:text-ink-2"
                  }`}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>

          {groups.length > 0 ? (
            groups.map((group) => (
              <section key={group.key} className="pt-8">
                <h2 className="flex items-center gap-3 text-[13px] font-medium tracking-[0.08em] text-meta">
                  <span className="h-px w-4 bg-wood" />
                  {group.label}
                </h2>
                <ul className="mt-3">
                  {group.items.map((notification) => (
                    <li key={notification.id}>
                      <NotificationRow
                        notification={notification}
                        groupKey={group.key}
                        onOpen={openNotification}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <div className="max-w-[44ch] pt-12">
              <p className="text-[17px] text-ink">اعلانی در این بخش نیست.</p>
              <button
                type="button"
                className="btn-ghost mt-3 min-h-11"
                onClick={() => setFilter("ALL")}
              >
                دیدن همه اعلان‌ها
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function NotificationRow({
  notification,
  groupKey,
  onOpen,
}: {
  notification: AppNotification;
  groupKey: NotificationGroupKey;
  onOpen: (notification: AppNotification) => Promise<void>;
}) {
  const category = notificationCategory(notification.type);
  const canOpen = Boolean(notification.href) || !notification.read;
  const time =
    groupKey === "TODAY"
      ? formatTehranTime(notification.createdAt)
      : `${formatTehranJalaliShort(notification.createdAt)} · ${formatTehranTime(notification.createdAt)}`;

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => void onOpen(notification)}
      className={`block w-full rounded-[11px] border-s-2 border-b border-b-divider-soft text-start transition ${
        notification.read
          ? "border-s-transparent bg-transparent"
          : "border-s-violet bg-surface-2"
      } ${canOpen ? "cursor-pointer hover:bg-surface" : "cursor-default"}`}
    >
      <div className="flex items-start gap-3 px-3.5 py-4 md:px-4">
        <span
          className={`grid h-6 w-5 shrink-0 place-items-center ${
            notification.read ? "text-meta" : "text-violet"
          }`}
        >
          <NotificationIcon category={category} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-start md:gap-5">
          <div className="min-w-0 flex-1">
            <p
              className={`overflow-wrap-anywhere text-[15px] leading-[1.9] ${
                notification.read ? "font-medium text-ink-2" : "font-semibold text-ink"
              }`}
            >
              {notification.message}
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-4 md:flex-col md:items-end md:gap-2.5">
            <span className="flex items-center gap-2 text-[12.5px] text-meta">
              {!notification.read ? <span className="size-[5px] rounded-full bg-violet-strong" /> : null}
              <span className="whitespace-nowrap">{time}</span>
            </span>
            {notification.href ? (
              <span className="min-h-10 rounded-control px-3.5 py-2 text-[13.5px] text-violet-strong shadow-[inset_0_0_0_1px_var(--color-violet-border)]">
                دیدن جزئیات
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function NotificationIcon({ category }: { category: NotificationCategory }) {
  if (category === "CLASS") return <CalendarIcon size={17} />;
  if (category === "PRACTICE") return <ChatIcon size={17} />;
  if (category === "PAYMENT") return <CreditCardIcon size={17} />;
  return <BellIcon size={17} />;
}

function NotificationsSkeleton() {
  return (
    <div className="mt-7" aria-label="در حال بارگذاری اعلان‌ها">
      <div className="flex gap-5 border-b border-divider pb-4">
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-5 w-24" delay={1} />
        <Skeleton className="h-5 w-16" delay={2} />
      </div>
      <Skeleton className="mt-8 h-4 w-16" />
      <div className="mt-3 space-y-1">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" delay={1} />
        <Skeleton className="h-24 w-full" delay={2} />
      </div>
    </div>
  );
}

function EmptyNotifications() {
  return (
    <section className="max-w-[46ch] pt-12">
      <span className="mb-3.5 block h-px w-5 bg-wood" />
      <h2 className="text-lg text-ink">فعلاً خبری نیست.</h2>
      <p className="mt-2 text-[15px] leading-[1.95] text-ink-2">
        اعلان‌های مهم کلاس‌ها، پرداخت‌ها و بازخورد استاد اینجا نمایش داده می‌شوند.
      </p>
    </section>
  );
}
