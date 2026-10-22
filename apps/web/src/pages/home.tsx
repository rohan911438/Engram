import { useEffect, useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { GithubLogo as Github } from "@phosphor-icons/react";
import { ArrowRight, ArrowUpRight, BellOff, BellRing, Brain, Code2, Eraser, FileCheck2, GitCommitHorizontal, Link2, Lock, Plug, ShieldCheck, Sparkles, SquareTerminal as Terminal2, Wallet } from "lucide-react";
import { AgentBentoGrid } from "@/components/ui/agent-bento-grid";
import { AnimatedRays } from "@/components/ui/animated-rays";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { GlowBorderCard } from "@/components/ui/glow-border-card";
import { LightLines } from "@/components/ui/light-lines";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SpotlightNavbar } from "@/components/ui/spotlight-navbar";
import { Brand } from "@/components/engram/brand";
import { WalletButton } from "@/components/engram/wallet-button";
import { server, type Stats } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const GITHUB = "https://github.com/rohan911438/Engram";

export function HomePage() {
  return (
    <div className="relative min-h-screen bg-black text-white antialiased selection:bg-[#a78bfa]/30">
      <Nav />
      <Hero />
      <Divider />
      <LiveStrip />
      <Divider />
      <HowItWorks />
      <Divider />
      <Features />
      <Divider />
      <Proof />
      <Divider />
      <Story />
      <Divider />
      <Developers />
      <FinalCta />
      <Footer />
    </div>
  );
}

const Divider = () => <div className="hairline mx-auto max-w-7xl" />;

/** Serif italic accent inside a headline. */
const Em = ({ children }: { children: React.ReactNode }) => <span className="text-accent pr-1 font-serif font-normal tracking-normal italic">{children}</span>;

// ---- nav ---------------------------------------------------------------------

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-500", scrolled ? "bg-black/75 backdrop-blur-2xl" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Brand />
        <div className="hidden md:block">
          <SpotlightNavbar
            items={[
              { label: "How it works", href: "#how" },
              { label: "Features", href: "#features" },
              { label: "Proof", href: "#proof" },
              { label: "Demo", href: "#story" },
              { label: "Developers", href: "#developers" },
            ]}
            onItemClick={(item) => document.querySelector(item.href)?.scrollIntoView({ behavior: "smooth" })}
          />
        </div>
        <div className="flex items-center gap-2">
          <a href={GITHUB} target="_blank" rel="noreferrer" className="hidden size-9 items-center justify-center rounded-full text-white/60 transition hover:bg-white/5 hover:text-white sm:flex" aria-label="GitHub">
            <Github className="size-[18px]" />
          </a>
          <WalletButton />
        </div>
      </div>
      <div className={cn("hairline transition-opacity duration-500", scrolled ? "opacity-100" : "opacity-0")} />
    </header>
  );
}

// ---- hero ----------------------------------------------------------------------

const VERIFY_LINES: { head?: boolean; text: string; detail?: string }[] = [
  { head: true, text: "$ engram verify r_5080ccb4" },
  { text: "receipt signature", detail: "ALERT[critical] 0.025 SUI → 0xcbed89… · signed" },
  { text: "belief proofs", detail: "b_scam_address_0xcbed@1 ∈ commit 19040b51" },
  { text: "merkle root", detail: "5 beliefs + 0 tombstones → 392bf9cb…" },
  { text: "history", detail: "2 earlier commits, signed + hash-linked" },
  { text: "walrus", detail: "manifest recalled from Walrus Memory" },
  { text: "sui anchor", detail: "Anchored event · checkpoint 397,926,925" },
];

