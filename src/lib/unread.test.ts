import { describe, expect, it } from "vitest";
import type { Profile, Task } from "../types";
import {
  emptyReadState,
  markMine,
  markSeen,
  participates,
  reconcile,
  unreadCount,
  unreadTasks,
} from "./unread";

const me: Profile = { id: "u", email: "u@x", name: "U", role: "user" };
const admin: Profile = { id: "a", email: "a@x", name: "A", role: "admin" };
const viewer: Profile = { id: "v", email: "v@x", name: "V", role: "viewer" };

const task = (id: string, owner: string | null, comments: number): Task => ({
  id,
  title: id,
  description: "",
  status: "todo",
  priority: "low",
  start_date: null,
  end_date: null,
  assignee_id: owner,
  links: [],
  comment_count: comments,
  subtasks: [],
});

describe("reconcile", () => {
  it("uses the first sighting as the baseline: old comments are not new", () => {
    const read = emptyReadState();
    const tasks = [task("t1", "u", 4)];
    expect(reconcile(read, tasks)).toBe(true);
    expect(unreadCount(read, task("t1", "u", 4))).toBe(0);
    expect(reconcile(read, tasks)).toBe(false);
  });

  it("counts comments added after the baseline", () => {
    const read = emptyReadState();
    reconcile(read, [task("t1", "u", 4)]);
    expect(unreadCount(read, task("t1", "u", 7))).toBe(3);
  });

  it("does not stay ahead when comments are deleted", () => {
    const read = emptyReadState();
    markSeen(read, "t1", 5);
    reconcile(read, [task("t1", "u", 3)]);
    expect(read.seen["t1"]).toBe(3);
    expect(unreadCount(read, task("t1", "u", 4))).toBe(1);
  });
});

describe("unreadTasks", () => {
  it("lists only tasks the person participates in", () => {
    const read = emptyReadState();
    reconcile(read, [task("t1", "u", 0), task("t2", "o", 0)]);
    const tasks = [task("t1", "u", 2), task("t2", "o", 5)];
    expect(unreadTasks(me, read, tasks).map((i) => [i.task.id, i.count])).toEqual([["t1", 2]]);
  });

  it("includes tasks the person commented on, and reading clears them", () => {
    const read = emptyReadState();
    reconcile(read, [task("t2", "o", 1)]);
    markMine(read, "t2");
    const grown = [task("t2", "o", 3)];
    expect(unreadTasks(admin, read, grown)).toHaveLength(1);
    markSeen(read, "t2", 3);
    expect(unreadTasks(admin, read, grown)).toHaveLength(0);
  });

  it("never notifies viewers", () => {
    expect(participates(viewer, emptyReadState(), task("t1", "v", 0))).toBe(false);
  });
});
