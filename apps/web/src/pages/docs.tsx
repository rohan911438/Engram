import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { GithubLogo as Github } from "@phosphor-icons/react";
import { ArrowRight, ArrowUpRight, Check, Copy, Info, Menu, TriangleAlert, X } from "lucide-react";
import { Brand } from "@/components/engram/brand";
import { WalletButton } from "@/components/engram/wallet-button";
import { cn } from "@/lib/utils";

const GITHUB = "https://github.com/rohan911438/Engram";
const CLI = "@rohankumar4179/engram";
const SDK = "@rohankumar4179/engram-sdk";

// ---- navigation ----------------------------------------------------------------

const GROUPS: { title: string; items: { id: string; label: string }[] }[] = [
  { title: "Getting started", items: [
    { id: "introduction", label: "Introduction" },
    { id: "quickstart", label: "Quickstart" },
    { id: "configuration", label: "Configuration" },
  ] },
  { title: "Integrate", items: [
    { id: "dashboard", label: "Connect to the dashboard" },
    { id: "sdk", label: "TypeScript SDK" },
    { id: "mcp", label: "MCP for AI assistants" },
  ] },
  { title: "Concepts", items: [
    { id: "concepts", label: "Episodes, beliefs, commits" },
    { id: "security", label: "Privacy & verification" },
  ] },
  { title: "Reference", items: [
    { id: "cli", label: "CLI commands" },
    { id: "sdk-reference", label: "SDK methods" },
    { id: "troubleshooting", label: "Troubleshooting" },
  ] },
];
const ALL = GROUPS.flatMap((g) => g.items);

function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