function Terminal() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= VERIFY_LINES.length + 1) {
      const t = setTimeout(() => setN(0), 4500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setN((x) => x + 1), n === 0 ? 900 : 430);
    return () => clearTimeout(t);
  }, [n]);
  return (
    <div className="card-black relative overflow-hidden shadow-[0_40px_140px_-40px_rgba(124,92,255,0.55)]">
      <div className="flex items-center gap-2 px-5 py-3.5">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="ml-3 font-mono text-[11px] tracking-wide text-white/45">money-ops · verify a decision</span>
      </div>
      <div className="hairline opacity-60" />
      <div className="min-h-[286px] space-y-2 p-6 font-mono text-[12.5px] leading-relaxed">
        {VERIFY_LINES.slice(0, n).map((l, i) =>
          l.head ? (
            <div key={i} className="text-white">{l.text}</div>
          ) : (
            <motion.div key={i} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex gap-3">
              <span className="text-emerald-400">✔</span>
              <span className="w-32 shrink-0 text-white/90">{l.text}</span>
              <span className="truncate text-white/50">{l.detail}</span>
            </motion.div>
          ),
        )}
        {n > VERIFY_LINES.length - 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-4">
            <span className="rounded-md bg-emerald-400/15 px-2 py-0.5 font-semibold text-emerald-300">VALID</span>
            <span className="ml-2 text-white/55">this decision used exactly this memory.</span>
          </motion.div>
        )}
        {n < VERIFY_LINES.length && <span className="inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-white/70" />}
      </div>
      <BorderBeam size={140} duration={9} colorFrom="#a78bfa" colorTo="#67e8f9" />
    </div>
  );
}

function Hero() {
  const { hasDemo, mode } = useSession();
  return (
    <section className="grain relative isolate overflow-hidden pt-16">
      {/* light streaks, kept very low so the black stays black */}
      <div className="absolute inset-0 -z-20 opacity-60">
        <LightLines gradientFrom="#000000" gradientTo="#000000" lineColor="#8b7cff" lightColor="#d4caff" linesOpacity={0.05} lightsOpacity={0.7} speedMultiplier={0.55} className="h-full w-full" />
      </div>
      {/* overhead spotlight */}
      <div className="pointer-events-none absolute top-[-280px] left-1/2 -z-10 h-[760px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(124,92,255,0.30),rgba(124,92,255,0.06)_45%,transparent_70%)] blur-2xl" />
      <div className="pointer-events-none absolute top-[120px] right-[-200px] -z-10 size-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.12),transparent)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-56 bg-gradient-to-b from-transparent to-black" />

      <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 pt-24 pb-28 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1.08fr_1fr] lg:pt-16">
        <div>
          <BlurFade delay={0.05}>
            <a href="#proof" className="group inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] py-1 pr-3 pl-1.5 text-xs backdrop-blur">
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white">NEW</span>
              <AnimatedShinyText className="mx-0 text-xs text-white/70">Memory on Walrus · proofs on Sui · verified via Tatum</AnimatedShinyText>
              <ArrowRight className="size-3 text-white/50 transition group-hover:translate-x-0.5" />
            </a>
          </BlurFade>
          <BlurFade delay={0.12}>
            <h1 className="mt-8 text-[54px] leading-[0.98] font-semibold tracking-[-0.045em] sm:text-7xl lg:text-[88px]">
              <span className="text-headline">Git for your</span>
              <br />
              <span className="text-headline">agent&apos;s </span>
              <Em>memory.</Em>
            </h1>
          </BlurFade>
          <BlurFade delay={0.22}>
            <p className="mt-7 max-w-[540px] text-[19px] leading-[1.6] text-white/70">
              Engram turns what an AI agent sees into beliefs it can explain, version, prove and forget. Connect your Sui wallet and watch an agent learn your money habits — every decision signed and anchored on-chain.
            </p>
          </BlurFade>
          <BlurFade delay={0.32}>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <WalletButton size="lg" />
              {(hasDemo || mode === "local") && (
                <Link to={mode === "local" ? "/app" : "/demo"} className="group inline-flex h-12 items-center gap-2 rounded-full border border-white/12 bg-white/[0.02] px-6 text-[15px] font-medium text-white/90 backdrop-blur transition hover:border-white/25 hover:bg-white/[0.06]">
                  <Sparkles className="size-4 text-[#b9a7ff]" /> Explore the demo agent
                  <ArrowRight className="size-4 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/80" />
                </Link>
              )}
            </div>
            <p className="mt-5 flex items-center gap-2 text-[13px] text-white/50">
              <Lock className="size-3.5" /> One free signature to sign in. No transaction, no gas, no funds moved.
            </p>
          </BlurFade>
        </div>
        <BlurFade delay={0.4} className="relative">
          <Terminal />
        </BlurFade>
      </div>
    </section>
  );
}

// ---- live strip -------------------------------------------------------------------

