import { heatmap } from "@/lib/mock-data";

export function Heatmap() {
  // 7 rows (weekdays), ~53 cols
  const cols: typeof heatmap[] = [];
  for (let i = 0; i < heatmap.length; i += 7) cols.push(heatmap.slice(i, i + 7));
  const level = (c: number) =>
    c === 0 ? "bg-muted/40" :
    c < 2 ? "bg-primary/25" :
    c < 4 ? "bg-primary/50" :
    c < 6 ? "bg-primary/75" : "bg-primary";
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div className="flex gap-[3px]">
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.count} submissions`}
                className={`h-3 w-3 rounded-[3px] transition hover:ring-2 hover:ring-primary/60 ${level(d.count)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
        Less
        <div className="h-3 w-3 rounded-[3px] bg-muted/40" />
        <div className="h-3 w-3 rounded-[3px] bg-primary/25" />
        <div className="h-3 w-3 rounded-[3px] bg-primary/50" />
        <div className="h-3 w-3 rounded-[3px] bg-primary/75" />
        <div className="h-3 w-3 rounded-[3px] bg-primary" />
        More
      </div>
    </div>
  );
}
