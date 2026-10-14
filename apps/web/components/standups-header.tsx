import { ViewTabs } from "@/components/view-tabs";

type Tab = "day" | "range" | "library";

/** Title and Day / Date range / Library tabs shared by the stand-up pages. Tabs keep the current dates. */
export function StandupsHeader({ active, subtitle, date, start, end, children }: { active: Tab; subtitle: React.ReactNode; date?: string; start?: string; end?: string; children?: React.ReactNode }) {
  const tabs = [
    { label: "Day", href: `/standups?view=day${date ? `&date=${date}` : ""}`, active: active === "day" },
    { label: "Date range", href: `/standups?view=range${start && end ? `&start=${start}&end=${end}` : ""}`, active: active === "range" },
    { label: "Library", href: "/standups/library", active: active === "library" },
  ];
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Stand-ups</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ViewTabs tabs={tabs} />
        {children}
      </div>
    </div>
  );
}