function LiveStrip() {
  const [s, setS] = useState<Stats | null>(null);
  const { mode } = useSession();
  useEffect(() => {
    if (mode !== "hosted") return;
    const load = () => server.stats().then(setS).catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [mode]);
  const items = [
    { label: "Agents", value: s?.agents ?? 0 },
    { label: "Episodes", value: s?.episodes ?? 0 },
    { label: "Beliefs", value: s?.beliefs ?? 0 },
    { label: "Commits", value: s?.commits ?? 0 },
    { label: "Decisions", value: s?.receipts ?? 0 },
  ];
  return (
    <section className="bg-black">
      <div className="mx-auto grid max-w-7xl grid-cols-2 divide-white/[0.06] px-6 sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
        {items.map((it) => (
          <div key={it.label} className="px-6 py-10 first:pl-0">
            <div className="text-[40px] leading-none font-medium tracking-[-0.03em] tabular-nums text-white">{s ? <NumberTicker value={it.value} className="text-white" /> : "—"}</div>
            <div className="mt-3 text-[11px] font-medium tracking-[0.18em] text-white/45 uppercase">{it.label}</div>
          </div>
        ))}
        <div className="col-span-2 px-6 py-10 sm:col-span-1">
          <div className="flex items-center gap-2 font-mono text-[22px] leading-none tabular-nums text-white">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-emerald-400" /></span>
            {s?.suiCheckpoint ? Number(s.suiCheckpoint).toLocaleString("en-US") : "—"}
          </div>
          <div className="mt-3 text-[11px] font-medium tracking-[0.18em] text-white/45 uppercase">Sui checkpoint · live</div>
        </div>
      </div>
    </section>
  );
}

// ---- section heading ----------------------------------------------------------------

function SectionHead({ eyebrow, title, text, align = "center" }: { eyebrow: string; title: React.ReactNode; text: string; align?: "center" | "left" }) {
  return (
    <BlurFade inView className={cn(align === "center" && "mx-auto max-w-3xl text-center")}>
      <div className={cn("inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.22em] text-[#b9a7ff] uppercase", align === "center" && "justify-center")}>
        <span className="h-px w-6 bg-gradient-to-r from-transparent to-[#b9a7ff]/70" />
        {eyebrow}
        <span className="h-px w-6 bg-gradient-to-l from-transparent to-[#b9a7ff]/70" />
      </div>
      <h2 className="mt-5 text-[40px] leading-[1.04] font-semibold tracking-[-0.04em] sm:text-[56px]">{title}</h2>
      <p className={cn("mt-6 text-[18px] leading-[1.65] text-white/65", align === "center" && "mx-auto max-w-2xl")}>{text}</p>
    </BlurFade>
  );
}

// ---- how it works ------------------------------------------------------------------

const STEPS = [
  { icon: Wallet, title: "Observe", text: "Every wallet event and every word you tell it becomes an episode — encrypted with its own key, stored on Walrus Memory.", tag: "AES-256-GCM · Walrus" },
  { icon: Brain, title: "Sleep", text: "The agent consolidates episodes into beliefs with confidence and evidence, and revises them when you correct it.", tag: "LLM · grounded in episodes" },
  { icon: GitCommitHorizontal, title: "Commit", text: "Beliefs become a Merkle root, signed by the agent and anchored on Sui. History you can diff, blame and bisect.", tag: "Ed25519 · Merkle · Sui" },
  { icon: ShieldCheck, title: "Prove", text: "Each decision carries a signed receipt naming the exact beliefs it used. Anyone can verify it end to end.", tag: "Receipts · Sui via Tatum" },
];

function HowItWorks() {
  return (
    <section id="how" className="relative mx-auto max-w-7xl scroll-mt-16 px-6 py-32">
      <SectionHead
        eyebrow="How it works"
        title={<><span className="text-headline">A memory that learns —</span><br /><Em>and can prove what it knew.</Em></>}
        text="Four steps turn a black-box agent into one you can audit. They run on real data: your wallet, your words, live chain state."
      />
      <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <BlurFade key={s.title} delay={0.08 * i} inView className="h-full">
            <GlowBorderCard width="100%" aspectRatio="auto" height="100%" colorPreset="custom" gradientColors={["#3b2bb8", "#7c5cff", "#b9a7ff", "#67e8f9", "#22d3ee", "#7c5cff", "#3b2bb8"]} borderRadius="1.25rem" animationDuration={7 + i} borderWidth="0.6em" blurAmount="0.6em" inset="-0.4em" className="h-full bg-transparent dark:bg-transparent" contentClassName="p-px items-stretch">
              <div className="flex h-full min-h-[272px] w-full flex-col rounded-[calc(1.25rem-1px)] bg-black p-7">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02]"><s.icon className="size-5 text-[#cfc5ff]" /></span>
                  <span className="font-serif text-2xl text-white/25 italic">0{i + 1}</span>
                </div>
                <h3 className="mt-7 text-[22px] font-semibold tracking-[-0.02em] text-white">{s.title}</h3>
                <p className="mt-2.5 text-[15px] leading-[1.6] text-white/65">{s.text}</p>
                <div className="mt-auto pt-6 font-mono text-[11px] tracking-wide text-[#b9a7ff]">{s.tag}</div>
              </div>
            </GlowBorderCard>
          </BlurFade>
        ))}
      </div>
    </section>
  );
}

