import { redirect } from "next/navigation";

/** Old address; the list moved to Library and the numbers to Results. */
export default function HistoryPage() {
  redirect("/results");
}
