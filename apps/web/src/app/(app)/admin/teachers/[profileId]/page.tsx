"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { TeacherStatusBadge } from "@/components/teacher-status-badge";
import { errorMessage } from "@/lib/api-client";
import {
  createOffering,
  createPayout,
  getAdminInstruments,
  getAdminTeacher,
  updateAdminTeacher,
  updateOffering,
  type AdminInstrument,
  type AdminTeacherDetail,
  type TeacherStatus,
} from "@/lib/app-api";
import { faNumber, formatDuration, formatToman } from "@/lib/format";

/**
 * پرونده‌ی یک استاد.
 *
 * همه‌ی کارهایی که تا امروز فقط با `db:studio` ممکن بود، اینجا جمع
 * شده‌اند: تأیید، درصد کمیسیون، ساخت و ویرایش سرویس، و ثبت تسویه.
 *
 * بعد از هر تغییر، کل پرونده دوباره از سرور خوانده می‌شود نه اینکه
 * حالت محلی وصله شود. پاسخ هر اندپوینت هم همان پرونده‌ی کامل است، پس
 * این یک رفت‌وبرگشت اضافه نیست — و مانده‌ی مالی که به دفتر کل بند است
 * هیچ‌وقت از واقعیت جدا نمی‌افتد.
 */
