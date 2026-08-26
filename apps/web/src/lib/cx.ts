/**
 * چسباندن کلاس‌های شرطی.
 *
 * جای `clsx` را می‌گیرد و وابستگی تازه‌ای اضافه نمی‌کند: تنها چیزی که
 * در این پروژه از آن کتابخانه لازم می‌شود همین چند خط است — رشته‌ها را
 * با فاصله بچسبان و `false`، `null` و `undefined` را بینداز.
 */
export function cx(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}
