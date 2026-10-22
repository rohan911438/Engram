# @engram/cli — `engram`

```bash
npx @engram/cli init my-agent
engram observe -s user "I pay 450 USDC rent on the 1st"
engram sleep && engram commit -m "first week"
engram log · diff · checkout · blame · bisect · verify · forget
engram export --audit -o audit.json && engram audit audit.json
engram ui      # inspector
engram mcp     # MCP server for Claude Code / Cursor / Claude Desktop
```

MCP config:

```json
{ "mcpServers": { "engram": { "command": "npx", "args": ["@engram/cli", "mcp", "-C", "/path/to/project"] } } }
```

Full docs: https://github.com/rohan911438/Engram
