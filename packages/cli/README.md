# @rohankumar4179/engram — `engram`

```bash
npx @rohankumar4179/engram init my-agent
engram observe -s user "I pay 450 USDC rent on the 1st"
engram sleep && engram commit -m "first week"
engram log · diff · checkout · blame · bisect · verify · forget
engram export --audit -o audit.json && engram audit audit.json
engram ui      # inspector
engram mcp     # MCP server for Claude Code / Cursor / Claude Desktop
```

MCP config:

```json
{ "mcpServers": { "engram": { "command": "npx", "args": ["@rohankumar4179/engram", "mcp", "-C", "/path/to/project"] } } }
```

Full docs: https://github.com/rohan911438/Engram
