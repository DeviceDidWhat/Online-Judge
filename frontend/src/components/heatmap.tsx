import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type HeatmapDay = {
  date: string;
  count: number;
};

const toLocalISOString = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const buildAlignedYear = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  const dayOfWeek = today.getDay(); // 0 (Sun) to 6 (Sat)
  start.setDate(today.getDate() - dayOfWeek - 52 * 7);

  return Array.from({ length: 371 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateStr = toLocalISOString(date);
    return {
      date,
      dateStr,
      isFuture: date > today,
    };
  });
};

const formatDate = (date: Date) => {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export function Heatmap({ days }: { days?: HeatmapDay[] }) {
  const byDate = new Map(
    (days ?? []).map((day) => {
      const d = new Date(day.date);
      const dateStr = isNaN(d.getTime()) ? day.date.slice(0, 10) : toLocalISOString(d);
      return [dateStr, day.count];
    })
  );

  const normalized = buildAlignedYear().map((day) => ({
    ...day,
    count: byDate.get(day.dateStr) ?? 0,
  }));

  const months: { label: string; key: string; colIndex: number }[] = [];
  for (let col = 0; col < 53; col++) {
    const sundayIndex = col * 7;
    const sundayDate = normalized[sundayIndex].date;
    const label = sundayDate.toLocaleDateString("en-US", { month: "short" });
    const key = `${sundayDate.getFullYear()}-${sundayDate.getMonth()}`;

    if (col === 0) {
      months.push({ label, key, colIndex: col });
    } else {
      const prevSundayDate = normalized[(col - 1) * 7].date;
      if (sundayDate.getMonth() !== prevSundayDate.getMonth()) {
        const prev = months[months.length - 1];
        if (!prev || col - prev.colIndex >= 3) {
          months.push({ label, key, colIndex: col });
        }
      }
    }
  }

  const level = (count: number) => {
    if (count === 0) return "bg-muted/40 hover:bg-muted/60";
    if (count < 2) return "bg-primary/25 hover:bg-primary/45";
    if (count < 4) return "bg-primary/50 hover:bg-primary/70";
    if (count < 6) return "bg-primary/75 hover:bg-primary/90";
    return "bg-primary hover:brightness-110";
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-3 rounded-xl border border-border/60 bg-card/40 p-4">
        <div className="overflow-x-auto scrollbar-thin">
          <div className="mx-auto w-fit min-w-[770px] py-2 px-1">
            <div className="flex flex-col">
              {/* Months row */}
              <div className="flex gap-2">
                {/* Spacer for day labels column */}
                <div className="w-8 shrink-0" />

                {/* Month labels grid */}
                <div
                  className="grid gap-[3px]"
                  style={{ gridTemplateColumns: `repeat(53, 11px)` }}
                >
                  {months.map((month) => (
                    <div
                      key={month.key}
                      className="text-[10px] font-medium text-muted-foreground select-none text-left"
                      style={{ gridColumnStart: month.colIndex + 1 }}
                    >
                      {month.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Days row */}
              <div className="flex gap-2 mt-1.5">
                {/* Day labels */}
                <div className="grid grid-rows-7 gap-[3px] text-[10px] text-muted-foreground font-medium select-none w-8 shrink-0">
                  <div className="h-[11px] flex items-center"></div>
                  <div className="h-[11px] flex items-center">Mon</div>
                  <div className="h-[11px] flex items-center"></div>
                  <div className="h-[11px] flex items-center">Wed</div>
                  <div className="h-[11px] flex items-center"></div>
                  <div className="h-[11px] flex items-center">Fri</div>
                  <div className="h-[11px] flex items-center"></div>
                </div>

                {/* Days grid */}
                <div
                  className="grid grid-flow-col grid-rows-7 gap-[3px]"
                  style={{ gridTemplateColumns: `repeat(53, 11px)` }}
                >
                  {normalized.map((day) => {
                    if (day.isFuture) {
                      return (
                        <div
                          key={day.dateStr}
                          className="h-[11px] w-[11px] rounded-[2px] bg-muted/10 pointer-events-none"
                        />
                      );
                    }

                    return (
                      <Tooltip key={day.dateStr}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "h-[11px] w-[11px] rounded-[2px] transition-all duration-150 relative hover:z-10 cursor-pointer",
                              level(day.count),
                              "hover:scale-125 hover:ring-2 hover:ring-primary/60"
                            )}
                          />
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="!bg-card !text-card-foreground !border !border-border/80 px-2.5 py-1.5 text-xs shadow-elegant rounded-md"
                        >
                          <div className="font-semibold">
                            <span>{day.count === 0 ? "No" : day.count}</span>{" "}
                            {day.count === 1 ? "submission" : "submissions"}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {formatDate(day.date)}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="h-[11px] w-[11px] rounded-[2px] bg-muted/40" />
          <div className="h-[11px] w-[11px] rounded-[2px] bg-primary/25" />
          <div className="h-[11px] w-[11px] rounded-[2px] bg-primary/50" />
          <div className="h-[11px] w-[11px] rounded-[2px] bg-primary/75" />
          <div className="h-[11px] w-[11px] rounded-[2px] bg-primary" />
          <span>More</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
