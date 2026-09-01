import type { Earnings } from "./app-api";
import { formatToman } from "./format";

export function formatLedgerToman(rial: string): string {
  return rial.startsWith("-")
    ? `−${formatToman(rial.slice(1))}`
    : formatToman(rial);
}

export function ledgerTypeLabel(type: Earnings["entries"][number]["type"]): string {
  switch (type) {
    case "EARNING":
      return "درآمد کلاس";
    case "REFUND":
      return "بازپرداخت";
    case "PAYOUT":
      return "تسویه";
    case "ADJUSTMENT":
      return "تعدیل";
  }
}
