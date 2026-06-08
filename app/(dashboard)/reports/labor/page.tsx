import { redirect } from "next/navigation";

/** Legacy route — labor summary now lives on Employee records. */
export default function LaborReportRedirectPage() {
  redirect("/reports/employee-records#weekly-labor");
}
