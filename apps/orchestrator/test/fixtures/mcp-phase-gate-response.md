# MCP phase-gate response fixture

`mcp-phase-gate-response.json` represents the structured part of a successful
`continue-implementation` recipe response. Its schema is an independent snapshot
of DevCycleManager's `Prompts/phase-gates-exchange-v1.schema.json`; its instructions
retain the shared phase quality policy's gate-protocol section. Unrelated recipe
steps and the duplicate MCP text representation are omitted for this focused test.
Source: `aboimpinto/DevelopmentProcess`, phase quality policy v2, 2026-09-24.

Do not regenerate the fixture from HEPHA's encoder: it checks interoperability
between the provider contract and the host decoder. The lifecycle test executes
the launch invocation against this recipe fixture, publishes a record using its
wire fields, and exercises actual disk, scanner, gate admission and SQLite status.
Wrong versions and missing flags must remain blocked. No model or live MCP server
is called; this proves contract compatibility, not live model compliance.
