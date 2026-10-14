import { redirect } from "next/navigation";

/** Old Library page: now a tab of Stand-ups. Keeps the filters. */
export default async function LibraryRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
  redirect(`/standups/library${q.size ? `?${q}` : ""}`);
}