export default function AdminTeacherPage() {
  const params = useParams<{ profileId: string }>();
  const profileId = params.profileId;

  const [teacher, setTeacher] = useState<AdminTeacherDetail | null>(null);
  const [instruments, setInstruments] = useState<AdminInstrument[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, allInstruments] = await Promise.all([
        getAdminTeacher(profileId),
        getAdminInstruments(),
      ]);
      setTeacher(detail);
      setInstruments(allInstruments.filter((row) => row.isActive));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (teacher === null) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-12">
        {error ? (
          <p className="alert-error">{error}</p>
        ) : (
          <p className="text-sm text-ink-muted">در حال بارگذاری…</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <Link href="/admin/teachers" className="text-sm text-ink-muted">
        ← بازگشت به فهرست
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl leading-snug">{teacher.fullName}</h1>
          <p className="mt-1 text-sm text-ink-muted">{teacher.headline}</p>
          <p className="mt-1 text-sm text-ink-muted" dir="ltr">
            {teacher.phone}
          </p>
        </div>
        <TeacherStatusBadge status={teacher.status} />
      </div>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      <StatusSection teacher={teacher} onChange={setTeacher} onError={setError} />
      <TermsSection teacher={teacher} onChange={setTeacher} onError={setError} />
      <OfferingsSection
        teacher={teacher}
        instruments={instruments}
        onChange={setTeacher}
        onError={setError}
      />
      <BalanceSection teacher={teacher} onDone={load} onError={setError} />
      <ProfileSection teacher={teacher} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

interface EditProps {
  teacher: AdminTeacherDetail;
  onChange: (next: AdminTeacherDetail) => void;
  onError: (message: string | null) => void;
}

/**
 * تأیید و تعلیق.
 *
 * دکمه‌ی هر وضعیت فقط وقتی هست که واقعاً گذارِ ممکنی باشد، و اثرش صریح
 * نوشته شده: ادمینی که «معلق» را می‌زند باید بداند صفحه‌ی عمومی استاد
 * همان لحظه از دسترس خارج می‌شود.
 */
function StatusSection({ teacher, onChange, onError }: EditProps) {
  const [busy, setBusy] = useState(false);

  async function setStatus(status: TeacherStatus) {
    setBusy(true);
    onError(null);
    try {
      onChange(await updateAdminTeacher(teacher.profileId, { status }));
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="وضعیت">
      <div className="flex flex-wrap gap-3">
        {teacher.status !== "APPROVED" ? (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => void setStatus("APPROVED")}
          >
            تأیید استاد
          </button>
        ) : null}

        {teacher.status !== "SUSPENDED" ? (
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            onClick={() => void setStatus("SUSPENDED")}
          >
            {teacher.status === "PENDING" ? "رد درخواست" : "تعلیق"}
          </button>
        ) : null}

        {teacher.status === "SUSPENDED" ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void setStatus("PENDING")}
          >
            بازگرداندن به صف بررسی
          </button>
        ) : null}
      </div>

      <p className="mt-4 text-sm text-ink-muted">
        فقط استاد تأییدشده‌ای که دستِ‌کم یک سرویس فعال دارد در فهرست عمومی و
        صفحات رزرو دیده می‌شود. تعلیق، کلاس‌های رزروشده را لغو نمی‌کند.
      </p>
    </Section>
  );
}

/** درصد کمیسیون، فاصله‌ی بین کلاس‌ها، و نشانی صفحه. */
function TermsSection({ teacher, onChange, onError }: EditProps) {
  const [commission, setCommission] = useState(teacher.commissionRate);
  const [buffer, setBuffer] = useState(String(teacher.bufferMinutes));
  const [slug, setSlug] = useState(teacher.slug);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCommission(teacher.commissionRate);
    setBuffer(String(teacher.bufferMinutes));
    setSlug(teacher.slug);
  }, [teacher]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    onError(null);

    const changes: Parameters<typeof updateAdminTeacher>[1] = {};
    if (commission !== teacher.commissionRate) changes.commissionRate = commission;
    if (Number(buffer) !== teacher.bufferMinutes) changes.bufferMinutes = Number(buffer);
    if (slug !== teacher.slug) changes.slug = slug;

    if (Object.keys(changes).length === 0) {
      setBusy(false);
      setSaved(true);
      return;
    }

    try {
      onChange(await updateAdminTeacher(teacher.profileId, changes));
      setSaved(true);
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="شرایط">
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="commission">
              درصد کمیسیون
            </label>
            <input
              id="commission"
              className="input"
              dir="ltr"
              value={commission}
              onChange={(event) => setCommission(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="buffer">
              فاصله‌ی بین کلاس‌ها (دقیقه)
            </label>
            <input
              id="buffer"
              className="input"
              type="number"
              min={0}
              max={120}
              value={buffer}
              onChange={(event) => setBuffer(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="slug">
              نشانی صفحه
            </label>
            <input
              id="slug"
              className="input"
              dir="ltr"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
          </div>
        </div>

        {/*
          تغییر کمیسیون روی گذشته اثر ندارد و این باید صریح گفته شود:
          هر رزرو `commission_snapshot` خودش را دارد و تسویه‌های ثبت‌شده
          هم در دفتر کل نشسته‌اند.
        */}
        <p className="text-sm text-ink-muted">
          درصد تازه فقط روی فروش‌های بعدی اثر دارد. کلاس‌های فروخته‌شده کمیسیون
          لحظه‌ی فروش خودشان را نگه می‌دارند.
        </p>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "در حال ذخیره…" : "ذخیره"}
          </button>
          {saved ? <span className="text-sm text-success">ذخیره شد.</span> : null}
        </div>
      </form>
    </Section>
  );
}

/** ساخت و ویرایش سرویس — قیمت روی جفتِ (استاد، ساز) می‌نشیند. */
function OfferingsSection({
  teacher,
  instruments,
  onChange,
  onError,
}: EditProps & { instruments: AdminInstrument[] }) {
  const [instrumentId, setInstrumentId] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("60");
  const [busy, setBusy] = useState(false);

  const unused = instruments.filter(
    (instrument) =>
      !teacher.offerings.some((offering) => offering.instrumentId === instrument.id),
  );

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError(null);

    try {
      // قیمت به ریال است و به صورت رشته می‌رود: هیچ محاسبه‌ی پولی در
      // فرانت انجام نمی‌شود و `bigint` از JSON عبور نمی‌کند
      onChange(
        await createOffering(teacher.profileId, {
          instrumentId,
          price: tomanToRial(price),
          durationMinutes: Number(duration),
        }),
      );
      setInstrumentId("");
      setPrice("");
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(offeringId: string, isActive: boolean) {
    setBusy(true);
    onError(null);
    try {
      onChange(await updateOffering(offeringId, { isActive }));
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function changePrice(offeringId: string, current: string) {
    const input = window.prompt("قیمت تازه به تومان:", rialToTomanInput(current));
    if (input === null) return;

    setBusy(true);
    onError(null);
    try {
      onChange(await updateOffering(offeringId, { price: tomanToRial(input) }));
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="سرویس‌ها">
      {teacher.offerings.length === 0 ? (
        <p className="alert-info">
          هنوز سرویسی ندارد. تا وقتی سرویس نداشته باشد، حتی تأییدشده هم در فهرست
          عمومی نمی‌آید.
        </p>
      ) : (
        <ul className="space-y-2">
          {teacher.offerings.map((offering) => (
            <li
              key={offering.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {offering.instrumentName}
                  {offering.isActive ? "" : " · غیرفعال"}
                </p>
                <p className="mt-1 text-ink-muted">
                  {formatToman(offering.price)} تومان ·{" "}
                  {formatDuration(offering.durationMinutes)}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void changePrice(offering.id, offering.price)}
                >
                  تغییر قیمت
                </button>
                <button
                  type="button"
                  className={offering.isActive ? "btn-danger" : "btn-secondary"}
                  disabled={busy}
                  onClick={() => void toggle(offering.id, !offering.isActive)}
                >
                  {offering.isActive ? "غیرفعال کردن" : "فعال کردن"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {unused.length > 0 ? (
        <form
          onSubmit={(event) => void add(event)}
          className="mt-6 grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-4"
        >
          <div className="sm:col-span-2">
            <label className="label" htmlFor="instrument">
              ساز
            </label>
            <select
              id="instrument"
              className="input"
              value={instrumentId}
              onChange={(event) => setInstrumentId(event.target.value)}
              required
            >
              <option value="">انتخاب کنید…</option>
              {unused.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.nameFa}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="price">
              قیمت (تومان)
            </label>
            <input
              id="price"
              className="input"
              inputMode="numeric"
              dir="ltr"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="duration">
              مدت (دقیقه)
            </label>
            <input
              id="duration"
              className="input"
              type="number"
              min={15}
              max={180}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              required
            />
          </div>

          <div className="sm:col-span-4">
            <button type="submit" className="btn-primary" disabled={busy}>
              افزودن سرویس
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">
          برای همه‌ی سازهای فعال سرویس تعریف شده است.
        </p>
      )}
    </Section>
  );
}

/**
 * مانده و ثبت تسویه.
 *
 * «قابل تسویه» با «سهم استاد» فرق دارد: تسویه‌های ثبت‌شده‌ی پرداخت‌نشده
 * هم از آن کسر می‌شوند، وگرنه ثبتِ دوباره‌ی کل مانده دو برابر بدهی را
 * پرداختنی می‌کرد. سرور همین را دوباره بررسی می‌کند و عدد واقعی را در
 * خطا برمی‌گرداند.
 */
function BalanceSection({
  teacher,
  onDone,
  onError,
}: {
  teacher: AdminTeacherDetail;
  onDone: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError(null);

    try {
      await createPayout({
        teacherProfileId: teacher.profileId,
        periodStart,
        periodEnd,
        amount: tomanToRial(amount),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setOpen(false);
      setAmount("");
      setNote("");
      await onDone();
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="مالی">
      <div className="grid gap-4 sm:grid-cols-4">
        <Figure label="فروش ناخالص" value={teacher.balance.gross} />
        <Figure label="سهم پلتفرم" value={teacher.balance.commission} />
        <Figure label="تسویه‌شده" value={teacher.balance.paidOut} />
        <Figure label="مانده" value={teacher.balance.outstanding} emphasis />
      </div>

      {open ? (
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-6 grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2"
        >
          <div>
            <label className="label" htmlFor="periodStart">
              از تاریخ
            </label>
            <input
              id="periodStart"
              className="input"
              type="date"
              dir="ltr"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="periodEnd">
              تا تاریخ
            </label>
            <input
              id="periodEnd"
              className="input"
              type="date"
              dir="ltr"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="amount">
              مبلغ (تومان)
            </label>
            <input
              id="amount"
              className="input"
              inputMode="numeric"
              dir="ltr"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="note">
              یادداشت
            </label>
            <input
              id="note"
              className="input"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              ثبت تسویه
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
            >
              انصراف
            </button>
          </div>

          <p className="text-sm text-ink-muted sm:col-span-2">
            تسویه در وضعیت «در انتظار» ثبت می‌شود. پس از انتقال واقعی وجه، در
            صفحه‌ی تسویه آن را «پرداخت شد» علامت بزنید — سطر دفتر کل همان‌جا
            نوشته می‌شود.
          </p>
        </form>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={teacher.balance.outstanding === "0"}
            onClick={() => setOpen(true)}
          >
            ثبت تسویه
          </button>
          <Link href="/admin/payouts" className="text-sm text-ink-muted">
            تاریخچه‌ی تسویه‌ها
          </Link>
        </div>
      )}
    </Section>
  );
}

function Figure({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="card">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className={`mt-2 ${emphasis ? "text-lg font-bold" : ""}`}>
        {formatToman(value)} <span className="text-xs font-normal">تومان</span>
      </p>
    </div>
  );
}

/** متن پروفایل — خواندنی است؛ نویسنده‌اش خودِ استاد است. */
function ProfileSection({ teacher }: { teacher: AdminTeacherDetail }) {
  return (
    <Section title="پروفایل عمومی">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-ink-muted">سال سابقه</dt>
          <dd>{faNumber(teacher.yearsExperience)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">ویدیوی معارفه</dt>
          <dd dir="ltr">
            {teacher.introVideoUrl ? (
              <a
                href={teacher.introVideoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent underline"
              >
                {teacher.introVideoUrl}
              </a>
            ) : (
              <span className="text-warning">ندارد</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">درباره</dt>
          <dd className="whitespace-pre-line">{teacher.bio ?? "—"}</dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-ink-muted">
        این متن‌ها را خودِ استاد در پنلش می‌نویسد و از اینجا قابل ویرایش نیستند.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------

/**
 * تومانِ واردشده به ریال.
 *
 * ورودی ادمین تومان است چون هیچ‌کس قیمت را به ریال نمی‌خواند، ولی API
 * فقط ریال می‌گیرد. `BigInt` استفاده می‌شود نه `Number`: مبالغ بزرگ از
 * حد امن عدد جاوااسکریپت رد می‌شوند و در مسیر پول، گرد شدن ممنوع است.
 *
 * رقم فارسی هم پذیرفته می‌شود — صفحه‌کلید کاربر ایرانی همان است.
 */
function tomanToRial(input: string): string {
  const latin = input
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[^\d]/g, "");

  if (!latin) return "0";

  return (BigInt(latin) * 10n).toString();
}

function rialToTomanInput(rial: string): string {
  return (BigInt(rial) / 10n).toString();
}
