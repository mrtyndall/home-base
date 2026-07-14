# Hermes ↔ Home Base integration

Home Base exposes Hermes capabilities through the typed MCP service. MCP forwards the caller's bearer credential to the audited `/api/v1` REST boundary; it does not access Prisma or application helpers directly.

## Contract posture

- Required scopes are `read`, `write`, and `capture` for the complete registry.
- Credentials must be supplied through an approved environment reference. Never put a token in this repository, a command, a log, or an MCP configuration example.
- The integration is non-destructive. There are no active Domain tools and no tool name containing `delete`.
- Writes are validated, rate-limited, and audited by REST. MCP tools remain thin proxies.
- Capability and audit mapping lives in [home-base-capability-matrix.md](./home-base-capability-matrix.md).

## Verification boundary

The executable registry contract is:

```bash
npx tsx --test mcp/http-server.contract.test.ts
```

That check proves registry uniqueness, required capability groups, REST forwarding, bearer preservation, non-destructive naming, and structured error behavior in code. It does **not** prove that the current host, Tailnet route, LaunchAgent, Railway deployment, API key, or production database is healthy.

Current-host discovery, secret-free client configuration, and live read/write smoke procedures are intentionally completed in Hermes Task 2 using live host evidence. Do not copy host assumptions from older documentation.
