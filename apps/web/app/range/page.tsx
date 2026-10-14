import { redirect } from "next/navigation";

/** Old Date range page: now a tab of /standups. */
export default async function RangeRedirect({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const { start, end } = await searchParams;
  const q = new URLSearchParams({ view: "range", ...(start && { start }), ...(end && { end }) });
  redirect(`/standups?${q}`);
}
