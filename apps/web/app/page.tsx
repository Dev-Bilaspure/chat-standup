import { redirect } from "next/navigation";

/** Old Daily page: stand-ups now live at /standups. */
export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  redirect(date ? `/standups?view=day&date=${encodeURIComponent(date)}` : "/standups");
}