/** Highlights the section currently in view. */
function useActiveSection() {
  const [active, setActive] = useState(ALL[0]!.id);
  useEffect(() => {
    const els = ALL.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return active;
}

// ---- page ------------------------------------------------------------------------

export function DocsPage() {
  const active = useActiveSection();
  const [menu, setMenu] = useState(false);
  const origin = typeof location === "undefined" ? "https://engram-blond.vercel.app" : location.origin;

  useEffect(() => {
    document.title = "Docs — Engram";
    const id = location.hash.slice(1);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView(), 50);
    return () => { document.title = "Engram — git for agent memory"; };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <TopBar menu={menu} setMenu={setMenu} />
      {menu && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto border-t border-border bg-background px-5 py-6 lg:hidden">
          <Sidebar active={active} onPick={(id) => { setMenu(false); jump(id); }} />
        </div>
      )}
      <div className="mx-auto flex max-w-[1400px] gap-12 px-5 sm:px-8">
        <aside className="sticky top-16 hidden h-[calc(100svh-4rem)] w-60 shrink-0 overflow-y-auto py-10 lg:block">
          <Sidebar active={active} onPick={jump} />
        </aside>
        <main className="min-w-0 flex-1 pt-28 pb-32 lg:pt-14">
          <article className="max-w-[760px]">
            <Introduction />
            <Quickstart origin={origin} />
            <Configuration />
            <Dashboard origin={origin} />
            <SdkSection origin={origin} />
            <McpSection />
            <Concepts />
            <Security />
            <CliReference />
            <SdkReference />
            <Troubleshooting />
            <Pager />
          </article>
        </main>
      </div>
    </div>
  );
}

function TopBar({ menu, setMenu }: { menu: boolean; setMenu: (v: boolean) => void }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/85 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <Brand />
          <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">Docs</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/demo" className="hidden rounded-full px-3 py-1.5 text-[14px] text-foreground/75 transition hover:text-foreground sm:block">Live demo</Link>
          <a href={GITHUB} target="_blank" rel="noreferrer" className="hidden size-9 items-center justify-center rounded-full border border-border text-foreground/70 transition hover:border-foreground/30 hover:text-foreground sm:flex" aria-label="GitHub">
            <Github className="size-[17px]" />
          </a>
          <WalletButton />
          <button type="button" onClick={() => setMenu(!menu)} className="flex size-9 items-center justify-center rounded-full border border-border lg:hidden" aria-label="Docs menu">
            {menu ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ active, onPick }: { active: string; onPick: (id: string) => void }) {
  return (
    <nav className="space-y-8">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="label mb-3">{g.title}</div>
          <ul className="space-y-0.5 border-l border-border">
            {g.items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => onPick(it.id)}
                  className={cn(
                    "-ml-px block w-full border-l py-1.5 pl-4 text-left text-[14px] transition",
                    active === it.id ? "border-brand text-foreground" : "border-transparent text-foreground/60 hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="panel p-4">
        <div className="text-[13px] font-medium">Need a hand?</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">Open an issue on GitHub and include the command and the error you saw.</p>
        <a href={`${GITHUB}/issues`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[13px] text-brand hover:underline">
          Open an issue <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </nav>
  );
}

// ---- building blocks ----------------------------------------------------------

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-border py-14 first:pt-0 last:border-0">
      <div className="label"><span className="text-brand">●</span> {eyebrow}</div>
      <h2 className="mt-3 font-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.04em]">
        {title}<span className="text-brand">.</span>
      </h2>
      <div className="mt-6 space-y-5 text-[15.5px] leading-[1.75] text-foreground/80">{children}</div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-4 font-display text-[21px] font-semibold tracking-[-0.02em] text-foreground">{children}</h3>;
}

const C = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[0.86em] text-foreground">{children}</code>
);

function Callout({ tone = "info", title, children }: { tone?: "info" | "warn"; title: string; children: React.ReactNode }) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div className={cn("flex gap-3 rounded-xl border p-4 text-[14.5px] leading-relaxed", tone === "warn" ? "border-warn/30 bg-warn/[0.06]" : "border-brand/25 bg-brand/[0.05]")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-warn" : "text-brand")} />
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="mt-1 text-foreground/75">{children}</div>
      </div>
    </div>
  );
}

// Tiny highlighter: comments, strings, keywords, shell prompts. Enough for docs.
const KEYWORDS = /^(import|from|const|let|await|async|return|new|export|function|if)$/;
function highlight(code: string, lang: string): React.ReactNode[] {
  return code.split("\n").map((line, i) => {
    const out: React.ReactNode[] = [];
    const commentAt = lang === "ts" || lang === "json" ? line.indexOf("//") : line.search(/(^|\s)#\s/);
    const body = commentAt >= 0 ? line.slice(0, commentAt) : line;
    const comment = commentAt >= 0 ? line.slice(commentAt) : "";
    body.split(/("[^"]*"|'[^']*'|`[^`]*`|\b\w+\b)/).forEach((tok, j) => {
      if (!tok) return;
      if (/^["'`]/.test(tok)) out.push(<span key={j} className="text-[#e6f7a8]">{tok}</span>);
      else if (lang === "ts" && KEYWORDS.test(tok)) out.push(<span key={j} className="text-brand-2">{tok}</span>);
      else if (lang !== "ts" && lang !== "json" && j === 1 && /^(npx|npx\.cmd|npm|pnpm|engram|cd|mkdir|copy|cp)$/.test(tok)) out.push(<span key={j} className="text-brand">{tok}</span>);
      else out.push(tok);
    });
    if (comment) out.push(<span key="c" className="text-muted-foreground/70">{comment}</span>);
    return <div key={i} className="min-h-[1.6em]">{out}</div>;
  });
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
      aria-label="Copy code"
    >
      {done ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
      {done ? "copied" : "copy"}
    </button>
  );
}

/** Code block, optionally with tabs (e.g. macOS/Linux vs Windows). */
function Code({ tabs, lang = "bash", title }: { tabs: { label?: string; code: string }[] | string; lang?: string; title?: string }) {
  const list = typeof tabs === "string" ? [{ code: tabs }] : tabs;
  const [t, setT] = useState(0);
  const cur = list[t]!;
  const lines = useMemo(() => highlight(cur.code.trim(), lang), [cur.code, lang]);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <div className="flex items-center gap-1">
          {list.length > 1
            ? list.map((x, i) => (
                <button key={x.label} type="button" onClick={() => setT(i)} className={cn("rounded-md px-2.5 py-1 font-mono text-[11.5px] transition", i === t ? "bg-white/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {x.label}
                </button>
              ))
            : <span className="px-2.5 py-1 font-mono text-[11.5px] text-muted-foreground">{title ?? lang}</span>}
        </div>
        <CopyButton text={cur.code.trim()} />
      </div>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-[1.6] text-foreground/90"><code>{lines}</code></pre>
    </div>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="relative space-y-8 border-l border-border pl-8 [counter-reset:step]">{children}</ol>;
}
function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="relative [counter-increment:step] before:absolute before:top-0 before:-left-[45px] before:flex before:size-[26px] before:items-center before:justify-center before:rounded-full before:border before:border-border before:bg-background before:font-mono before:text-[12px] before:text-brand before:content-[counter(step)]">
      <div className="font-medium text-foreground">{title}</div>
      <div className="mt-2 space-y-3">{children}</div>
    </li>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-[14px]">
        <thead className="bg-surface-2">
          <tr>{head.map((h) => <th key={h} className="px-4 py-2.5 font-mono text-[11px] font-normal tracking-[0.12em] text-muted-foreground uppercase">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border align-top">
              {r.map((c, j) => <td key={j} className={cn("px-4 py-3 leading-relaxed", j === 0 ? "whitespace-nowrap text-foreground" : "text-foreground/75")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- sections -----------------------------------------------------------------

function Introduction() {
  return (
    <section id="introduction" className="scroll-mt-24 border-b border-border pb-14">
      <div className="label"><span className="text-brand">●</span> Documentation</div>
      <h1 className="mt-3 font-display text-[clamp(2.6rem,6vw,4.2rem)] leading-[0.98] font-semibold tracking-[-0.05em]">
        Give your agent a memory <span className="font-serif font-normal tracking-[-0.02em] text-brand italic">you can prove</span>.
      </h1>
      <p className="mt-6 max-w-2xl text-[17px] leading-[1.7] text-foreground/75">
        Engram is git for agent memory. Your agent records what it sees, turns it into beliefs, and commits signed
        snapshots to Walrus with an anchor on Sui. Every decision comes with a receipt that anyone can verify. You
        can also link the agent to this website and watch its memory on a dashboard.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { id: "quickstart", k: "5 min", t: "Quickstart", d: "Create an agent from the terminal and see it on your dashboard." },
          { id: "sdk", k: "TypeScript", t: "Integrate the SDK", d: "Wrap your existing agent: beliefs in, signed receipts out." },
          { id: "mcp", k: "MCP", t: "AI assistants", d: "Use Engram from Claude Code, Cursor or Claude Desktop." },
        ].map((c) => (
          <button key={c.id} type="button" onClick={() => jump(c.id)} className="card-black group p-5 text-left">
            <div className="font-mono text-[11px] tracking-[0.12em] text-brand uppercase">{c.k}</div>
            <div className="mt-3 flex items-center gap-1.5 font-display text-[18px] font-semibold tracking-[-0.02em]">
              {c.t} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{c.d}</p>
          </button>
        ))}
      </div>
      <H3>How it works</H3>
      <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        {[
          ["observe", "Record what the agent saw. Each episode is encrypted with its own key."],
          ["sleep", "An LLM turns new episodes into beliefs, each backed by evidence."],
          ["commit", "Beliefs → Merkle root → signed manifest on Walrus → anchor on Sui."],
          ["link", "Approve with your Sui wallet. Every commit then shows up on your dashboard."],
        ].map(([k, d], i) => (
          <div key={k} className="bg-surface-1 p-4">
            <div className="font-mono text-[11px] text-muted-foreground">0{i + 1}</div>
            <div className="mt-2 font-mono text-[14px] text-brand">{k}</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/70">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Quickstart({ origin }: { origin: string }) {
  return (
    <Section id="quickstart" eyebrow="Getting started" title="Quickstart">
      <p>You need <strong className="text-foreground">Node.js 20+</strong> and a Sui wallet (for example Slush) to sign in to the dashboard. You don't need to install anything else: <C>npx</C> runs the CLI from npm.</p>
      <Steps>
        <Step title="Create a folder for your agent">
          <p>Each agent lives in its own folder, like a git repo. Engram stores everything in a hidden <C>.engram/</C> folder inside it.</p>
          <Code tabs={[
            { label: "macOS / Linux", code: "mkdir my-agent && cd my-agent" },
            { label: "Windows", code: "mkdir my-agent\ncd my-agent" },
          ]} />
        </Step>
        <Step title="Add your keys">
          <p>Create a <C>.env</C> file in the folder with your Walrus Memory, Tatum and Gemini keys. See <button type="button" onClick={() => jump("configuration")} className="text-brand hover:underline">Configuration</button> for what each key does.</p>
        </Step>
        <Step title="Create the agent and give it memories">
          <Code tabs={[
            { label: "macOS / Linux", code: `npx ${CLI} init my-agent\nnpx ${CLI} observe "I pay 450 USDC rent to 0x7a11 on the 1st"\nnpx ${CLI} observe "From November my rent is 520 USDC"\nnpx ${CLI} sleep                  # episodes → beliefs\nnpx ${CLI} commit -m "first week" # sign → Walrus → Sui` },
            { label: "Windows (PowerShell)", code: `npx.cmd ${CLI} init my-agent\nnpx.cmd ${CLI} observe "I pay 450 USDC rent to 0x7a11 on the 1st"\nnpx.cmd ${CLI} observe "From November my rent is 520 USDC"\nnpx.cmd ${CLI} sleep\nnpx.cmd ${CLI} commit -m "first week"` },
          ]} />
          <Callout title="On Windows, use npx.cmd">
            PowerShell blocks <C>npx.ps1</C> by default ("running scripts is disabled on this system"). <C>npx.cmd</C> does the same job and isn't blocked.
          </Callout>
        </Step>
        <Step title="Link it to your dashboard">
          <Code tabs={[
            { label: "macOS / Linux", code: `npx ${CLI} link --server ${origin} --label "My agent"` },
            { label: "Windows (PowerShell)", code: `npx.cmd ${CLI} link --server ${origin} --label "My agent"` },
          ]} />
          <p>The terminal prints a link and a short code. Open the link, connect your wallet and approve. Your agent then appears under <strong className="text-foreground">Your agents</strong>, and every later commit syncs on its own.</p>
        </Step>
      </Steps>
      <Callout title="Want to see it first?">
        Explore the <Link to="/demo" className="text-brand hover:underline">live demo agent</Link>, a wallet-watching agent with real commits on Walrus and Sui. No wallet needed.
      </Callout>
    </Section>
  );
}

function Configuration() {
  return (
    <Section id="configuration" eyebrow="Getting started" title="Configuration">
      <p>The CLI and SDK read keys from a <C>.env</C> file in the agent's folder (or from environment variables). Pass <C>--env path/to/.env</C> to use a different file.</p>
      <Code title=".env" tabs={`# Walrus Memory: where encrypted episodes, beliefs and manifests are stored
MEMWAL_KEY=suiprivkey1...
MEMWAL_ACCOUNT_ID=0x...
MEMWAL_SERVER_URL=https://relayer.memory.walrus.xyz

# Tatum: reads Sui to check anchors and wallet activity
TATUM_API_KEY_MAINNET=t-...

# LLM for "sleep": one or more Gemini keys, comma-separated
GEMINI_API_KEYS=AIza...
GEMINI_MODEL=gemini-flash-latest

# Optional: put each commit's Merkle root on Sui with the engram_anchor Move module
ENGRAM_ANCHOR_PACKAGE=0x...
ENGRAM_ANCHOR_NETWORK=mainnet
SUI_MNEMONIC=word1 word2 ...`} />
      <Table
        head={["Variable", "Needed for", "What it is"]}
        rows={[
          [<C>MEMWAL_KEY</C>, "commit, push", "Private key of your Walrus Memory account owner."],
          [<C>MEMWAL_ACCOUNT_ID</C>, "commit, push", "Object ID of your Walrus Memory account."],
          [<C>TATUM_API_KEY_MAINNET</C>, "commit, verify", "Tatum API key, used to read Sui (gRPC gateway)."],
          [<C>GEMINI_API_KEYS</C>, "sleep, bisect --ask", "Gemini API keys. Several keys spread the free-tier limit."],
          [<C>ENGRAM_ANCHOR_PACKAGE</C>, "optional", "Package ID of the engram_anchor Move module."],
          [<C>SUI_MNEMONIC</C>, "optional", "Wallet that pays gas for Move anchors."],
        ]}
      />
      <Callout tone="warn" title="Keep .env and .engram/ private">
        Both contain secret keys. Add them to <C>.gitignore</C> and never commit them. The dashboard never needs them.
      </Callout>
    </Section>
  );
}

function Dashboard({ origin }: { origin: string }) {
  return (
    <Section id="dashboard" eyebrow="Integrate" title="Connect to the dashboard">
      <p>Linking works like <C>gh auth login</C>. Your agent asks this website for a one-time code, you approve it with your Sui wallet, and the agent gets a token tied to your wallet.</p>
      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        {[
          ["Terminal", "Run engram link. It prints a URL and a code like K7QF-29XM."],
          ["Browser", "Open the URL, connect your wallet, sign the free sign-in message and approve the code."],
          ["Dashboard", "The agent's commits, beliefs and receipts appear under Your agents."],
        ].map(([k, d], i) => (
          <div key={k} className="bg-surface-1 p-4">
            <div className="font-mono text-[11px] text-brand">{`0${i + 1} · ${k}`}</div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-foreground/75">{d}</p>
          </div>
        ))}
      </div>
      <Code tabs={`$ npx ${CLI} link --server ${origin}
  Open ${origin}/link?code=K7QF-29XM
  and approve code K7QF-29XM with your Sui wallet.
✔ linked to wallet 0xfe2cfd89…7b46
✔ synced 2 commits and 0 receipts — verified by the server`} />
      <H3>After linking</H3>
      <ul className="list-disc space-y-2 pl-5 marker:text-brand">
        <li>Every <C>engram commit</C> (or <C>mind.commit()</C> in the SDK) syncs automatically. A failed sync never fails the commit.</li>
        <li><C>engram sync</C> uploads again by hand. <C>engram unlink</C> forgets the link on this machine.</li>
        <li>The code expires after 10 minutes. If it does, run <C>link</C> again.</li>
        <li>Each agent is linked separately, so one wallet can own many agents.</li>
      </ul>
      <Callout title="What gets uploaded">
        Only the audit bundle: commits, beliefs and signed receipts. Raw episodes and keys never leave your machine.
        The server checks every upload (signatures, Merkle roots, Sui anchors) before it shows anything, and a link
        token only accepts bundles signed by that agent's key.
      </Callout>
      <Callout tone="warn" title="Your wallet may show a warning">
        Some wallets warn about new or unknown websites. Engram only ever asks for a free text signature, never a
        transaction. Always check that the address bar shows the site you expect before you sign.
      </Callout>
    </Section>
  );
}

function SdkSection({ origin }: { origin: string }) {
  return (
    <Section id="sdk" eyebrow="Integrate" title="TypeScript SDK">
      <p>Use the SDK to add Engram to an agent you already have. It's the same engine as the CLI, so a folder made with one works with the other.</p>
      <Code tabs={[
        { label: "npm", code: `npm install ${SDK}` },
        { label: "pnpm", code: `pnpm add ${SDK}` },
      ]} />
      <H3>1. Open a mind</H3>
      <p><C>engram()</C> opens the agent's <C>.engram/</C> folder (or creates it) and reads keys from <C>process.env</C>.</p>
      <Code lang="ts" title="agent.ts" tabs={`import { engram } from "${SDK}";

const mind = engram({
  agent: "money-ops",                 // lowercase letters, digits, dashes
  dir: "./agents/money-ops",          // default: current folder
  context: "a wallet-watching agent", // helps the LLM during sleep
});`} />
      <H3>2. Wrap your agent</H3>
      <p><C>wrap()</C> gives your agent the beliefs relevant to each input. It records the input as an episode, then returns your agent's answer with a signed receipt saying which beliefs it used.</p>
      <Code lang="ts" title="agent.ts" tabs={`const agent = mind.wrap(
  async (tx, beliefs) => myAgent.decide(tx, beliefs),
  { used: (decision) => decision.beliefIds },
);

const decision = await agent(tx);
console.log(agent.lastReceipt?.id);   // r_… with Merkle proofs into HEAD`} />
      <H3>3. Learn and commit</H3>
      <Code lang="ts" tabs={`mind.observe({ source: "tatum", data: tx, summary: "transfer 450 USDC" });
await mind.sleep();                    // new episodes → beliefs
await mind.commit("weekly");           // sign → Walrus → Sui (+ dashboard sync)

await mind.beliefs({ about: "rent" }); // most relevant beliefs
mind.at("2026-10-01");                 // beliefs as they were on a date
await mind.verify("r_…");              // check a receipt end to end`} />
      <H3>4. Link from code</H3>
      <p>Show the code to the owner however you like: a log line, a chat message or a QR code.</p>
      <Code lang="ts" tabs={`if (!mind.linked) {
  await mind.link({
    server: "${origin}",
    label: "Money ops (prod)",
    onCode: ({ url, code }) => console.log(\`Approve \${code} at \${url}\`),
  });
}
await mind.commit("synced");           // commits sync from now on
if (mind.lastSyncError) console.warn(mind.lastSyncError);`} />
      <Callout title="Testing without keys">
        Pass <C>walrus: "memory"</C> and a <C>ScriptedLLM</C> to run everything in-process with no network. That's useful for unit tests.
      </Callout>
    </Section>
  );
}

function McpSection() {
  return (
    <Section id="mcp" eyebrow="Integrate" title="MCP for AI assistants">
      <p>Engram runs as an MCP server, so Claude Code, Cursor and Claude Desktop can remember things, look up beliefs, commit and verify, all from the chat.</p>
      <Code lang="json" title="MCP config" tabs={`{
  "mcpServers": {
    "engram": {
      "command": "npx",
      "args": ["${CLI}", "mcp", "-C", "/path/to/my-agent"]
    }
  }
}`} />
      <p>For Claude Code you can also run:</p>
      <Code tabs={`claude mcp add engram -- npx ${CLI} mcp -C /path/to/my-agent`} />
      <Table
        head={["Tool", "What it does"]}
        rows={[
          [<C>engram_remember</C>, "Record an episode."],
          [<C>engram_beliefs</C>, "Current beliefs, by topic or at a past commit."],
          [<C>engram_sleep</C>, "Turn new episodes into beliefs."],
          [<C>engram_commit</C>, "Sign and anchor a snapshot (syncs if linked)."],
          [<C>engram_log</C>, "Commit history."],
          [<C>engram_diff</C>, "Beliefs added, changed or removed between commits."],
          [<C>engram_blame</C>, "The episodes behind a belief."],
          [<C>engram_forget</C>, "Crypto-shred an episode."],
          [<C>engram_verify</C>, "Verify a commit or receipt."],
          [<C>engram_status</C>, "HEAD, counts, uncommitted changes."],
        ]}
      />
      <p>Link the folder once from a terminal with <C>engram link</C>. After that, commits made through MCP show up on your dashboard too.</p>
    </Section>
  );
}

function Concepts() {
  return (
    <Section id="concepts" eyebrow="Concepts" title="Episodes, beliefs, commits">
      <Table
        head={["Concept", "What it is"]}
        rows={[
          [<span className="font-mono text-brand">Episode</span>, <>Something the agent saw: a message, a tool result, a transaction. Encrypted with its own AES-256-GCM key and stored on Walrus Memory. Sources: <C>user</C>, <C>tool</C>, <C>tatum</C>, <C>agent</C>, <C>system</C>.</>],
          [<span className="font-mono text-brand">Belief</span>, "What the agent concluded, e.g. \"rent is 520 USDC, paid on the 1st\". Versioned, with a confidence score and links to the episodes that support it. Beliefs that cite no real evidence are rejected."],
          [<span className="font-mono text-brand">Commit</span>, "A snapshot of all beliefs: a Merkle root, signed with the agent's Ed25519 key, hash-linked to the previous commit, stored on Walrus and anchored on Sui."],
          [<span className="font-mono text-brand">Receipt</span>, "A signed record of one decision, with Merkle proofs for exactly the beliefs it used."],
          [<span className="font-mono text-brand">Forget</span>, "Destroys an episode's key so nobody can read it again, retracts the beliefs that depended on it, and records a tombstone in the next commit."],
        ]}
      />
      <p>Because history is versioned you can move through it like git: <C>log</C>, <C>diff</C>, <C>checkout</C> a date, <C>blame</C> a belief, or <C>bisect</C> to find the commit where the agent learned something wrong.</p>
    </Section>
  );
}

function Security() {
  return (
    <Section id="security" eyebrow="Concepts" title="Privacy & verification">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Stays on your machine", "Agent signing key, key vault, decrypted episodes, your .env."],
          ["Goes to Walrus", "Encrypted episodes, beliefs and signed commit manifests."],
          ["Goes to Sui", "Commit anchors: the blob's certification, plus the Merkle root if you use the Move anchor."],
          ["Goes to the dashboard", "The audit bundle only: commits, beliefs, receipts. Checked before it's shown."],
        ].map(([t, d]) => (
          <div key={t} className="panel p-4">
            <div className="text-[14px] font-medium text-foreground">{t}</div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
      <p>Anyone can check a receipt or commit, with or without the repo:</p>
      <Code tabs={`npx ${CLI} verify r_5080ccb4        # signature → proofs → Walrus → Sui
npx ${CLI} export --audit -o audit.json
npx ${CLI} audit audit.json         # verify a bundle with no repo`} />
      <p>Forgetting is cryptographic: once the key is gone, the stored ciphertext can't be read. It can't undo copies that were already decrypted, and the retracted belief summaries stay in history.</p>
    </Section>
  );
}

function CliReference() {
  return (
    <Section id="cli" eyebrow="Reference" title="CLI commands">
      <p>Run any command with <C>npx {CLI} &lt;command&gt;</C>. Global options: <C>-C &lt;dir&gt;</C> (agent folder), <C>--env &lt;file&gt;</C>.</p>
      <Table
        head={["Command", "What it does"]}
        rows={[
          [<C>init &lt;agent&gt;</C>, "Create .engram/ with a new signing key and key vault."],
          [<C>observe [data]</C>, <>Record an episode. <C>-s</C> source, <C>-m</C> summary, <C>-f</C> JSON file.</>],
          [<C>sleep</C>, "Turn new episodes into beliefs with the LLM."],
          [<C>commit -m &lt;msg&gt;</C>, "Snapshot beliefs: Merkle root → signature → Walrus → Sui."],
          [<C>status</C>, "Current commit, counts and uncommitted changes."],
          [<C>beliefs</C>, <>Current beliefs, or the relevant ones with <C>--about</C>.</>],
          [<C>log</C> , "Commit history."],
          [<C>diff &lt;from&gt; [to]</C>, "Beliefs added, changed or removed."],
          [<C>checkout &lt;ref&gt;</C>, "Beliefs at a commit, HEAD~n or a date."],
          [<C>blame &lt;belief&gt;</C>, "The episodes (with Walrus blob IDs) behind a belief."],
          [<C>bisect &lt;good&gt; &lt;bad&gt;</C>, <>Find the commit where memory went wrong (<C>--grep</C> or <C>--ask</C>).</>],
          [<C>receipts</C>, "Decision receipts."],
          [<C>verify [ref]</C>, "Verify a receipt or commit end to end."],
          [<C>forget &lt;episode&gt;</C>, "Crypto-shred an episode and retract what depended on it."],
          [<C>export --audit</C>, "Write an audit bundle anyone can verify."],
          [<C>audit &lt;file&gt;</C>, "Verify an audit bundle."],
          [<C>link</C>, <>Link to the dashboard. <C>--server</C>, <C>--label</C>.</>],
          [<C>sync</C>, "Upload history to the linked dashboard again."],
          [<C>unlink</C>, "Forget the dashboard link on this machine."],
          [<C>ui</C>, "Open the local inspector (port 4646)."],
          [<C>mcp</C>, "Run as an MCP server over stdio."],
        ]}
      />
    </Section>
  );
}

function SdkReference() {
  return (
    <Section id="sdk-reference" eyebrow="Reference" title="SDK methods">
      <p>All methods are on the <C>Mind</C> object returned by <C>engram(config)</C>. For lower-level access, use <C>mind.core</C> (the <C>Engram</C> class).</p>
      <Table
        head={["Method", "Returns", "What it does"]}
        rows={[
          [<C>wrap(fn, opts)</C>, "WrappedAgent", "Beliefs in, signed receipt out (agent.lastReceipt)."],
          [<C>observe(input)</C>, "Episode", "Record an episode: { source, data, summary? }."],
          [<C>sleep(opts?)</C>, "SleepReport", "Consolidate new episodes into beliefs."],
          [<C>commit(message)</C>, "Commit", "Sign and anchor a snapshot. Syncs if linked."],
          [<C>{"beliefs({ about?, limit? })"}</C>, "Belief[]", "Current or most relevant beliefs."],
          [<C>at(ref)</C>, "Belief[]", "Beliefs at a commit, HEAD~n or a date."],
          [<C>log()</C>, "Commit[]", "Commit history."],
          [<C>diff(from, to?)</C>, "BeliefDiff", "Added, changed and removed beliefs."],
          [<C>blame(belief)</C>, "object", "Evidence and version history of a belief."],
          [<C>receipts()</C>, "Receipt[]", "All decision receipts."],
          [<C>verify(ref, opts?)</C>, "VerifyReport", "Verify a receipt or commit."],
          [<C>forget(episodeId)</C>, "ForgetResult", "Crypto-shred an episode."],
          [<C>{"link({ server, label, onCode })"}</C>, "LinkInfo", "Link to the dashboard; resolves on approval."],
          [<C>sync()</C>, "SyncResult", "Upload history to the dashboard."],
          [<C>linked</C>, "LinkInfo | null", "Current link, if any."],
          [<C>unlink()</C>, "boolean", "Forget the link on this machine."],
        ]}
      />
    </Section>
  );
}

function Troubleshooting() {
  const items: [string, React.ReactNode][] = [
    ["\"running scripts is disabled on this system\" (Windows)", <>PowerShell blocks <C>npx.ps1</C>. Use <C>npx.cmd</C> instead, or run <C>Set-ExecutionPolicy -Scope CurrentUser RemoteSigned</C> once.</>],
    ["\"Walrus Memory is not configured\"", <>Set <C>MEMWAL_KEY</C> and <C>MEMWAL_ACCOUNT_ID</C> in the <C>.env</C> next to <C>.engram/</C>, or pass <C>--env</C>.</>],
    ["\"No LLM configured\" or sleep fails", <>Set <C>GEMINI_API_KEYS</C>. The free tier allows about 20 requests per model per day; add keys from different Google Cloud projects or enable billing.</>],
    ["\"the link code expired\"", <>Codes last 10 minutes. Run <C>link</C> again and approve straight away.</>],
    ["\"nothing to sync — commit first\"", <>Run <C>sleep</C> and <C>commit</C> first. Linking works before your first commit, and the first commit syncs on its own.</>],
    ["Dashboard sync failed after a commit", <>The commit is safe. Run <C>engram sync</C> to retry.</>],
    ["My wallet shows a warning", <>Some wallets flag new websites. Engram only asks for a free sign-in signature, never a transaction. Check the address bar before signing.</>],
  ];
  return (
    <Section id="troubleshooting" eyebrow="Reference" title="Troubleshooting">
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {items.map(([q, a]) => (
          <details key={q} className="group bg-surface-1 open:bg-surface-2/60">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[14.5px] font-medium text-foreground [&::-webkit-details-marker]:hidden">
              {q}
              <span className="font-mono text-muted-foreground transition group-open:rotate-45">+</span>
            </summary>
            <div className="px-5 pb-4 text-[14.5px] leading-relaxed text-foreground/75">{a}</div>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Pager() {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      <Link to="/demo" className="card-black group p-5">
        <div className="label">Explore</div>
        <div className="mt-2 flex items-center gap-1.5 font-display text-[18px] font-semibold">Live demo agent <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></div>
      </Link>
      <a href={GITHUB} target="_blank" rel="noreferrer" className="card-black group p-5">
        <div className="label">Source</div>
        <div className="mt-2 flex items-center gap-1.5 font-display text-[18px] font-semibold">Engram on GitHub <ArrowUpRight className="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div>
      </a>
    </div>
  );
}
