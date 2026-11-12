import { describe, expect, it } from "vitest";
import { DATASET_FACTS, DATASET_TABLES } from "@/lib/schema/facts";
import { SCHEMA_DESCRIPTION } from "@/lib/schema/descriptions";

// The About section on the landing page shows these numbers to visitors. SCHEMA_DESCRIPTION is the
// text whose facts were verified against the database, so the page must agree with it.
describe("About section facts match the verified schema description", () => {
  it.each(Object.entries(DATASET_FACTS))("%s: %s appears in the schema description", (_name, value) => {
    expect(SCHEMA_DESCRIPTION).toContain(value);
  });

  it("every table shown to visitors is a real table in the schema description", () => {
    for (const table of DATASET_TABLES) {
      expect(SCHEMA_DESCRIPTION, table).toMatch(new RegExp(`^${table} \\(`, "m"));
    }
  });

  it("lists every table the schema description defines", () => {
    const defined = [...SCHEMA_DESCRIPTION.matchAll(/^([a-z_]+) \(/gm)].map((m) => m[1]);
    expect([...DATASET_TABLES].sort()).toEqual(defined.sort());
  });
});
