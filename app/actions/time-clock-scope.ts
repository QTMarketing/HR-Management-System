"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const COOKIE = "hr_time_clock_id";

export async function setSelectedTimeClockId(timeClockId: string) {
  const store = await cookies();
  store.set(COOKIE, timeClockId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
