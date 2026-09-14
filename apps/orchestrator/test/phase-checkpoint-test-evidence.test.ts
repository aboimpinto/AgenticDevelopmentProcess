import { describe, expect, it } from "vitest";
import { readCheckpointTestEvidence } from "../src/memorybank/phase-checkpoint-test-evidence.js";

function read(rows: string[]) {
  return readCheckpointTestEvidence([
    "## Phase Checkpoint: Cache delivery", "| Gate | Command | Result |", "| --- | --- | --- |", ...rows,
  ].join("\n"));
}

describe("checkpoint execution evidence independently of suite naming", () => {
  const countedUnits = ["test", "tests", "test cases", "fixtures", "checks", "cases", "scenarios", "specs"];
  it.each(countedUnits)("imports counted %s outcomes without changing their meaning", unit => {
    for (const verdict of ["passed", "OK"]) {
      expect(read([`| Validation | runner verify | PASS — 7 ${unit} ${verdict} |`])?.status).toBe("satisfied");
      expect(read([
        "| Core suite | runner test | PASS — 19 passed, 0 failed |",
        `| Boundary fixtures/live | runner verify | PASS — 7 ${unit} ${verdict}; no forbidden dependency |`,
      ])?.status).toBe("satisfied");
    }
  });
  it.each(countedUnits)("preserves unresolved %s counts beside a passing suite", unit => {
    for (const result of [
      `PASS — 0 ${unit} OK`, `PASS — 3/7 ${unit} passed`,
      `PASS — 7 ${unit} listed`, `PASS — 7 ${unit} skipped`,
      `PASS — 7 ${unit} OK; 2 ${unit} failed`,
      `PASS — 7 ${unit} OK; failed ${unit}: 2`,
      `PASS — 7 ${unit} OK; required coverage missing`,
    ]) {
      expect(read([
        "| Core suite | runner test | PASS — 19 passed, 0 failed |",
        `| Boundary fixtures | runner test | ${result} |`,
      ])?.status).not.toBe("satisfied");
    }
    expect(read([`| Boundary fixtures | runner test --collect-only | PASS — 7 ${unit} OK |`])?.status).toBe("unknown");
  });
  it.each(["Contract", "Cache regressions", "Full unit suite", "Boundary fixtures", "Validation"])("recognises executed counts under %s", label => {
    expect(read([`| ${label} | runner verify | PASS — 24/24 passed |`])?.status).toBe("satisfied");
  });
  it("preserves command spelling and recognises script execution independently of labels", () => {
    const command = "ENV_MODE=check python3 scripts/test_cache_rules.py";
    expect(read([`| Validation | \`${command}\` | FAIL — assertion mismatch |`])).toMatchObject({
      status: "missing", justification: expect.stringContaining(command),
    });
  });
  it("combines focused execution, aggregate ignored counts and an empty supporting target", () => {
    const gate = read([
      "| Cache regressions | cargo test cache | PASS — 9/9 passed |",
      "| Full unit suite | cargo test --lib | PASS — 240 passed, 0 failed, 4 ignored |",
      "| Binary units | cargo test --bins | PASS — exit 0 (no bin tests) |",
    ]);
    expect(gate?.status).toBe("satisfied");
    expect(gate?.justification).toContain("4 ignored");
    expect(gate?.justification).toContain("no bin tests");
  });
  it.each([
    ["FAIL — 8 passed, 1 failed", "runner verify", "missing"],
    ["PASS — 8 passed, 1 failed", "runner verify", "missing"],
    ["PASS — fast 8, failures 1, all 0 failed", "runner verify", "missing"],
    ["PASS — fast 8, warnings: 2, all 0 failed", "runner verify", "missing"],
    ["PASS — 8 passed, exit code 1", "runner verify", "missing"],
    ["Not executed — fixture missing", "cargo test", "missing"],
    ["PASS — 8 passed; required coverage missing", "runner verify", "missing"],
    ["PASS — 8/9 passed", "runner verify", "unknown"],
    ["PASS — 0/9 passed", "runner verify", "unknown"],
    ["PASS — 8/8 passed", "runner --collect-only", "unknown"],
    ["PASS — 8/8 passed", "cargo test --no-run", "unknown"],
    ["PASS — 8 tests listed", "runner --list", "unknown"],
    ["PASS — 0 tests", "cargo test", "unknown"],
    ["PASS — exit 0 (no bin tests)", "cargo test --no-run", "unknown"],
    ["PASS — 8 passed; required tests ignored", "runner verify", "missing"],
  ])("does not hide an unresolved named suite: %s", (result, command, status) => {
    expect(read(["| Cache regressions | runner verify | PASS — 9/9 passed |", `| Boundary suite | ${command} | ${result} |`])?.status).toBe(status);
  });
  it("does not use an empty target as positive verification", () => {
    expect(read(["| Binary units | cargo test --bins | PASS — exit 0 (no bin tests) |"])?.status).toBe("unknown");
  });
  it.each(["no tests", "no target tests", "0 tests", "zero tests"])("normalizes empty supporting execution: %s", empty => {
    const rows = [`| Empty target | runner test | PASS — exit 0, ${empty} |`];
    expect(read(rows)?.status).toBe("unknown");
    expect(read(["| Behavior | runner test | PASS — 23 passed |", ...rows])?.status).toBe("satisfied");
  });
  it.each(["fast 23, contracts 7, flows 4, all 0 failed", "partition-a 11; partition-b 9; 0 failures"])("imports named partition counts: %s", counts => {
    expect(read([`| Test suite | runner test | PASS — ${counts} |`])?.status).toBe("satisfied");
  });
  it.each([
    "PASS — skipped 23, ignored 7, 0 failed",
    "PASS — duration 23, retries 7, 0 failed",
    "PASS — fast 23, contracts 7",
    "PASS — exit 0, 0 tests; required tests missing",
  ])("does not invent execution or coverage from %s", result => {
    expect(read([`| Tests | runner test | ${result} |`])?.status).not.toBe("satisfied");
  });
  it("accepts counted checkpoint shorthand while command-only success supplies no passing count", () => {
    expect(read([
      "| Contract | cargo test --lib | PASS — 32/32, exit 0, 0 warnings |",
      "| Adapter unit suite | cargo test --bins | PASS — exit 0, 0 warnings |",
      "| Rules | python3 scripts/test_rules.py | PASS — 6 OK, exit 0 |",
    ])?.status).toBe("satisfied");
    expect(read(["| Adapter unit suite | cargo test --bins | PASS — exit 0, 0 warnings |"])?.status).toBe("unknown");
  });
  it("does not infer passing tests from formatting or browser checks", () => {
    expect(read(["| Format | cargo fmt --check | PASS |", "| Browser E2E | playwright test | PASS — 4/4 passed |"])).toBeUndefined();
  });
});
