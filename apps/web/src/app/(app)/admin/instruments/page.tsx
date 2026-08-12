"use client";

import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import {
  createInstrument,
  getAdminInstruments,
  updateInstrument,
  type AdminInstrument,
} from "@/lib/app-api";
import { faNumber } from "@/lib/format";

/**
 * سازها.
 *
 * ⚠️ متنِ توضیح، محتوای صفحه‌ی `/instruments/[slug]` است — همان صفحه‌ای
 * که سند معماری موتور اصلی سئو می‌داندش. سازی که با توضیح خالی ساخته
 * شود یک صفحه‌ی کم‌ارزش منتشر می‌کند، پس فرم آن را برجسته می‌پرسد و
 * فهرست، نداشتنش را علامت می‌زند.
 *
 * حذف عمداً وجود ندارد: ساز ممکن است به `offerings` و از آن‌جا به
 * رزروهای فروخته‌شده وصل باشد. «غیرفعال» همان کار را می‌کند بدون اینکه
 * تاریخچه را پاره کند.
 */
export default function AdminInstrumentsPage() {
  const [instruments, setInstruments] = useState<AdminInstrument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [slug, setSlug] = useState("");
  const [nameFa, setNameFa] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("");

  const load = useCallback(async () => {
    try {
      setInstruments(await getAdminInstruments());
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
      setInstruments([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await createInstrument({
        slug: slug.trim(),
        nameFa: nameFa.trim(),
        ...(description.trim() ? { descriptionFa: description.trim() } : {}),
        ...(sortOrder.trim() ? { sortOrder: Number(sortOrder) } : {}),
      });
      setSlug("");
      setNameFa("");
      setDescription("");
      setSortOrder("");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(instrument: AdminInstrument) {
    setBusy(true);
    setError(null);
    try {
      await updateInstrument(instrument.id, { isActive: !instrument.isActive });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <h1 className="text-2xl font-bold">سازها</h1>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      <form
        onSubmit={(event) => void add(event)}
        className="mt-8 grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-3"
      >
        <div>
          <label className="label" htmlFor="nameFa">
            نام فارسی
          </label>
          <input
            id="nameFa"
            className="input"
            value={nameFa}
            onChange={(event) => setNameFa(event.target.value)}
            placeholder="سه‌تار"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="slug">
            نشانی
          </label>
          <input
            id="slug"
            className="input"
            dir="ltr"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="setar"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="sortOrder">
            ترتیب نمایش
          </label>
          <input
            id="sortOrder"
            className="input"
            type="number"
            min={0}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          />
        </div>

        <div className="sm:col-span-3">
          <label className="label" htmlFor="description">
            متن صفحه‌ی ساز
          </label>
          <textarea
            id="description"
            className="input min-h-32"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="در کلاس آنلاین سه‌تار از…"
          />
          <p className="mt-2 text-xs text-ink-muted">
            همین متن در صفحه‌ی <span dir="ltr">/instruments/{slug || "…"}</span> منتشر
            و توسط گوگل ایندکس می‌شود. چند بند واقعی بنویسید، نه یک جمله.
          </p>
        </div>

        <div className="sm:col-span-3">
          <button type="submit" className="btn-primary" disabled={busy}>
            افزودن ساز
          </button>
        </div>
      </form>

      {instruments === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : (
        <ul className="mt-8 space-y-2">
          {instruments.map((instrument) => (
            <li
              key={instrument.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {instrument.nameFa}{" "}
                  <span className="text-ink-muted" dir="ltr">
                    /{instrument.slug}
                  </span>
                </p>
                <p className="mt-1 text-ink-muted">
                  {faNumber(instrument.offeringCount)} سرویس
                  {instrument.isActive ? "" : " · غیرفعال"}
                </p>
                {instrument.descriptionFa ? null : (
                  <p className="mt-1 text-warning">
                    متن صفحه ندارد — صفحه‌ی سئویی‌اش خالی منتشر می‌شود.
                  </p>
                )}
              </div>

              <button
                type="button"
                className={instrument.isActive ? "btn-danger" : "btn-secondary"}
                disabled={busy}
                onClick={() => void toggle(instrument)}
              >
                {instrument.isActive ? "غیرفعال کردن" : "فعال کردن"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