// ---- features -----------------------------------------------------------------------

function Features() {
  return (
    <section id="features" className="relative scroll-mt-16 overflow-hidden bg-black py-32">
      <div className="pointer-events-none absolute top-0 left-1/2 h-[520px] w-[900px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(103,232,249,0.10),transparent_65%)]" />
      <div className="relative mx-auto max-w-7xl px-6">
        <SectionHead
          eyebrow="Features"
          title={<><span className="text-headline">Everything Git gave code,</span><br /><Em>now for an agent&apos;s mind.</Em></>}
          text="log · diff · checkout · blame · bisect · verify · forget — as an SDK, a CLI, and this app."
        />
        <BlurFade inView className="mt-16">
          <AgentBentoGrid className="max-w-none gap-3" />
        </BlurFade>
      </div>
    </section>
  );
}

// ---- proof --------------------------------------------------------------------------------

const CHAIN = [
  { k: "Receipt", v: "Ed25519 signature over the decision and the beliefs it used" },
  { k: "Merkle proof", v: "Each belief is proven to be inside the commit's root" },
  { k: "Commit", v: "Signed manifest, hash-linked to its parent — history can't be rewritten" },
  { k: "Walrus", v: "Manifest stored and recalled from Walrus Memory" },
  { k: "Sui", v: "Anchor re-read through Tatum's Sui RPC: object, certification, checkpoint, time" },
];

function Proof() {
  return (
    <section id="proof" className="relative mx-auto grid max-w-7xl scroll-mt-16 items-center gap-16 px-6 py-32 lg:grid-cols-2">
      <div>
        <SectionHead
          align="left"
          eyebrow="Proof"
          title={<><span className="text-headline">Don&apos;t trust the agent.</span><br /><Em>Verify it.</Em></>}
          text="When an agent moves money or raises an alarm, Engram shows exactly which memory it acted on — and that nobody changed that memory afterwards."
        />
        <BlurFade inView delay={0.1} className="mt-9 grid grid-cols-2 gap-3 text-[14px]">
          {[
            { icon: FileCheck2, t: "Signed receipts" },
            { icon: GitCommitHorizontal, t: "Hash-linked commits" },
            { icon: ShieldCheck, t: "Anchored on Sui" },
            { icon: Eraser, t: "Provable forgetting" },
          ].map((p) => (
            <div key={p.t} className="card-black flex items-center gap-2.5 px-4 py-3 text-white/85">
              <p.icon className="size-4 text-[#b9a7ff]" /> {p.t}
            </div>
          ))}
        </BlurFade>
      </div>
      <ol className="relative space-y-3">
        <div className="absolute top-8 bottom-8 left-[27px] w-px bg-gradient-to-b from-[#a78bfa]/70 via-[#67e8f9]/50 to-emerald-400/70" />
        {CHAIN.map((c, i) => (
          <BlurFade key={c.k} delay={0.07 * i} inView>
            <li className="card-black group flex items-center gap-4 p-4 transition duration-300 hover:-translate-y-0.5">
              <span className="z-10 flex size-[38px] shrink-0 items-center justify-center rounded-full border border-white/15 bg-black font-serif text-lg text-[#cfc5ff] italic">{i + 1}</span>
              <div>
                <div className="font-medium text-white">{c.k}</div>
                <div className="mt-0.5 text-[14px] text-white/60">{c.v}</div>
              </div>
              <span className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-xs text-emerald-300">✔</span>
            </li>
          </BlurFade>
        ))}
      </ol>
    </section>
  );
}

// ---- story -------------------------------------------------------------------------------

