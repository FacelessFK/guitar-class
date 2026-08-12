/**
 * بارگذاری IFrame API جیتسی.
 *
 * اسکریپت از **همان دامنه‌ای** بار می‌شود که API در بلیت ورود اعلام
 * کرده، نه از یک ثابت در فرانت. سرور جیتسی و نسخه‌ی `external_api.js`
 * باید با هم بخوانند؛ اگر دامنه دو جا نوشته می‌شد، عوض کردن سرور یعنی
 * یک جا یادت برود و کلاینتِ نسخه‌ی اشتباه با سرور حرف بزند.
 */

/**
 * تایپ حداقلی از چیزی که واقعاً استفاده می‌کنیم.
 *
 * بسته‌ی رسمی تایپ نصب نمی‌شود چون کتابخانه از سرور جیتسی می‌آید نه از
 * npm، و تایپِ نسخه‌ی npm می‌تواند با اسکریپتِ روی سرور جلو و عقب
 * باشد — تایپی که دروغ بگوید از نبودِ تایپ بدتر است.
 */
export interface JitsiApi {
  addListener(event: string, handler: (payload?: unknown) => void): void;
  dispose(): void;
  executeCommand(command: string, ...args: unknown[]): void;
}

export interface JitsiOptions {
  roomName: string;
  jwt: string;
  parentNode: HTMLElement;
  configOverwrite: Record<string, unknown>;
  interfaceConfigOverwrite?: Record<string, unknown>;
  width?: string | number;
  height?: string | number;
}

type JitsiConstructor = new (domain: string, options: JitsiOptions) => JitsiApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiConstructor;
  }
}

/**
 * اسکریپت به ازای هر دامنه فقط یک بار بار می‌شود.
 *
 * بدون این نقشه، رفتن به کلاس بعدی یک `<script>` دیگر اضافه می‌کرد و
 * `JitsiMeetExternalAPI` دوباره تعریف می‌شد.
 */
const loaders = new Map<string, Promise<JitsiConstructor>>();

export function loadJitsiApi(domain: string): Promise<JitsiConstructor> {
  const existing = loaders.get(domain);
  if (existing) return existing;

  const loader = new Promise<JitsiConstructor>((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve(window.JitsiMeetExternalAPI);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://${domain}/external_api.js`;
    script.async = true;

    script.addEventListener("load", () => {
      const api = window.JitsiMeetExternalAPI;
      if (api) resolve(api);
      else reject(new Error("کتابخانه‌ی جیتسی بار شد ولی در دسترس نیست."));
    });

    script.addEventListener("error", () => {
      // بارنشدن اسکریپت در ایران حالت واقعی و رایجی است، نه استثنا
      loaders.delete(domain);
      reject(new Error(`ارتباط با سرور کلاس (${domain}) برقرار نشد.`));
    });

    document.head.append(script);
  });

  loaders.set(domain, loader);
  return loader;
}
