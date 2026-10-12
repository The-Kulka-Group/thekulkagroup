import { describe, expect, it } from "vitest";

import { actionItems, averagePace, lateJoiners, talkShares, weekGlance, type MeetingListItem } from "./read";
import type { MeetingAnalytics } from "./store";

const speaker = (name: string, share: number, words: number, wordsPerMinute: number) => ({
  name, seconds: null, share, words, wordsPerMinute, questions: null, fillerWords: null, longestMonologue: null, monologues: null,
});
const analytics = (speakers: MeetingAnalytics["speakers"]): MeetingAnalytics => ({
  sentiment: { positive: null, neutral: null, negative: null },
  categories: { questions: null, dates: null, metrics: null, tasks: null },
  speakers,
});

describe("actionItems", () => {
  it("reads Fireflies' owner headings and drops the timestamps", () => {
    expect(actionItems("**Example PM**\nSend the lookahead (05:12)\nCall the sub\n\n**Architect**\nAnswer the RFIs (1:27:40)")).toEqual([
      { owner: "Example PM", item: "Send the lookahead" },
      { owner: "Example PM", item: "Call the sub" },
      { owner: "Architect", item: "Answer the RFIs" },
    ]);
  });

  it("leaves the owner empty when Fireflies names none", () => {
    expect(actionItems("- Order the samples")).toEqual([{ owner: null, item: "Order the samples" }]);
    expect(actionItems(null)).toEqual([]);
  });
});

describe("lateJoiners", () => {
  it("counts only joins more than 5 minutes after the start", () => {
    const start = "2026-10-12T13:00:00.000Z";
    expect(
      lateJoiners(start, [
        { name: "On Time", joinedAt: "2026-10-12T13:04:00Z", leftAt: null },
        { name: "Late", joinedAt: "2026-10-12T13:09:00Z", leftAt: null },
        { name: "No Time", joinedAt: null, leftAt: null },
      ]),
    ).toEqual([{ name: "Late", minutes: 9 }]);
  });
});

describe("talkShares and averagePace", () => {
  it("folds everyone past the top five into one line", () => {
    const six = analytics(["A", "B", "C", "D", "E", "F"].map((n, i) => speaker(n, 30 - i * 5, 100, 150)));
    expect(talkShares(six).map((one) => one.name)).toEqual(["A", "B", "C", "D", "E", "1 Others"]);
  });

  it("weights pace by words spoken", () => {
    expect(averagePace(analytics([speaker("A", 60, 300, 160), speaker("B", 40, 100, 120)]))).toBe(150);
    expect(averagePace(analytics([]))).toBeNull();
  });
});

describe("weekGlance", () => {
  const meeting = (id: string, daysAgo: number, positive: number, negative: number, minutes: number): MeetingListItem => ({
    id, title: id, startedAt: new Date(Date.parse("2026-10-12T12:00:00Z") - daysAgo * 86_400_000).toISOString(),
    durationMinutes: minutes, meetingType: null, attendeeCount: 2, summaryReady: true, briefReady: false,
    sentiment: { positive, neutral: 100 - positive - negative, negative },
  });

  it("averages sentiment by length over the last 7 days and names the most negative meeting", () => {
    const glance = weekGlance(
      [meeting("a", 1, 40, 10, 60), meeting("b", 2, 10, 40, 30), meeting("old", 9, 0, 90, 60)],
      new Date("2026-10-12T12:00:00Z"),
    );
    expect(glance.count).toBe(2);
    expect(glance.sentiment).toEqual({ positive: 30, neutral: 50, negative: 20 });
    expect(glance.mostNegative?.id).toBe("b");
    expect(glance.hours).toBe(1.5);
  });
});