const PHASES = [
  { label: "Month 1", note: "Knows nothing. Asks about salary, rent and a subscription.", alerts: 3, total: 3 },
  { label: "Months 2–3", note: "Learned the owner's habits. Stays quiet, citing each belief.", alerts: 0, total: 6 },
  { label: "Month 4", note: "Rent rises → warn. 0.18 SUI to an unknown address → critical.", alerts: 2, total: 2 },
  { label: "Month 5", note: "New rent accepted. The scam address is caught from memory.", alerts: 1, total: 2 },
];

function Story() {
  const { hasDemo, mode } = useSession();
  return (
    <section id="story" className="relative scroll-mt-16 overflow-hidden bg-black py-32">
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[420px] w-[1000px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_bottom,rgba(124,92,255,0.12),transparent_65%)]" />
      <div className="relative mx-auto max-w-7xl px-6">
        <SectionHead
          eyebrow="The money-ops agent"
          title={<><span className="text-headline">Same agent, same code.</span><br /><Em>Only its memory changed.</Em></>}
          text="A wallet watcher with Engram memory, run on real Sui transfers between five wallets. Watch how many it alerts on as it learns its owner."
        />
        <div className="mt-16 grid gap-4 md:grid-cols-4">
          {PHASES.map((p, i) => (
            <BlurFade key={p.label} delay={0.08 * i} inView className="h-full">
              <div className="card-black h-full p-6">
                <div className="font-serif text-[22px] text-white/90 italic">{p.label}</div>
                <div className="mt-5 flex h-16 items-end gap-1.5">
                  {Array.from({ length: p.total }, (_, j) => (
                    <motion.span
                      key={j}
                      initial={{ height: 0 }}
                      whileInView={{ height: j < p.alerts ? 60 : 22 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.15 + j * 0.06, type: "spring", stiffness: 140, damping: 16 }}
                      className={cn("w-3 rounded-full", j < p.alerts ? "bg-gradient-to-t from-amber-500/50 to-amber-300" : "bg-gradient-to-t from-emerald-500/30 to-emerald-300/90")}
                    />
                  ))}
                </div>
                <div className="mt-5 flex items-baseline gap-2">
                  {p.alerts > 0 ? <BellRing className="size-4 self-center text-amber-300" /> : <BellOff className="size-4 self-center text-emerald-300" />}
                  <span className="text-[34px] leading-none font-medium tracking-[-0.03em] tabular-nums text-white">{p.alerts}/{p.total}</span>
                  <span className="text-[13px] text-white/50">alerted</span>
                </div>
                <p className="mt-3 text-[14px] leading-[1.6] text-white/60">{p.note}</p>
              </div>
            </BlurFade>
          ))}
        </div>
        {(hasDemo || mode === "local") && (
          <div className="mt-12 flex justify-center">
            <Link to={mode === "local" ? "/app" : "/demo"} className="group inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-[14px] text-white/80 transition hover:border-white/25 hover:text-white">
              Open this agent&apos;s real memory <ArrowUpRight className="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

// ---- developers ------------------------------------------------------------------------

const DEV_CARDS = [
  {
    icon: Terminal2,
    title: "CLI",
    text: "git for your agent's mind: commit, log, diff, blame, bisect, verify, forget, audit.",
    code: "npx @rohankumar4179/engram init my-agent
engram observe -s user \"rent is 450 on the 1st\"
engram sleep && engram commit -m \"week 1\"
engram verify HEAD",
  },
  {
    icon: Code2,
    title: "SDK",
    text: "Wrap the agent you already have: relevant beliefs in, a signed receipt out.",
    code: "import { engram } from \"@rohankumar4179/engram-sdk\";

const mind = engram({ agent: \"money-ops\" });
const agent = mind.wrap(myAgent);
await agent(tx);   // agent.lastReceipt → r_…",
  },
  {
    icon: Plug,
    title: "MCP",
    text: "Give Claude Code, Cursor or Claude Desktop beliefs, blame, commit and verify as tools.",
    code: "{ \"mcpServers\": { \"engram\": {
  \"command\": \"npx\",
  \"args\": [\"@rohankumar4179/engram\", \"mcp\"]
} } }",
  },
];

function Developers() {
  const origin = typeof location === "undefined" ? "https://engram.app" : location.origin;
  return (
    <section id="developers" className="relative mx-auto max-w-7xl scroll-mt-16 px-6 py-32">
      <SectionHead
        eyebrow="For developers"
        title={<><span className="text-headline">Bring your own agent.</span><br /><Em>Keep its memory honest.</Em></>}
        text="The same engine as this app, as a CLI, a TypeScript SDK and an MCP server. Link any of them to your dashboard with your wallet."
      />
      <div className="mt-16 grid gap-5 lg:grid-cols-3">
        {DEV_CARDS.map((c, i) => (
          <BlurFade key={c.title} delay={0.08 * i} inView className="h-full">
            <div className="card-black flex h-full flex-col p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02]"><c.icon className="size-[18px] text-[#cfc5ff]" /></span>
                <h3 className="text-[19px] font-semibold tracking-[-0.02em]">{c.title}</h3>
              </div>
              <p className="mt-3 text-[14.5px] leading-[1.6] text-white/60">{c.text}</p>
              <pre className="mt-5 flex-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-black/70 p-4 font-mono text-[12px] leading-relaxed text-white/80">{c.code}</pre>
            </div>
          </BlurFade>
        ))}
      </div>
      <BlurFade delay={0.25} inView>
        <div className="mt-6 flex flex-col items-start gap-4 rounded-2xl border border-[#67e8f9]/15 bg-[#67e8f9]/[0.04] p-6 sm:flex-row sm:items-center">
          <Link2 className="size-5 shrink-0 text-[#67e8f9]" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium">Link a CLI or SDK agent to your dashboard</div>
            <div className="mt-1 text-[13.5px] text-white/55">Approve with your Sui wallet. Every commit syncs; the server re-verifies signatures, Merkle roots and Sui anchors before showing it. Raw memories and keys never leave your machine.</div>
          </div>
          <code className="max-w-full overflow-x-auto rounded-lg bg-black/70 px-3 py-2 font-mono text-[12px] whitespace-nowrap text-white/85">npx @rohankumar4179/engram link --server {origin}</code>
        </div>
      </BlurFade>
      <div className="mt-8 flex flex-wrap justify-center gap-3 text-[13px]">
        <a href="https://www.npmjs.com/package/@rohankumar4179/engram" target="_blank" rel="noreferrer" className="rounded-full border border-white/10 px-4 py-2 text-white/70 transition hover:border-white/25 hover:text-white">CLI on npm ↗</a>
        <a href="https://www.npmjs.com/package/@rohankumar4179/engram-sdk" target="_blank" rel="noreferrer" className="rounded-full border border-white/10 px-4 py-2 text-white/70 transition hover:border-white/25 hover:text-white">SDK on npm ↗</a>
        <a href={GITHUB} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 px-4 py-2 text-white/70 transition hover:border-white/25 hover:text-white">Docs on GitHub ↗</a>
      </div>
    </section>
  );
}

// ---- final CTA + footer ----------------------------------------------------------------

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-black">
      <AnimatedRays className="min-h-[560px] bg-black">
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 py-36 text-center">
          <h2 className="text-[44px] leading-[1.02] font-semibold tracking-[-0.045em] sm:text-[64px]">
            <span className="text-headline">Give your agent a memory</span>
            <br />
            <Em>it can prove.</Em>
          </h2>
          <p className="mt-6 max-w-xl text-[18px] leading-[1.6] text-white/65">Connect a Sui wallet. Your agent reads your real transactions through Tatum, learns from what you tell it, and commits every belief to Walrus and Sui.</p>
          <div className="mt-10">
            <WalletButton size="lg" />
          </div>
        </div>
      </AnimatedRays>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-black">
      <div className="hairline" />
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-12 sm:flex-row sm:items-center">
        <div>
          <Brand />
          <p className="mt-3 text-[13px] text-white/45">Built for the Tatum × Walrus Total Recall hackathon · MIT licensed</p>
        </div>
        <div className="flex flex-wrap gap-x-7 gap-y-2 text-[14px] text-white/55">
          <a className="transition hover:text-white" href="https://docs.wal.app/walrus-memory/getting-started/what-is-walrus-memory.md" target="_blank" rel="noreferrer">Walrus Memory</a>
          <a className="transition hover:text-white" href="https://tatum.io" target="_blank" rel="noreferrer">Tatum</a>
          <a className="transition hover:text-white" href="https://sui.io" target="_blank" rel="noreferrer">Sui</a>
          <a className="transition hover:text-white" href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
