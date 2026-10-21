# Engram Inspector

Local web view of an agent's mind, opened with `engram ui`.

- **Overview** — agent, HEAD commit, Sui anchor, learning curve, live "Verify HEAD".
- **Mind** — belief graph (React Flow) with a timeline slider across commits; new / revised beliefs glow.
- **History** — commits with belief diffs, Sui transaction and Walrus manifest links, verify per commit.
- **Receipts** — every agent decision, the beliefs it used, and live verification.

Built on open-source, MIT-licensed components: [shadcn/ui](https://ui.shadcn.com) (Base UI), [React Flow](https://reactflow.dev), [Lucide](https://lucide.dev) icons, Tailwind CSS, Geist font.

```bash
pnpm --filter @engram/inspector build   # → dist/, served by `engram ui`
pnpm --filter @engram/inspector dev     # hot reload; proxy /api to `engram ui` on :4646
```
