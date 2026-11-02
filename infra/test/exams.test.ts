import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { EXAM_INDEX_PATH, loadKnownExamIds } from "../lib/exams";

const write = (content: string) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "epl-exams-")), "index.json");
  writeFileSync(file, content);
  return file;
};

describe("loadKnownExamIds", () => {
  it("reads the ids from the site's exam index", () => {
    const ids = loadKnownExamIds(EXAM_INDEX_PATH);
    expect(ids).toContain("AWS-SAA-C03");
    expect(ids).toContain("PSM-I");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns every id in file order", () => {
    expect(loadKnownExamIds(write(JSON.stringify([{ id: "B", name: "b" }, { id: "A", name: "a" }])))).toEqual(["B", "A"]);
  });

  it.each([
    ["an empty index", "[]"],
    ["an index that is not an array", "{}"],
    ["an entry without an id", '[{"name":"x"}]'],
    ["an id with a comma", '[{"id":"a,b"}]'],
    ["a duplicate id", '[{"id":"A"},{"id":"A"}]'],
  ])("refuses %s", (_label, content) => {
    expect(() => loadKnownExamIds(write(content))).toThrow(/index\.json/);
  });
});
