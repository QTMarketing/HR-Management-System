import { redirect } from "next/navigation";

/** Public sign-up is disabled — accounts are created by admins only. */
export default function SignUpDisabledPage() {
  redirect("/login");
}
