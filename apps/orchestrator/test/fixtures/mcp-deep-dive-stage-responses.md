# Hosted Deep-Dive provider fixtures

`mcp-deep-dive-stage-responses.json` contains the four structured responses from
DevCycle's `deep_dive_host.hosted_deep_dive_recipe` for a synthetic target.
Source contract: `devcycle-deep-dive-host/v1`, DevelopmentProcess issue #3.

The fixture is generated from the provider implementation, not HEPHA's prompt
builders. HTTP-client tests wrap it with the request's JSON-RPC ID. Production
fetches these procedures from MCP and consumes only `structuredContent`.
These fixtures prove client interoperability, not model reasoning or live
workflow completion. Update them deliberately when the provider contract changes.
