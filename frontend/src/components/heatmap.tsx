import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type HeatmapDay = { date: string; count: number };

type Cell = {
  dateStr: string;
  date: Date;
  inMonth: boolean;
  isFuture: boolean;
  count: number;
};

const toLocalISOString = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

function buildMonthSection(year: number, month: number, today: Date, byDate: Map<string, number>) {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  const dow = firstOfMonth.getDay();
  const weekStart = new Date(year, month, 1 - dow);

  const lastDow = lastOfMonth.getDay();
  const weekEnd = new Date(year, month, lastOfMonth.getDate() + (6 - lastDow));

  const cells: Cell[] = [];
  const cur = new Date(weekStart);
  while (cur <= weekEnd) {
    const dateStr = toLocalISOString(cur);
    const inMonth = cur.getMonth() === month && cur.getFullYear() === year;
    const isFuture = cur > today;
    cells.push({
      dateStr,
      date: new Date(cur),
      inMonth,
      isFuture,
      count: inMonth && !isFuture ? (byDate.get(dateStr) ?? 0) : 0,
    });
    cur.setDate(cur.getDate() + 1);
  }

  return {
    key: `${year}-${month}`,
    label: firstOfMonth.toLocaleDateString("en-US", { month: "short" }),
    cells,
    numCols: cells.length / 7,
  };
}

const level = (count: number) => {
  if (count === 0) return "bg-muted/40 hover:bg-muted/60";
  if (count < 2) return "bg-primary/25 hover:bg-primary/45";
  if (count < 4) return "bg-primary/50 hover:bg-primary/70";
  if (count < 6) return "bg-primary/75 hover:bg-primary/90";
  return "bg-primary hover:brightness-110";
};

export function Heatmap({ days }: { days?: HeatmapDay[] }) {
  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const byDate = React.useMemo(() => new Map(
    (days ?? []).map((day) => {
      const d = new Date(day.date);
      const dateStr = isNaN(d.getTime()) ? day.date.slice(0, 10) : toLocalISOString(d);
      return [dateStr, day.count];
    })
  ), [days]);

  const rangeStart = React.useMemo(() => {
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() - 52 * 7);
    return d;
  }, [today]);

  const monthSections = React.useMemo(() => {
    const sections = [];
    const cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    const endMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    while (cur <= endMonth) {
      sections.push(buildMonthSection(cur.getFullYear(), cur.getMonth(), today, byDate));
      cur.setMonth(cur.getMonth() + 1);
    }
    return sections;
  }, [rangeStart, today, byDate]);

  // ── Auto-scale to fit the card width ──────────────────────────────────────
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  const [clampedHeight, setClampedHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    const wrapper = wrapperRef.current;
    const inner = innerRef.current;
    if (!wrapper || !inner) return;

    const measure = () => {
      const availW = wrapper.clientWidth;
      const naturalW = inner.scrollWidth;
      const naturalH = inner.scrollHeight;
      if (naturalW > 0 && availW > 0) {
        const r = Math.min(1, availW / naturalW);
        setScale(r);
        // When scaled down, the layout height stays at naturalH but the
        // visual height shrinks — clamp the wrapper so there's no dead space.
        setClampedHeight(r < 1 ? Math.ceil(naturalH * r) : null);
      }
    };

    const ro = new ResizeObserver(measure);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [monthSections]);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-3 rounded-xl border border-border/60 bg-card/40 p-4">
        {/* wrapper measures available width and clips dead space after scaling */}
        <div
          ref={wrapperRef}
          className="overflow-hidden"
          style={clampedHeight != null ? { height: clampedHeight } : undefined}
        >
          <div
            ref={innerRef}
            className="w-fit"
            style={scale < 1 ? { transform: `scale(${scale})`, transformOrigin: "top left" } : undefined}
          >
            <div className="flex gap-2 px-1 py-1">

              {/* Month groups */}
              <div className="flex gap-3">
                {monthSections.map((section) => (
                  <div key={section.key}>
                    <div className="mb-1.5 select-none text-[10px] font-medium text-muted-foreground">
                      {section.label}
                    </div>
                    <div
                      className="grid grid-flow-col grid-rows-7 gap-0.75"
                      style={{ gridTemplateColumns: `repeat(${section.numCols}, 11px)` }}
                    >
                      {section.cells.map((cell) => {
                        if (!cell.inMonth) {
                          return <div key={cell.dateStr} className="h-2.75 w-2.75" />;
                        }
                        if (cell.isFuture) {
                          return (
                            <div
                              key={cell.dateStr}
                              className="h-2.75 w-2.75 rounded-[2px] bg-muted/10 pointer-events-none"
                            />
                          );
                        }
                        return (
                          <Tooltip key={cell.dateStr}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "h-2.75 w-2.75 rounded-[2px] cursor-pointer transition-all duration-150",
                                  "hover:z-10 hover:scale-125 hover:ring-2 hover:ring-primary/60",
                                  level(cell.count),
                                )}
                              />
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="bg-card! text-card-foreground! border! border-border/80! px-2.5 py-1.5 text-xs shadow-elegant rounded-md"
                            >
                              <div className="font-semibold">
                                <span>{cell.count === 0 ? "No" : cell.count}</span>{" "}
                                {cell.count === 1 ? "submission" : "submissions"}
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                {formatDate(cell.date)}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="h-2.75 w-2.75 rounded-[2px] bg-muted/40" />
          <div className="h-2.75 w-2.75 rounded-[2px] bg-primary/25" />
          <div className="h-2.75 w-2.75 rounded-[2px] bg-primary/50" />
          <div className="h-2.75 w-2.75 rounded-[2px] bg-primary/75" />
          <div className="h-2.75 w-2.75 rounded-[2px] bg-primary" />
          <span>More</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
