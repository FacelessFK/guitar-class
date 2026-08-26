"use client";

import { useState } from "react";

import {
  Accordion,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Chip,
  Dialog,
  EmptyState,
  Field,
  InlineNotice,
  Mark,
  MobileMenu,
  MobileMenuLink,
  MobileMenuRule,
  OtpInput,
  Photo,
  SectionMark,
  Select,
  Skeleton,
  SkeletonRow,
  Spinner,
  StatusDot,
  StepTrail,
  Stepper,
  Tabs,
  Textarea,
  TextInput,
  TimeChip,
  faDigits,
} from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { useCountdown } from "@/hooks/use-countdown";

/**
 * گالری پریمیتیوها — موقت، فاز ۰.
 *
 * هدفش یک چیز است: تأیید لایه‌ی توکن و پریمیتیوها **پیش از** دست زدن
 * به هر صفحه‌ی واقعی. بدون این، اشتباهِ یک توکن در بیست صفحه پخش
 * می‌شود و ردیابی‌اش سخت است.
 *
 * در پایان فاز ۹ حذف می‌شود. تا آن موقع بیرون از `(app)` است تا گاردِ
 * ورود نگیرد و `noindex` دارد.
 */
export default function DesignSystemPage() {
  const [chip, setChip] = useState("گیتار کلاسیک");
  const [tab, setTab] = useState<"a" | "b" | "c">("a");
  const [code, setCode] = useState("");
  const [step, setStep] = useState(3);
  const [trail, setTrail] = useState(1);
  const [dialog, setDialog] = useState(false);
  const [checked, setChecked] = useState(true);
  const deadline = useCountdown(522);

  return (
    <div dir="rtl" className="min-h-screen bg-bg text-ink">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <SectionMark>فاز ۰ · گالری موقت</SectionMark>
        <h1 className="mt-4 text-[32px] font-semibold tracking-[-0.02em] text-ink">
          Hygge Nocturne V2
        </h1>
        <p className="mt-2 max-w-[52ch] text-[15.5px] text-ink-2">
          هر پریمیتیو در همه‌ی حالت‌هایش. اگر رنگی اینجا غلط باشد، در
          بیست صفحه غلط است.
        </p>

        <Block title="سطح و عمق">
          <div className="flex flex-wrap gap-3">
            {(
              [
                ["bg-bg", "زمینه‌ی صفحه"],
                ["bg-surface", "پنل"],
                ["bg-surface-2", "پرِ درونی"],
                ["bg-well", "چاهِ عکس"],
                ["bg-violet-surface", "ته‌رنگ بنفش"],
              ] as const
            ).map(([cls, label]) => (
              <div
                key={cls}
                className={`${cls} grid h-24 w-40 place-items-center rounded-panel text-center text-[13px] text-ink-2 shadow-[inset_0_0_0_1px_var(--color-divider)]`}
              >
                <span>
                  {label}
                  <br />
                  <code className="text-meta">{cls}</code>
                </span>
              </div>
            ))}
          </div>
        </Block>

        <Block title="متن — سه سطح">
          <p className="text-lg text-ink">عاجی · عنوان، عدد، هر چه باید خوانده شود</p>
          <p className="mt-2 text-[15.5px] text-ink-2">
            ink-2 · متن بدنه و توضیح
          </p>
          <p className="mt-2 text-[13.5px] text-meta">
            meta · برچسب، تاریخ، شمارنده
          </p>
          <p className="mt-4 text-[15px] text-violet-strong">
            violet-strong · لینک و متن بنفش (violet هرگز متن نیست)
          </p>
          <p className="mt-2 text-[15px] text-wood-light">
            wood-light · متن چوبی (wood هرگز متن نیست)
          </p>
        </Block>

        <Block title="علامت بخش">
          <div className="flex flex-col gap-3">
            <SectionMark tone="wood">چوبی — علامتِ بخش</SectionMark>
            <SectionMark tone="violet">بنفش — وضعیت و تعامل</SectionMark>
            <SectionMark tone="divider" width="md">
              divider — بخشِ آرام
            </SectionMark>
            <div className="flex items-center gap-3">
              {(["xs", "sm", "md", "lg", "xl", "full"] as const).map((w) => (
                <Mark key={w} width={w} />
              ))}
            </div>
          </div>
        </Block>

        <Block title="خط محوشونده">
          <div className="flex flex-col gap-6">
            {(
              [
                ["rule-top", "۴۸px — لبه‌ی بخش و پابرگ"],
                ["rule-top-24", "۲۴px — نوار فیلتر و کارت"],
                ["rule-top-8", "۸px — ردیف فهرست"],
                ["rule-plain", "بی‌فرورفتگی — ردیف‌های چسبیده"],
                ["rule-top-wood", "چوبی‌سر — نوار حقیقت و آمار استاد"],
              ] as const
            ).map(([cls, label]) => (
              <div key={cls} className={`${cls} pt-5 text-[13.5px] text-meta`}>
                {label} · <code>{cls}</code>
              </div>
            ))}
          </div>
        </Block>

        <Block title="کنش — سه سطح">
          <div className="flex flex-wrap items-center gap-4">
            <Button>پرداخت</Button>
            <Button variant="outline">رزرو جلسه معارفه رایگان</Button>
            <Button variant="quiet">بازگشت</Button>
            <Button variant="ghost">تغییر</Button>
            <Button variant="danger">بله، لغو کن</Button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Button size="sm">کوچک</Button>
            <Button size="lg">بزرگ · دیدن استادها</Button>
            <ButtonLink href="/">ButtonLink</ButtonLink>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Button disabled>غیرفعال</Button>
            <Button variant="outline" disabled>
              غیرفعال
            </Button>
            <Button busy>تأیید و ادامه</Button>
            <Button variant="outline" busy>
              ارسال
            </Button>
          </div>
          <div className="mt-5 max-w-72">
            <Button block>تمام‌عرض</Button>
          </div>
        </Block>

        <Block title="سطح — کارت">
          <div className="flex flex-wrap gap-4">
            <Card className="w-64">
              <p className="text-ink">کارتِ اپ · شعاع ۱۲</p>
              <p className="mt-2 text-sm text-ink-2">لبه‌ی divider</p>
            </Card>
            <Card world="site" className="w-64">
              <p className="text-ink">کارتِ عمومی · شعاع ۱۴</p>
              <p className="mt-2 text-sm text-ink-2">لبه‌ی divider</p>
            </Card>
            <Card emph className="w-64">
              <p className="text-ink">تأکیدشده</p>
              <p className="mt-2 text-sm text-ink-2">لبه‌ی divider-strong</p>
            </Card>
            <Card hollow className="w-64">
              <p className="text-ink">بی‌پر</p>
              <p className="mt-2 text-sm text-ink-2">فقط لبه، بدون سطح</p>
            </Card>
          </div>
        </Block>

        <Block title="فرم">
          <div className="grid max-w-xl gap-5">
            <Field label="نام و نام خانوادگی" htmlFor="ds-name">
              <TextInput id="ds-name" defaultValue="علی محمدی" />
            </Field>
            <Field
              label="شماره موبایل"
              htmlFor="ds-phone"
              aside="شناسه حساب"
              hint="با ارقام لاتین"
            >
              <TextInput id="ds-phone" dir="ltr" placeholder="09121234567" />
            </Field>
            <Field
              label="رمز عبور"
              htmlFor="ds-pass"
              error="رمز عبور اشتباه است."
            >
              <TextInput id="ds-pass" type="password" dir="ltr" invalid />
            </Field>
            <Field
              label="درباره من"
              htmlFor="ds-bio"
              count={faDigits("۱۲۸ / ۵۰۰")}
            >
              <Textarea id="ds-bio" placeholder="کمی درباره خودت بنویس…" />
            </Field>
            <Field label="روز" htmlFor="ds-day">
              <Select id="ds-day" defaultValue="شنبه">
                {["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox
              checked={checked}
              onChange={() => setChecked(!checked)}
            >
              استفاده از اعتبار هوگه (۶۵۰ هزار تومان)
            </Checkbox>
          </div>
        </Block>

        <Block title="کد پیامکی">
          <div className="max-w-md">
            <p className="label">کد شش‌رقمی پیامک‌شده</p>
            <OtpInput
              value={code}
              onChange={setCode}
              label="کد شش‌رقمی پیامک‌شده"
            />
            <p className="mt-3 text-[13.5px] text-meta">
              چسباندن پخش می‌شود · Backspace به عقب می‌رود · مقدار:{" "}
              <code dir="ltr">{code || "—"}</code>
            </p>
            <div className="mt-6">
              <p className="label">حالت خطا</p>
              <OtpInput value="12" onChange={() => {}} invalid />
            </div>
          </div>
        </Block>

        <Block title="تراشه">
          <div className="flex flex-wrap gap-2">
            {["همه سازها", "گیتار کلاسیک", "پیانو", "ویولن"].map((c) => (
              <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>
                {c}
              </Chip>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {["مبتدی", "متوسط", "پیشرفته"].map((c, i) => (
              <Chip key={c} shape="box" selected={i === 0}>
                {c}
              </Chip>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <TimeChip>۱۶:۰۰</TimeChip>
            <TimeChip selected>۱۸:۰۰</TimeChip>
            <TimeChip unavailable>۲۰:۰۰</TimeChip>
          </div>
        </Block>

        <Block title="تب">
          <Tabs
            items={[
              { value: "a", label: "همه" },
              { value: "b", label: "برای تمرین" },
              { value: "c", label: "بازخورد گرفته" },
            ]}
            active={tab}
            onSelect={setTab}
          />
        </Block>

        <Block title="نشانگر مرحله">
          <Stepper
            steps={["ساز", "استاد", "نوع کلاس", "زمان", "تأیید"]}
            current={step}
          />
          <div className="mt-5 flex gap-3">
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setStep(Math.max(1, step - 1))}
            >
              قبلی
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setStep(Math.min(5, step + 1))}
            >
              بعدی
            </Button>
          </div>

          <div className="mt-10">
            <StepTrail
              steps={[
                { label: "اطلاعات تدریس", num: "۰۱" },
                { label: "معرفی تو", num: "۰۲" },
                { label: "نمونه ویدیویی", num: "۰۳" },
                { label: "مرور و ارسال", num: "۰۴" },
              ]}
              current={trail}
              onGo={setTrail}
            />
            <div className="mt-5">
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setTrail(Math.min(3, trail + 1))}
              >
                مرحله‌ی بعد
              </Button>
            </div>
          </div>
        </Block>

        <Block title="وضعیت">
          <div className="flex flex-wrap gap-6">
            <StatusDot tone="ok">تأییدشده</StatusDot>
            <StatusDot tone="wait">در انتظار پرداخت</StatusDot>
            <StatusDot tone="live">در حال برگزاری</StatusDot>
            <StatusDot tone="off">لغوشده</StatusDot>
            <StatusDot tone="error">ناموفق</StatusDot>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="badge badge-neutral">بخشی از بسته</span>
            <span className="badge badge-ok">برگزارشده</span>
            <span className="badge badge-wait">در انتظار پرداخت</span>
            <span className="badge badge-off">لغوشده</span>
          </div>
        </Block>

        <Block title="پیام">
          <div className="flex max-w-2xl flex-col gap-4">
            <InlineNotice>
              پس از پرداخت، دو ساعت پیش از شروع کلاس می‌توانی وارد اتاق شوی.
            </InlineNotice>
            <InlineNotice tone="wood">
              هدفون سیمی حتماً وصل باشد — بدون آن صدای ساز اکو می‌شود.
            </InlineNotice>
            <InlineNotice tone="error">شماره موبایل معتبر نیست.</InlineNotice>
            <InlineNotice tone="quiet">
              تا پرداخت انجام نشود، این ساعت قطعی نیست.
            </InlineNotice>
            <p className="alert-error">در نمونه‌ی طراحی، ورود انجام نمی‌شود.</p>
            <p className="alert-info">
              ۶۵۰ هزار تومان اعتبار داری — تمام مبلغ این جلسه با اعتبار پرداخت
              می‌شود.
            </p>
          </div>
        </Block>

        <Block title="بارگذاری">
          <SkeletonRow />
          <div className="mt-5 flex max-w-md flex-col gap-2.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" delay={1} />
            <Skeleton className="h-4 w-2/3" delay={2} />
          </div>
          <div className="mt-5 flex items-center gap-4 text-[13.5px] text-ink-2">
            <Spinner />
            <span>اسپینر روی زمینه‌ی تاریک</span>
            <span className="flex items-center gap-2 rounded-control bg-ivory px-3 py-2 text-on-ivory">
              <Spinner onIvory />
              روی پرِ عاجی
            </span>
          </div>
          <p className="mt-5 text-[13.5px] text-meta">
            مهلت پرداخت:{" "}
            <bdi dir="ltr" className="text-ink-2">
              {deadline.clock}
            </bdi>
          </p>
        </Block>

        <Block title="حالت خالی">
          <div className="flex flex-wrap gap-16">
            <EmptyState
              title="هنوز کلاسی رزرو نکرده‌ای."
              action={<Button>شروع رزرو</Button>}
            >
              ساز و استادت را انتخاب کن و یک ساعت آزاد از برنامه‌اش بردار.
            </EmptyState>
            <EmptyState quiet title="تمرینی منتظر بازخورد نیست." />
          </div>
        </Block>

        <Block title="آکاردئون">
          <div className="max-w-2xl">
            <Accordion
              items={[
                {
                  q: "جلسه معارفه رایگان چگونه برگزار می‌شود؟",
                  a: "یک جلسه‌ی بیست دقیقه‌ای زنده و یک‌به‌یک است که یک بار برای هر کاربر رایگان برگزار می‌شود.",
                },
                {
                  q: "برای شرکت در کلاس به چه چیزهایی نیاز دارم؟",
                  a: "سازت، اینترنت پایدار، و هدفون سیمی — هدفون سیمی برای شنیدن درست صدا الزامی است.",
                },
                {
                  q: "کلاس کجا برگزار می‌شود؟",
                  a: "در اتاق کلاس خودِ هوگه، داخل همین سایت.",
                },
              ]}
            />
            <div className="mt-8">
              <Accordion
                boxed
                defaultOpen={-1}
                items={[
                  {
                    q: "گونه‌ی قاب‌دار — صفحه‌ی نحوه کار",
                    a: "همان آکاردئون با قابِ کارت دور هر آیتم.",
                  },
                  {
                    q: "آیتم دوم",
                    a: "فقط یکی هم‌زمان باز می‌شود.",
                  },
                ]}
              />
            </div>
          </div>
        </Block>

        <Block title="عکس · چاه و lighten">
          <div className="flex flex-wrap items-start gap-5">
            <div className="w-52">
              <Photo
                src="/teachers/sample-guitar-teacher.jpg"
                alt="نمونه پرتره"
                ratio="4 / 5"
                focus="55% 34%"
              />
              <p className="mt-3 text-[13px] leading-[1.8] text-meta">
                این نمونه روی زمینه‌ی روشن گرفته شده و با <code>lighten</code>
                {" "}شسته دیده می‌شود. دیزاین صریحاً پرتره‌ی{" "}
                <span className="text-ink-2">زمینه‌تاریک</span> می‌خواهد.
              </p>
            </div>
            <div className="w-52">
              <div className="grid aspect-[4/5] place-items-center rounded-card bg-well text-center text-[13px] text-meta">
                چاهِ خالی · bg-well
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Avatar name="علی محمدی" className="size-7 rounded-full" textClassName="text-xs" />
                <Avatar name="نگار فرهمند" className="size-8 rounded-full" textClassName="text-xs" />
                <Avatar name="آرش مهرابی" className="size-11 rounded-full" textClassName="text-sm" />
                <Avatar name="سارا احمدی" className="size-20 rounded-full" textClassName="text-xl" />
              </div>
              <p className="text-[13px] text-meta">
                آواتار با فالبک حرف‌نگار روی violet-surface
              </p>
            </div>
          </div>
        </Block>

        <Block title="دیالوگ">
          <Button variant="quiet" onClick={() => setDialog(true)}>
            باز کردن دیالوگ
          </Button>
          <Dialog
            open={dialog}
            onClose={() => setDialog(false)}
            title="از کلاس خارج شوی؟"
            actions={
              <>
                <Button variant="danger" onClick={() => setDialog(false)}>
                  خروج از کلاس
                </Button>
                <Button variant="quiet" onClick={() => setDialog(false)}>
                  ادامه کلاس
                </Button>
              </>
            }
          >
            تا پایان زمان کلاس می‌توانی دوباره وارد شوی.
          </Dialog>
        </Block>

        <Block title="منوی موبایل — فقط زیر ۷۶۸px">
          <p className="mb-4 text-[13.5px] text-meta">
            <code>&lt;details&gt;</code> است نه استیتِ React، تا پوسته‌ی
            عمومی کامپوننت سروری بماند. پنجره را باریک کن تا دیده شود.
          </p>
          <MobileMenu label="منوی نمونه">
            <MobileMenuLink href="/" active edge>
              استادها
            </MobileMenuLink>
            <MobileMenuLink href="/">سازها</MobileMenuLink>
            <MobileMenuLink href="/">نحوه کار</MobileMenuLink>
            <MobileMenuRule />
            <MobileMenuLink href="/" tone="violet">
              ورود
            </MobileMenuLink>
            <MobileMenuLink href="/" tone="quiet">
              خروج
            </MobileMenuLink>
          </MobileMenu>
        </Block>

        <Block title="متن نوشته — prose-fa">
          <article className="prose-fa max-w-[62ch]">
            <p>
              انتخاب اولین ساز همیشه ساده نیست. معمولاً چند نام در ذهنمان هست و
              هرکدام دنیای متفاوتی را باز می‌کنند.
            </p>
            <h2>اول از همه، هدف خودت را مشخص کن</h2>
            <p>
              می‌خواهی برای دل خودت بنوازی، یا روزی روی صحنه بروی؟ پاسخ این
              پرسش بیش از هر معیار دیگری مسیر را روشن می‌کند. <a href="#">لینک</a>{" "}
              و <strong>متن پررنگ</strong> هم اینجاست.
            </p>
            <blockquote>
              بیست دقیقه‌ی هر روز، از دو ساعتِ آخر هفته بیشتر جواب می‌دهد.
            </blockquote>
            <ul>
              <li>صدای گرم و نزدیک: گیتار کلاسیک</li>
              <li>صدای روشن و دقیق: پیانو، سنتور</li>
            </ul>
          </article>
        </Block>
      </div>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rule-top mt-14 pt-8">
      <h2 className="mb-6 text-[19px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}
