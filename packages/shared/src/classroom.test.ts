import { describe, expect, it } from "vitest";
import { BUSINESS_RULES } from "./enums.js";
import { roomState, roomWindow } from "./classroom.js";

const MINUTE = 60_000;

/** جلسه‌ی یک‌ساعته‌ی نمونه. اعداد مطلق‌اند و به منطقه‌ی زمانی ربطی ندارند. */
const START = 1_000_000_000_000;
const session = { start: START, end: START + 60 * MINUTE };

const opensAt = START - BUSINESS_RULES.ROOM_OPEN_BEFORE_MINUTES * MINUTE;
const closesAt = session.end + BUSINESS_RULES.ROOM_OPEN_AFTER_MINUTES * MINUTE;

describe("roomWindow", () => {
  it("پنجره را از قبل از شروع تا بعد از پایان گشاد می‌کند", () => {
    expect(roomWindow(session)).toEqual({ start: opensAt, end: closesAt });
  });
});

describe("roomState", () => {
  it("پیش از باز شدن، زود است", () => {
    expect(roomState(session, opensAt - 1)).toBe("TOO_EARLY");
  });

  it("دقیقاً در لحظه‌ی باز شدن، باز است", () => {
    expect(roomState(session, opensAt)).toBe("OPEN");
  });

  it("در میانه‌ی جلسه باز است", () => {
    expect(roomState(session, START + 30 * MINUTE)).toBe("OPEN");
  });

  it("در مهلت پس از پایان هنوز باز است", () => {
    expect(roomState(session, session.end + MINUTE)).toBe("OPEN");
  });

  /** بازه نیم‌باز است: لحظه‌ی `end` دیگر داخل پنجره نیست. */
  it("دقیقاً در لحظه‌ی بسته شدن، بسته است", () => {
    expect(roomState(session, closesAt)).toBe("CLOSED");
  });

  it("پس از بسته شدن، بسته است", () => {
    expect(roomState(session, closesAt + MINUTE)).toBe("CLOSED");
  });
});
