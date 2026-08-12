"use client";

/**
 * پوسته‌ی ری‌اکت روی `session-store`.
 *
 * منطق واقعی آنجاست و اینجا فقط اشتراک و راه‌اندازی است. عمداً از
 * `useSyncExternalStore` استفاده می‌شود نه از context با `useState`:
 * `apiFetch` هم می‌تواند نشست را باطل کند (وقتی تمدید شکست بخورد) و
 * آن تابع بیرون از درخت ری‌اکت صدا زده می‌شود. با یک استور بیرونی، هر
 * دو مسیر یک منبع حقیقت دارند.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  bootstrapSession,
  endSession,
  getServerSnapshot,
  getSnapshot,
  loadUser,
  subscribe,
  type CurrentUser,
  type SessionState,
} from "./session-store";

export type { CurrentUser };

export interface Session extends SessionState {
  /** پروفایل را دوباره می‌خواند — بعد از کاری که آن را عوض کرده */
  reload: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useSession(): Session {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const reload = useCallback(() => loadUser(), []);
  const logout = useCallback(() => endSession(), []);

  return { ...state, reload, logout };
}

/**
 * راه‌اندازی نشست، یک بار برای کل اپ.
 *
 * چیزی رندر نمی‌کند. در `layout` بخش خصوصی می‌نشیند تا صفحات عمومی —
 * که ایستا ساخته می‌شوند و نباید جاوااسکریپت نشست را بار کنند — دست
 * نخورند.
 */
export function SessionBootstrap() {
  useEffect(() => {
    void bootstrapSession();
  }, []);

  return null;
}
