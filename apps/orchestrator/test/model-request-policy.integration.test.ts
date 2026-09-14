import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cwd = fileURLToPath(new URL("..", import.meta.url));
function worker(content: string, thinking = "high") {
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-"], {
    cwd, encoding: "utf8", timeout: 10_000,
    input: `import guard from './src/runtime/pi/model-request-guard.ts';
      let beforeRequest; guard({on:(_, h)=>beforeRequest=h,getThinkingLevel:()=>${JSON.stringify(thinking)}});
      const payload={messages:[{role:'user',content:${JSON.stringify(content)}}]};
      beforeRequest({payload},{model:{contextWindow:200000,maxTokens:32000,reasoning:true}});
      console.log('PROVIDER_SEND');`,
  });
}

describe("generic High reasoning and context request boundary", () => {
  it.each([undefined, "512000"])("guards a multi-turn inspection with operator cap %s", cap => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-"], {
      cwd, encoding: "utf8", timeout: 10000,
      env: { ...process.env, HEPHA_PI_MAX_ATTEMPT_INPUT_TOKENS: cap ?? "" },
      input: `import guard from './src/runtime/pi/model-request-guard.ts';
        let handler; guard({on:(_,h)=>handler=h,getThinkingLevel:()=> 'high'});
        for(let i=0;i<16;i++) { handler({payload:{messages:[{role:'system',content:'token '.repeat(40000)}]}},
          {model:{contextWindow:1000000,maxTokens:32000,reasoning:true}}); console.log('DISPATCH '+i); }`,
    });
    expect(result.status).toBe(cap ? 78 : 0);
    if (cap) { expect(result.stderr).toContain("limit=512000"); expect(result.stdout).not.toContain("DISPATCH 15"); }
    else { expect(result.stdout).toContain("DISPATCH 15"); expect(result.stderr).not.toContain("BUDGET_EXCEEDED"); }
  });
  it.each([
    ["openai-codex-responses", undefined, 128000],
    ["openai-responses", "max_output_tokens", 16384],
    ["openai-completions", "max_tokens", 16384],
  ])("MR-06 respects the %s transport output contract", (api, field, reserve) => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-"], {
      cwd, encoding: "utf8", timeout: 10_000, env: { ...process.env, HEPHA_PI_OUTPUT_TOKEN_LIMIT: "16384" },
      input: `import guard from './src/runtime/pi/model-request-guard.ts';
        let handler; guard({on:(_,h)=>handler=h,getThinkingLevel:()=> 'high'});
        const payload=await handler({payload:{input:'synthetic evidence'}},
          {model:{id:'gpt-5',api:${JSON.stringify(api)},contextWindow:272000,maxTokens:128000,reasoning:true}});
        if (${JSON.stringify(api)} === 'openai-codex-responses' && 'max_output_tokens' in payload) throw new Error('Unsupported parameter: max_output_tokens');
        console.log(JSON.stringify(payload));`,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ input: "synthetic evidence", ...(field ? { [field]: 16384 } : {}) });
    expect(result.stderr).toContain(`"outputReserveTokens":${reserve}`);
  });
  it("MR-05 binds the task output cap to the payload returned to the provider adapter", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-"], {
      cwd, encoding: "utf8", timeout: 10_000, env: { ...process.env, HEPHA_PI_OUTPUT_TOKEN_LIMIT: "16384" },
      input: `import guard from './src/runtime/pi/model-request-guard.ts';
        let handler; guard({on:(_, h)=>handler=h,getThinkingLevel:()=> 'high'});
        const result=await handler({payload:{input:'hello',max_output_tokens:128000}},
          {model:{id:'gpt-5',api:'openai-responses',contextWindow:200000,maxTokens:128000,reasoning:true}});
        console.log(JSON.stringify(result));`,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).max_output_tokens).toBe(16384);
    expect(result.stderr).toContain('"outputReserveTokens":16384');
  });
  it("MR-01 rejects a downgrade before provider dispatch", () => {
    const result = worker("small request", "medium");
    expect(result.status).toBe(78);
    expect(result.stderr).toContain("HEPHA_HIGH_REASONING_REQUIRED");
    expect(result.stdout).not.toContain("PROVIDER_SEND");
  });
  it("MR-02 rejects an oversized unique input before provider dispatch", () => {
    const result = worker("word ".repeat(180_000));
    expect(result.status).toBe(78);
    expect(result.stderr).toContain("HEPHA_CONTEXT_BUDGET_EXCEEDED");
    expect(result.stdout).not.toContain("PROVIDER_SEND");
  });
  it("MR-03 compacts redundant input losslessly and permits the bounded request", () => {
    const result = worker(Array.from({length: 500}, (_, i) => `Requirement ${i}\n${"Retain evidence provenance and unresolved execution requirements. ".repeat(8)}`).join("\n"));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PROVIDER_SEND");
    expect(result.stderr).toContain('"reasoning":"high"');
    expect(result.stderr).not.toContain("Retain evidence");
  });
});
