import type { Status, Task } from "../types";
import {
  addDays,
  dayOfMonth,
  diffDays,
  monthEnd,
  monthLabel,
  monthShort,
  monthStart,
  weekEnd,
  weekStart,
} from "./dates";
import { effectiveStatus, isOverdue, taskProgress } from "./progress";

export type Zoom = "day" | "week" | "month";

export const PX_PER_DAY: Record<Zoom, number> = { day: 32, week: 12, month: 4 };

export interface GanttItem {
  id: string;
  kind: "task" | "subtask";
  title: string;
  start: string;
  end: string;
  progress: number;
  status: Status;
  overdue: boolean;
  done: boolean;
  parentId: string | null;
  /** Subtarefa sem datas próprias: desenhada com o período da tarefa. */
  inherited: boolean;
}

export interface Range {
  start: string;
  end: string;
  days: number;
}

export interface Cell {
  label: string;
  left: number;
  width: number;
}

export function buildGanttItems(
  tasks: Task[],
  showSubtasks: boolean,
  today: string,
  hideDoneSubtasks = false,
): { items: GanttItem[]; undated: Task[] } {
  const items: GanttItem[] = [];
  const undated: Task[] = [];
  for (const task of tasks) {
    const start = task.start_date ?? task.end_date;
    const end = task.end_date ?? task.start_date;
    if (!start || !end) {
      undated.push(task);
      continue;
    }
    const status = effectiveStatus(task);
    items.push({
      id: task.id,
      kind: "task",
      title: task.title,
      start,
      end,
      progress: taskProgress(task),
      status,
      overdue: isOverdue(task, today),
      done: status === "done",
      parentId: null,
      inherited: false,
    });
    if (!showSubtasks) {
      continue;
    }
    for (const subtask of task.subtasks) {
      if (hideDoneSubtasks && subtask.done) {
        continue;
      }
      const subStart = subtask.start_date ?? subtask.end_date ?? start;
      const subEnd = subtask.end_date ?? subtask.start_date ?? end;
      items.push({
        id: subtask.id,
        kind: "subtask",
        title: subtask.title,
        start: subStart,
        end: subEnd,
        progress: subtask.done ? 100 : 0,
        status: subtask.done ? "done" : status === "blocked" ? "blocked" : "doing",
        overdue: !subtask.done && subtask.end_date !== null && subEnd < today,
        done: subtask.done,
        parentId: task.id,
        inherited: subtask.start_date === null && subtask.end_date === null,
      });
    }
  }
  return { items, undated };
}

export function computeRange(
  items: { start: string; end: string }[],
  today: string,
  zoom: Zoom,
  pad = 3,
): Range {
  let start = today;
  let end = today;
  if (items.length === 0) {
    start = addDays(today, -7);
    end = addDays(today, 21);
  }
  for (const item of items) {
    if (item.start < start) {
      start = item.start;
    }
    if (item.end > end) {
      end = item.end;
    }
  }
  start = addDays(start, -pad);
  end = addDays(end, pad);
  if (zoom === "week") {
    start = weekStart(start);
    end = weekEnd(end);
  } else if (zoom === "month") {
    start = monthStart(start);
    end = monthEnd(end);
  }
  return { start, end, days: diffDays(start, end) + 1 };
}

export function barGeometry(
  range: Range,
  item: { start: string; end: string },
  pxPerDay: number,
): { left: number; width: number } {
  return {
    left: diffDays(range.start, item.start) * pxPerDay,
    width: (diffDays(item.start, item.end) + 1) * pxPerDay,
  };
}

function segments(
  range: Range,
  pxPerDay: number,
  keyOf: (iso: string) => string,
  labelOf: (firstIso: string) => string,
): Cell[] {
  const cells: Cell[] = [];
  let currentKey = "";
  let current: Cell | null = null;
  for (let offset = 0; offset < range.days; offset++) {
    const iso = addDays(range.start, offset);
    const key = keyOf(iso);
    if (current && key === currentKey) {
      current.width += pxPerDay;
      continue;
    }
    current = { label: labelOf(iso), left: offset * pxPerDay, width: pxPerDay };
    currentKey = key;
    cells.push(current);
  }
  return cells;
}

export function buildScale(
  range: Range,
  zoom: Zoom,
  pxPerDay: number,
): { top: Cell[]; bottom: Cell[] } {
  if (zoom === "month") {
    return {
      top: segments(
        range,
        pxPerDay,
        (iso) => iso.slice(0, 4),
        (iso) => iso.slice(0, 4),
      ),
      bottom: segments(range, pxPerDay, (iso) => iso.slice(0, 7), monthShort),
    };
  }
  const top = segments(range, pxPerDay, (iso) => iso.slice(0, 7), monthLabel);
  const bottom =
    zoom === "week"
      ? segments(range, pxPerDay, weekStart, (iso) => String(dayOfMonth(iso)))
      : segments(
          range,
          pxPerDay,
          (iso) => iso,
          (iso) => String(dayOfMonth(iso)),
        );
  return { top, bottom };
}
