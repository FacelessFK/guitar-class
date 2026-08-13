/**
 * تصویر سازها — امضای بصری این جهت.
 *
 * دو اندازه، دو کار:
 *
 *   `<InstrumentSignature>` — نشانِ خطی، برای اندازه‌ی کارت. تعداد و
 *   گروه‌بندی خط‌ها **از سیم‌های واقعی ساز** می‌آید: سنتور نُه خرک،
 *   تار سه جفت، ویولن چهار سیم. یعنی نشان از خودِ کالا درمی‌آید و
 *   روی محصول دیگری سوار نمی‌شود.
 *
 *   `<InstrumentDrawing>` — طرحِ خطیِ کاملِ ساز، برای قهرمانِ صفحه‌ی
 *   ساز. نشانِ خطی در آن اندازه لاغر است و طرحِ کامل در اندازه‌ی
 *   کارت به لکه تبدیل می‌شود؛ هیچ‌کدام جای دیگری را نمی‌گیرد.
 *
 * دو ساز سیم ندارند و قاعده برایشان از چیز دیگری می‌آید: تنبک از
 * حلقه‌های پوست، پیانو از ریتم کلاویه. این استثنا عمدی است.
 *
 * کاتالوگ از دیتابیس می‌آید و ادمین می‌تواند ساز تازه اضافه کند، پس
 * اسلاگِ ناشناس باید بی‌سروصدا کار کند — `FALLBACK` همان است.
 *
 * ⚠️ همان بی‌صدا بودن یعنی **غلط تایپی در اسلاگ هم بی‌صدا است**: ساز
 * تصویر عوضی می‌گیرد و هیچ خطایی نمی‌دهد. اسلاگ‌ها از `db/seed.ts`
 * می‌آیند (`tonbak` است نه `tombak`) و تایپ‌چک نمی‌گیردشان — تنها راه،
 * نگاه کردن به صفحه‌ی همان ساز است.
 */

type Signature =
  /** خط‌های افقی، گروه‌بندی‌شده — هر عدد یعنی چند سیم در آن گروه */
  | { kind: "strings"; groups: number[] }
  /** ریتم کلاویه — دنباله‌ی کلید سیاه در یک اکتاو */
  | { kind: "keys" }
  /** حلقه‌های پوست */
  | { kind: "head" };

const SIGNATURES: Record<string, Signature> = {
  /** شش سیم تکی */
  "classical-guitar": { kind: "strings", groups: [1, 1, 1, 1, 1, 1] },
  "pop-guitar": { kind: "strings", groups: [1, 1, 1, 1, 1, 1] },
  /** چهار سیم */
  violin: { kind: "strings", groups: [1, 1, 1, 1] },
  /** شش سیم در سه جفت */
  tar: { kind: "strings", groups: [2, 2, 2] },
  /** خرک‌های چهارسیمه — چهارتا نشان داده می‌شود، نه هر نُه‌تا */
  santoor: { kind: "strings", groups: [4, 4, 4, 4] },
  piano: { kind: "keys" },
  tonbak: { kind: "head" },
};

const FALLBACK: Signature = { kind: "strings", groups: [1, 1, 1, 1] };

/**
 * گامِ ثابتِ خط‌ها.
 *
 * ارتفاع نشان از **محتوایش** حساب می‌شود نه از یک عدد ثابت، پس گامِ
 * سیم‌ها در همه‌ی سازها یکی است و اختلافِ ارتفاع خودش اطلاعات می‌دهد:
 * ویولنِ چهارسیمه کوتاه است و سنتورِ پرسیم بلند. اگر همه را در یک
 * ارتفاع می‌فشردیم، دقیقاً همان تفاوتی که نشان برای آن ساخته شده از
 * بین می‌رفت.
 */
const STRING_PITCH = 4;
const GROUP_GAP = 6;
const SIGNATURE_WIDTH = 120;

