import { redirect } from "next/navigation";

/** Alias — public registration is disabled. */
export default function RegisterDisabledPage() {
  redirect("/login");
}
