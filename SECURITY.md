# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability, leaked secret,
or report containing private project data.

Use GitHub private vulnerability reporting for
`aboimpinto/AgenticDevelopmentProcess` once it is enabled. Until that channel
is available, contact the maintainer through the
[`aboimpinto` GitHub profile](https://github.com/aboimpinto) without including
vulnerability details in a public message. Include the affected version or
commit, impact, reproduction steps, and any suggested mitigation only after a
private channel has been established. Remove live credentials and unrelated
private data from the report.

## Secret handling

HEPHA works with model providers, local repositories, agent sessions, and
project documents. Treat all of them as potentially sensitive.

- Configure provider credentials through the local Models interface.
- Keep local environment values in the ignored `.env` file.
- Never commit API keys, tokens, credentials, local databases, or raw session
  transcripts.
- Use synthetic values in tests and documentation.
- Redact usernames, absolute filesystem paths, repository URLs, customer data,
  and private source content before sharing screenshots or logs.
- Rotate a credential immediately if it may have entered Git history; deleting
  it from the latest commit is not sufficient.

## Trust boundaries

Project source, MemoryBank files, agent output, tool results, and model output
must be treated as untrusted input at system boundaries. A workflow or agent
must not expand its own authority because text inside a project asks it to.

Consequential operations such as pushes, pull requests, releases, deployments,
credential changes, and broad destructive actions require explicit permission
within the active workflow scope.

## Supported versions

HEPHA is currently early alpha and does not yet publish stable release lines.
Security fixes are applied to the current `master` branch. This policy will be
updated when versioned releases begin.