function stringGeometry(groups: number[]) {
  const lines: Array<{ y: number; width: number }> = [];
  let y = 1;

  groups.forEach((count, groupIndex) => {
    for (let index = 0; index < count; index += 1) {
      lines.push({
        y,
        /**
         * سیم‌های بم ضخیم‌ترند — همان ترتیبی که روی خودِ ساز هست.
         */
        width: 0.9 + groupIndex * 0.3,
      });
      y += STRING_PITCH;
    }
    y += GROUP_GAP - STRING_PITCH;
  });

  return { lines, height: y - (GROUP_GAP - STRING_PITCH) + 1 };
}

/**
 * نشانِ خطیِ ساز.
 *
 * `aria-hidden` است و عمداً: کنارش همیشه نام ساز به‌صورت متن هست، و
 * خواندن دوباره‌اش برای صفحه‌خوان فقط تکرار است.
 */
export function InstrumentSignature({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const signature = SIGNATURES[slug] ?? FALLBACK;

  if (signature.kind === "strings") {
    const { lines, height } = stringGeometry(signature.groups);

    return (
      <svg
        viewBox={`0 0 ${SIGNATURE_WIDTH} ${height}`}
        className={className}
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
      >
        {lines.map((line) => (
          <line
            key={line.y}
            x1={0}
            x2={SIGNATURE_WIDTH}
            y1={line.y}
            y2={line.y}
            strokeWidth={line.width}
          />
        ))}
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 120 26"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
    >
      {signature.kind === "keys" ? <KeyRhythm /> : <DrumRings />}
    </svg>
  );
}

/** یک اکتاو: الگوی دو-سه‌تاییِ کلیدهای سیاه، که ریتمِ ناقرینه‌اش امضای پیانوست */
function KeyRhythm() {
  const blackKeys = [1, 2, 4, 5, 6];

  return (
    <g>
      <rect x={0.5} y={1} width={119} height={24} strokeWidth={1} />
      {Array.from({ length: 7 }, (_, index) => index + 1).map((index) => (
        <line
          key={index}
          x1={index * 17}
          x2={index * 17}
          y1={1}
          y2={25}
          strokeWidth={0.8}
        />
      ))}
      {blackKeys.map((index) => (
        <rect
          key={index}
          x={index * 17 - 4}
          y={1}
          width={8}
          height={14}
          fill="currentColor"
          fillOpacity={0.45}
          strokeWidth={0.7}
        />
      ))}
    </g>
  );
}

/** پوستِ کشیده‌شده روی دهانه — حلقه‌های هم‌مرکز */
function DrumRings() {
  return (
    <g>
      {[12, 9, 6, 3].map((radius, index) => (
        <ellipse
          key={radius}
          cx={60}
          cy={13}
          rx={radius * 4.2}
          ry={radius}
          strokeWidth={0.9 + index * 0.25}
        />
      ))}
    </g>
  );
}

/**
 * طرحِ خطیِ کاملِ ساز.
 *
 * همه روی یک `viewBox` مربع و با یک زبان خطی نوشته شده‌اند تا کنار
 * هم مثل یک مجموعه دیده شوند، نه هفت تصویر از هفت جا.
 */
export function InstrumentDrawing({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {DRAWINGS[slug] ?? DRAWINGS.violin}
    </svg>
  );
}

/**
 * سنتور — ذوزنقه، دو ستون خرک، سیم‌های کشیده روی آن‌ها.
 *
 * هندسه حساب می‌شود نه چشمی: سیم‌ها باید دقیقاً تا لبه‌ی مورّبِ بدنه
 * برسند و خرک‌ها روی همان سیم‌ها بنشینند. با مسیرِ دستی، هر بار که
 * اندازه عوض شود این دو از هم جدا می‌افتند.
 */
function Santoor() {
  const top = 30;
  const bottom = 92;
  const topLeft = 36;
  const topRight = 84;
  const slope = 22 / (bottom - top);

  const edges = (y: number) => ({
    left: topLeft - slope * (y - top),
    right: topRight + slope * (y - top),
  });

  const courses = [42, 54, 66, 78];

  return (
    <g>
      <path
        d={`M${topLeft} ${top}H${topRight}L${edges(bottom).right} ${bottom}H${edges(bottom).left}Z`}
      />

      {courses.map((y) => {
        const { left, right } = edges(y);
        return (
          <line key={y} x1={left} x2={right} y1={y} y2={y} strokeWidth={0.55} />
        );
      })}

      {/** دو ستون خرک — هر خرک زیر یک دسته سیم */}
      {courses.map((y) => {
        const { left, right } = edges(y);
        const width = right - left;
        return [0.32, 0.68].map((ratio) => (
          <line
            key={`${y}-${ratio}`}
            x1={left + width * ratio}
            x2={left + width * ratio}
            y1={y - 5}
            y2={y + 5}
            strokeWidth={1.5}
          />
        ));
      })}

      {/** دو مضراب، کنار ساز */}
      <path d="M30 102l12-7M40 107l12-7" strokeWidth={1.1} />
    </g>
  );
}

/** بدنه‌ی گیتار: دو لُپ، با گودیِ کمر */
const guitarBody = (
  <path d="M60 46c-11 0-19 6-19 15 0 6 3 10 3 15s-5 9-5 17c0 12 9 21 21 21s21-9 21-21c0-8-5-12-5-17s3-9 3-15c0-9-8-15-19-15z" />
);

const DRAWINGS: Record<string, React.ReactElement> = {
  "classical-guitar": (
    <g>
      {guitarBody}
      <path d="M56 12h8v34h-8z" />
      <circle cx={60} cy={70} r={9} />
      <circle cx={60} cy={70} r={12} strokeWidth={0.7} />
      {[18, 24, 30, 36].map((y) => (
        <line key={y} x1={56} x2={64} y1={y} y2={y} strokeWidth={0.7} />
      ))}
      {[-3, -1, 1, 3].map((offset) => (
        <line
          key={offset}
          x1={60 + offset}
          x2={60 + offset}
          y1={14}
          y2={92}
          strokeWidth={0.5}
        />
      ))}
      <line x1={48} x2={72} y1={92} y2={92} />
    </g>
  ),

  "pop-guitar": (
    <g>
      {guitarBody}
      <path d="M56 12h8v34h-8z" />
      <circle cx={60} cy={68} r={8} />
      {/** صفحه‌ی محافظ — تفاوتِ دیدنیِ گیتار پاپ با کلاسیک */}
      <path d="M72 62c6 3 9 9 8 16-1 6-6 10-11 9-4-1-6-5-5-10 1-6 4-11 8-15z" strokeWidth={0.9} />
      {[18, 24, 30, 36].map((y) => (
        <line key={y} x1={56} x2={64} y1={y} y2={y} strokeWidth={0.7} />
      ))}
      {[-3, -1, 1, 3].map((offset) => (
        <line
          key={offset}
          x1={60 + offset}
          x2={60 + offset}
          y1={14}
          y2={90}
          strokeWidth={0.5}
        />
      ))}
      <line x1={50} x2={70} y1={90} y2={90} />
    </g>
  ),

  violin: (
    <g>
      {/**
       * بدنه: لُپِ بالا باریک‌تر از لُپِ پایین، با کمرِ گودِ تیز بینشان.
       * نسبت‌ها همان چیزی است که ویولن را از هر جعبه‌ی دیگری جدا می‌کند.
       */}
      <path
        d="M60 34c14 0 19 8 19 18 0 10-7 14-7 20 0 7 10 10 12 21 2 12-10 19-24 19s-26-7-24-19c2-11 12-14 12-21 0-6-7-10-7-20 0-10 5-18 19-18z"
      />
      {/** دسته و حلزونی */}
      <path d="M56 34V18h8v16" strokeWidth={1.2} />
      <path d="M56 18c0-6 2-9 6-9s6 3 6 7c0 3-2 5-5 5" strokeWidth={1} />
      {/** دو سوراخِ اف */}
      <path d="M48 70c-3 5-3 13 1 17M72 70c3 5 3 13-1 17" strokeWidth={0.9} />
      {[-3, -1, 1, 3].map((offset) => (
        <line
          key={offset}
          x1={60 + offset}
          x2={60 + offset}
          y1={20}
          y2={98}
          strokeWidth={0.5}
        />
      ))}
      {/** خرک، بین دو سوراخ اف */}
      <line x1={50} x2={70} y1={84} y2={84} strokeWidth={1.2} />
      <line x1={54} x2={66} y1={98} y2={98} strokeWidth={1} />
    </g>
  ),

  tar: (
    <g>
      {/**
       * کاسه‌ی دوقلو — کاسه‌ی کوچک بالا، بزرگ پایین.
       *
       * دو بیضیِ جدا کشیده می‌شوند نه یک مسیرِ یکپارچه: خطِ محلِ
       * اتصال روی خودِ ساز هم دیده می‌شود، و همان است که تار را از
       * گیتار جدا می‌کند.
       */}
      <ellipse cx={60} cy={70} rx={16} ry={13} />
      <ellipse cx={60} cy={96} rx={21} ry={18} />
      {/** پوستِ کاسه‌ی بزرگ */}
      <ellipse cx={60} cy={96} rx={15} ry={12} strokeWidth={0.6} />

      {/** دسته و پرده‌بندی */}
      <path d="M56 20h8v38h-8z" />
      <path d="M51 8h18v12H51z" strokeWidth={0.9} />
      {[24, 29, 34, 39, 44, 49].map((y) => (
        <line key={y} x1={56} x2={64} y1={y} y2={y} strokeWidth={0.6} />
      ))}

      {/** سه جفت سیم، تا خرک روی پوست */}
      {[-2.5, 0, 2.5].map((offset) => (
        <line
          key={offset}
          x1={60 + offset}
          x2={60 + offset}
          y1={22}
          y2={100}
          strokeWidth={0.6}
        />
      ))}
      <line x1={51} x2={69} y1={100} y2={100} strokeWidth={1.2} />
    </g>
  ),

  santoor: <Santoor />,

  tonbak: (
    <g>
      {/** جام: دهانه‌ی پهن، کمرِ باریک، پایه‌ی گشاد */}
      <path d="M34 34h52c0 14-6 22-9 32-2 8-2 16 0 24 3 10 9 16 9 26H34c0-10 6-16 9-26 2-8 2-16 0-24-3-10-9-18-9-32z" />
      <ellipse cx={60} cy={34} rx={26} ry={8} />
      <ellipse cx={60} cy={34} rx={19} ry={5.5} strokeWidth={0.7} />
      <ellipse cx={60} cy={116} rx={26} ry={6} strokeWidth={0.9} />
    </g>
  ),

  piano: (
    <g>
      {/**
       * یک اکتاو از روبه‌رو.
       *
       * کلیدهای سیاه با `fillOpacity` پر می‌شوند نه با رنگِ پر: روی
       * زمینه‌ی تیره، پُرِ کاملْ روشن‌ترین چیز صفحه می‌شود و تصویر
       * نگاتیو خوانده می‌شود — دقیقاً برعکسِ چیزی که هست.
       */}
      <rect x={16} y={30} width={88} height={62} rx={2} />
      {[27, 38, 49, 60, 71, 82, 93].map((x) => (
        <line key={x} x1={x} x2={x} y1={30} y2={92} strokeWidth={0.8} />
      ))}
      {[27, 38, 60, 71, 82].map((x) => (
        <rect
          key={x}
          x={x - 4}
          y={30}
          width={8}
          height={36}
          fill="currentColor"
          fillOpacity={0.4}
          strokeWidth={0.8}
        />
      ))}
    </g>
  ),
};
