/** The same handoff cases exercise the parser and real Refresh execution. */
export const acceptedPlanResponses = [
  { name: "plain JSON", wrap: (json: string) => json },
  { name: "fenced JSON", wrap: (json: string) => `\`\`\`json\n${json}\n\`\`\`` },
  { name: "explanation and fenced JSON", wrap: (json: string) => `Configuration inspected.\n\`\`\`json\n${json}\n\`\`\`\nReady for validation.` },
  { name: "explanation and JSON", wrap: (json: string) => `Returning the corrected plan:\n${json}` },
  { name: "explanation with inline code", wrap: (json: string) => 'Inspected `src/**/*.test.{ts,tsx}` and `gates[]`; the ` ```json ` fence is presentation.\n```json\n' + json + '\n```' },
];
export const rejectedPlanResponses = [
  { name: "ambiguous plans", wrap: (json: string) => `${json}\nAlternative:\n${json}` },
  { name: "truncated plan", wrap: (json: string) => json.slice(0, -1) },
  { name: "malformed envelope", wrap: (json: string) => `{"broken": invalid, "nested": ${json}}` },
  { name: "extra closing brace", wrap: (json: string) => `${json}}` },
  { name: "truncated containing array", wrap: (json: string) => `[${json}` },
  { name: "inline competing plan", wrap: (json: string) => `Alternative: \`${json}\`\n${json}` },
];
