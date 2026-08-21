/**
 * ردیف ستاره‌ی امتیاز.
 *
 * دو لایه روی هم: پنج ستاره‌ی توخالی، و همان پنج‌تا پُر که با عرض
 * بریده می‌شوند تا کسرِ امتیاز (مثلاً ۴.۹) هم دیده شود — نه فقط عددِ
 * گردشده. برای نظرهای تکی که امتیازشان صحیح است، برش یا کامل است یا
 * صفر.
 *
 * `dir="ltr"` عمدی است: برش از چپ پر می‌شود و جهتِ صفحه نباید معنای
 * «۴.۵ از ۵» را برعکس کند. خودِ ستاره متقارن است، پس چیدمانش بی‌طرف
 * است.
 *
 * از دسترس‌پذیری پنهان است؛ عددِ کنارش («۴.۹ از ۵») همان را با کلمه
 * می‌گوید و ستاره‌ها برای صفحه‌خوان تکرارند.
 */
export function Stars({ value, className = "" }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(5, value));
  const percent = (clamped / 5) * 100;

  return (
    <span
      dir="ltr"
      aria-hidden="true"
      className={`relative inline-flex ${className}`}
    >
      <Row className="text-border" />
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${percent}%` }}
      >
        <Row className="text-accent-strong" />
      </span>
    </span>
  );
}

function Row({ className }: { className: string }) {
  return (
    <span className={`flex ${className}`}>
      {[0, 1, 2, 3, 4].map((index) => (
        <Star key={index} />
      ))}
    </span>
  );
}

function Star() {
  return (
    <svg className="size-[1em]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.9l-5.81 3.06 1.11-6.47L2.6 9.9l6.5-.95L12 2.5z" />
    </svg>
  );
}
