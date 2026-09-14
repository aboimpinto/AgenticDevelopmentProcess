/** Read exact metadata from the same installed Pi SDK and user overrides used
 * by execution. The CLI table rounds 1,050,000 to 1.1M and is not a wire format.
 * This isolated, bounded child never contacts a model or prints credentials. */
export const PI_SDK_CATALOG_SCRIPT = String.raw`
import { readFile, realpath, access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
try {
  let executable = process.argv[1];
  if (!executable) {
    for (const directory of (process.env.PATH ?? "").split(delimiter)) {
      const candidate = join(directory, process.platform === "win32" ? "pi.cmd" : "pi");
      try { await access(candidate, constants.X_OK); executable = candidate; break; } catch {}
    }
  }
  if (!executable) throw new Error("Pi executable not found");
  let directory = dirname(await realpath(resolve(executable)));
  let sdk;
  for (;;) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
      if (["@earendil-works/pi-coding-agent", "@mariozechner/pi-coding-agent"].includes(manifest.name)) {
        // The aggregate SDK entry also imports optional experimental servers.
        // Load only the installed model runtime, as Pi's own CLI does.
        sdk = join(directory, "dist", "core", "model-runtime.js"); break;
      }
    } catch {}
    const parent = dirname(directory);
    if (parent === directory) throw new Error("Installed Pi SDK not found");
    directory = parent;
  }
  const { ModelRuntime } = await import(pathToFileURL(sdk).href);
  const runtime = await ModelRuntime.create({ allowModelNetwork: false });
  const models = (await runtime.getAvailable()).map(model => {
    if (typeof model.provider !== "string" || typeof model.id !== "string" ||
        !Number.isSafeInteger(model.contextWindow) || model.contextWindow <= 0 ||
        !Number.isSafeInteger(model.maxTokens) || model.maxTokens <= 0) {
      throw new Error("Invalid SDK model limits");
    }
    return {
      providerId: model.provider, modelId: model.id,
      contextWindowTokens: model.contextWindow, maxOutputTokens: model.maxTokens,
      inputModalities: model.input?.includes("image") ? ["image", "text"] : ["text"],
      capabilities: { api: true, reasoning: model.reasoning === true, tools: true }
    };
  });
  process.stdout.write(JSON.stringify({ models }));
} catch {
  // Never leak authentication/configuration errors into catalogue diagnostics.
  process.exitCode = 1;
}
`;
