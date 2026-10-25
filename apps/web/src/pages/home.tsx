import { useEffect, useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { GithubLogo as Github } from "@phosphor-icons/react";
import { ArrowDownRight, ArrowRight, ArrowUp, ArrowUpRight, BellOff, BellRing, Code2, Eraser, FileCheck2, GitCommitHorizontal, Link2, Lock, Menu, Plug, ShieldCheck, SquareTerminal as Terminal2, X } from "lucide-react";
import { AgentBentoGrid } from "@/components/ui/agent-bento-grid";
import { BlurFade } from "@/components/ui/blur-fade";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Brand } from "@/components/engram/brand";
import { WalletButton } from "@/components/engram/wallet-button";
import { server, type Stats } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const GITHUB = "https://github.com/rohan911438/Engram";

export function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground antialiased">
      <Nav />
      <Hero />
      <Marquee />
      <LiveStrip />
      <HowItWorks />
      <Features />
      <Proof />
      <Story />
      <Developers />
      <FinalCta />
      <Footer />
    </div>
  );
}

/** Serif italic accent inside a headline. */
const Em = ({ children }: { children: React.ReactNode }) => <span className="pr-[0.06em] font-serif font-normal tracking-[-0.02em] text-brand italic">{children}</span>;

const NAV_ITEMS = [
  { label: "How it works", href: "#how" },
  { label: "Features", href: "#features" },
  { label: "Proof", href: "#proof" },
  { label: "Demo", href: "#story" },
  { label: "Developers", href: "#developers" },
];

const go = (href: string) => document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });

// ---- nav ---------------------------------------------------------------------

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-500", scrolled || open ? "border-b border-border bg-background/80 backdrop-blur-2xl" : "border-b border-transparent")}>
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-6 px-5 sm:px-8">
        <Brand />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((it, i) => (
            <button key={it.href} type="button" onClick={() => go(it.href)} className="group flex items-start gap-1 rounded-full px-3 py-1.5 text-[14px] text-foreground/75 transition hover:text-foreground">
              {it.label}
              <sup className="font-mono text-[9px] text-muted-foreground transition group-hover:text-brand">0{i + 1}</sup>
            </button>
          ))}
          <Link to="/docs" className="rounded-full px-3 py-1.5 text-[14px] text-foreground/75 transition hover:text-foreground">Docs</Link>
        </nav>
        <div className="flex items-center gap-2">
          <a href={GITHUB} target="_blank" rel="noreferrer" className="hidden size-9 items-center justify-center rounded-full border border-border text-foreground/70 transition hover:border-foreground/30 hover:text-foreground sm:flex" aria-label="GitHub">
            <Github className="size-[17px]" />
          </a>
          <WalletButton />
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex size-9 items-center justify-center rounded-full border border-border md:hidden" aria-label="menu">
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border px-5 pb-5 md:hidden">
          {NAV_ITEMS.map((it, i) => (
            <button key={it.href} type="button" onClick={() => { setOpen(false); go(it.href); }} className="flex w-full items-baseline justify-between border-b border-border py-4 text-left font-display text-2xl tracking-tight">
              {it.label}
              <span className="font-mono text-[11px] text-muted-foreground">0{i + 1}</span>
            </button>
          ))}
          <Link to="/docs" className="flex w-full items-baseline justify-between border-b border-border py-4 text-left font-display text-2xl tracking-tight">
            Docs
            <span className="font-mono text-[11px] text-muted-foreground">↗</span>
          </Link>
        </div>
      )}
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
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-[0_50px_120px_-40px_rgba(212,255,58,0.25)]">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <span className="size-2.5 rounded-full bg-brand-2" />
        <span className="size-2.5 rounded-full bg-warn" />
        <span className="size-2.5 rounded-full bg-brand" />
        <span className="ml-3 font-mono text-[11px] tracking-wide text-muted-foreground">money-ops — verify a decision</span>
        <span className="ml-auto rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">zsh</span>
      </div>
      <div className="min-h-[290px] space-y-2 p-5 font-mono text-[12.5px] leading-relaxed sm:p-6">
        {VERIFY_LINES.slice(0, n).map((l, i) =>
          l.head ? (
            <div key={i} className="text-foreground">{l.text}</div>
          ) : (
            <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="flex gap-3">
              <span className="text-brand">✔</span>
              <span className="w-32 shrink-0 text-foreground/90">{l.text}</span>
              <span className="truncate text-muted-foreground">{l.detail}</span>
            </motion.div>
          ),
        )}
        {n > VERIFY_LINES.length - 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-4">
            <span className="rounded-md bg-brand px-2 py-0.5 font-semibold text-ink">VALID</span>
            <span className="ml-2 text-muted-foreground">this decision used exactly this memory.</span>
          </motion.div>
        )}
        {n < VERIFY_LINES.length && <span className="inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-brand" />}
      </div>
    </div>
  );
}

function Hero() {
  const { hasDemo, mode } = useSession();
  return (
    <section className="grain relative isolate overflow-hidden pt-16">
      {/* blueprint grid + signal glow */}
      <div className="bg-grid absolute inset-0 -z-20 [mask-image:radial-gradient(ellipse_80%_70%_at_50%_0%,black,transparent)]" />
      <div className="pointer-events-none absolute -right-40 -bottom-72 -z-10 size-[820px] rounded-full bg-[radial-gradient(closest-side,rgba(212,255,58,0.22),rgba(212,255,58,0.05)_55%,transparent)] blur-2xl" />
      <div className="pointer-events-none absolute top-40 -left-64 -z-10 size-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(255,122,69,0.12),transparent)] blur-2xl" />

      <div className="mx-auto max-w-[1400px] px-5 pt-14 pb-20 sm:px-8 lg:pt-20">
        <BlurFade delay={0.05}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="label">[ Engram ] — memory infrastructure for AI agents</span>
            <a href="#proof" onClick={(e) => { e.preventDefault(); go("#proof"); }} className="group inline-flex items-center gap-2.5 rounded-full border border-border bg-surface-1/70 py-1 pr-3 pl-1.5 text-xs backdrop-blur transition hover:border-foreground/25">
              <span className="rounded-full bg-brand px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-ink">LIVE</span>
              <span className="text-foreground/80">Walrus memory · Sui proofs · Tatum RPC</span>
              <ArrowRight className="size-3 text-muted-foreground transition group-hover:translate-x-0.5" />
            </a>
          </div>
        </BlurFade>

        <BlurFade delay={0.12}>
          <h1 className="mt-10 font-display text-[15vw] leading-[0.86] font-semibold tracking-[-0.055em] sm:text-[12vw] xl:text-[172px]">
            Git for your
            <br />
            agent&apos;s <Em>memory.</Em>
          </h1>
        </BlurFade>

        <div className="mt-14 grid items-end gap-12 lg:grid-cols-12">
          <BlurFade delay={0.22} className="lg:col-span-5">
            <p className="max-w-[520px] text-[19px] leading-[1.6] text-foreground/80">
              Engram turns what an AI agent sees into beliefs it can <span className="text-foreground">explain, version, prove and forget</span>. Connect your Sui wallet and watch an agent learn your money habits — every decision signed and anchored on-chain.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <WalletButton size="lg" />
              {(hasDemo || mode === "local") && (
                <Link to={mode === "local" ? "/app" : "/demo"} className="group inline-flex h-12 items-center gap-2 rounded-full border border-foreground/15 px-6 text-[15px] font-medium text-foreground transition hover:border-foreground/40 hover:bg-foreground/[0.04]">
                  Explore the demo agent
                  <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand" />
                </Link>
              )}
            </div>
            <p className="mt-5 flex items-center gap-2 text-[13px] text-muted-foreground">
              <Lock className="size-3.5" /> One free signature to sign in. No transaction, no gas, no funds moved.
            </p>
          </BlurFade>
          <BlurFade delay={0.35} className="lg:col-span-7">
            <Terminal />
          </BlurFade>
        </div>

        <button type="button" onClick={() => go("#how")} className="mt-16 hidden items-center gap-3 text-muted-foreground transition hover:text-foreground lg:flex">
          <span className="flex size-10 items-center justify-center rounded-full border border-border"><ArrowDownRight className="size-4" /></span>
          <span className="label">Scroll — see how it works</span>
        </button>
      </div>
    </section>
  );
}

// ---- marquee band -----------------------------------------------------------------

const BAND = ["Observe", "Sleep", "Commit", "Prove", "Forget", "Walrus Memory", "Sui anchors", "Tatum RPC", "Signed receipts", "Merkle proofs"];

function Marquee() {
  return (
    <div className="relative overflow-hidden border-y border-ink bg-brand py-4 text-ink">
      <div className="flex w-max animate-marquee items-center">
        {[...BAND, ...BAND].map((w, i) => (
          <span key={i} className="flex items-center font-display text-[30px] leading-none font-semibold tracking-[-0.03em] uppercase sm:text-[38px]">
            <span className="px-7">{w}</span>
            <span aria-hidden className="text-[22px]">✦</span>
          </span>
        ))}
      </div>
    </div>
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
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-[1400px] grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((it) => (
          <div key={it.label} className="border-r border-b border-border px-5 py-10 sm:px-8 lg:border-b-0">
            <div className="label">{it.label}</div>
            <div className="mt-4 font-display text-[52px] leading-none font-medium tracking-[-0.04em] tabular-nums">{s ? <NumberTicker value={it.value} className="text-foreground" /> : "—"}</div>
          </div>
        ))}
        <div className="col-span-2 px-5 py-10 sm:col-span-1 sm:px-8">
          <div className="label flex items-center gap-2">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-70" /><span className="relative inline-flex size-2 rounded-full bg-brand" /></span>
            Sui checkpoint
          </div>
          <div className="mt-5 font-mono text-[22px] leading-none tabular-nums">{s?.suiCheckpoint ? Number(s.suiCheckpoint).toLocaleString("en-US") : "—"}</div>
          <div className="mt-2 text-[12px] text-muted-foreground">live, via Tatum</div>
        </div>
      </div>
    </section>
  );
}

// ---- section heading ----------------------------------------------------------------

function SectionHead({ index, eyebrow, title, text }: { index: string; eyebrow: string; title: React.ReactNode; text: string }) {
  return (
    <BlurFade inView className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <div className="label flex items-center gap-3">
          <span className="text-brand">[{index}]</span> {eyebrow}
        </div>
      </div>
      <div className="lg:col-span-9">
        <h2 className="font-display text-[44px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[64px] lg:text-[80px]">{title}</h2>
        <p className="mt-7 max-w-2xl text-[18px] leading-[1.65] text-foreground/70">{text}</p>
      </div>
    </BlurFade>
  );
}

const Section = ({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) => (
  <section id={id} className={cn("relative scroll-mt-16 border-b border-border", className)}>
    <div className="mx-auto max-w-[1400px] px-5 py-28 sm:px-8 lg:py-36">{children}</div>
  </section>
);

// ---- how it works ------------------------------------------------------------------

const STEPS = [
  { title: "Observe", text: "Every wallet event and every word you tell it becomes an episode — encrypted with its own key, stored on Walrus Memory.", tag: "AES-256-GCM · Walrus" },
  { title: "Sleep", text: "The agent consolidates episodes into beliefs with confidence and evidence, and revises them when you correct it.", tag: "LLM · grounded in episodes" },
  { title: "Commit", text: "Beliefs become a Merkle root, signed by the agent and anchored on Sui. History you can diff, blame and bisect.", tag: "Ed25519 · Merkle · Sui" },
  { title: "Prove", text: "Each decision carries a signed receipt naming the exact beliefs it used. Anyone can verify it end to end.", tag: "Receipts · Sui via Tatum" },
];

function HowItWorks() {
  return (
    <Section id="how">
      <SectionHead
        index="01"
        eyebrow="How it works"
        title={<>A memory that learns — <Em>and can prove</Em> what it knew.</>}
        text="Four steps turn a black-box agent into one you can audit. They run on real data: your wallet, your words, live chain state."
      />
      <ol className="mt-20 border-b border-border">
        {STEPS.map((s, i) => (
          <BlurFade key={s.title} delay={0.06 * i} inView>
            <li className="group grid cursor-default items-baseline gap-4 border-t border-border py-8 transition-colors duration-300 hover:bg-foreground/[0.02] sm:grid-cols-12 sm:gap-6 sm:py-10">
              <span className="font-mono text-[13px] text-muted-foreground transition group-hover:text-brand sm:col-span-1">0{i + 1}</span>
              <h3 className="font-display text-[44px] leading-none font-semibold tracking-[-0.045em] transition-colors duration-300 group-hover:text-brand sm:col-span-4 sm:text-[60px]">{s.title}</h3>
              <p className="max-w-md text-[16px] leading-[1.6] text-foreground/70 sm:col-span-5">{s.text}</p>
              <div className="flex items-center justify-between gap-3 sm:col-span-2 sm:flex-col sm:items-end">
                <span className="font-mono text-[11px] tracking-wide text-muted-foreground">{s.tag}</span>
                <ArrowUpRight className="size-6 text-muted-foreground transition duration-300 group-hover:rotate-45 group-hover:text-brand" />
              </div>
            </li>
          </BlurFade>
        ))}
      </ol>
    </Section>
  );
}

// ---- features -----------------------------------------------------------------------

function Features() {
  return (
    <Section id="features">
      <SectionHead
        index="02"
        eyebrow="Features"
        title={<>Everything Git gave code, <Em>now for an agent&apos;s mind.</Em></>}
        text="log · diff · checkout · blame · bisect · verify · forget — as an SDK, a CLI, and this app."
      />
      <BlurFade inView className="mt-20">
        <AgentBentoGrid className="max-w-none gap-3" />
      </BlurFade>
    </Section>
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
    <Section id="proof">
      <div className="grid items-start gap-16 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <BlurFade inView>
            <div className="label flex items-center gap-3"><span className="text-brand">[03]</span> Proof</div>
            <h2 className="mt-6 font-display text-[44px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[64px] lg:text-[80px]">
              Don&apos;t trust the agent. <Em>Verify it.</Em>
            </h2>
            <p className="mt-7 max-w-xl text-[18px] leading-[1.65] text-foreground/70">
              When an agent moves money or raises an alarm, Engram shows exactly which memory it acted on — and that nobody changed that memory afterwards.
            </p>
          </BlurFade>
          <BlurFade inView delay={0.1} className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border text-[14px]">
            {[
              { icon: FileCheck2, t: "Signed receipts" },
              { icon: GitCommitHorizontal, t: "Hash-linked commits" },
              { icon: ShieldCheck, t: "Anchored on Sui" },
              { icon: Eraser, t: "Provable forgetting" },
            ].map((p) => (
              <div key={p.t} className="flex items-center gap-3 bg-background px-5 py-5 text-foreground/90 transition hover:bg-surface-2">
                <p.icon className="size-[18px] text-brand" /> {p.t}
              </div>
            ))}
          </BlurFade>
        </div>

        {/* A paper receipt: the proof chain, printed. */}
        <BlurFade inView delay={0.15} className="lg:col-span-6">
          <div className="relative mx-auto max-w-[520px] rotate-[1.2deg] rounded-[6px] bg-bone px-7 pt-8 pb-10 font-mono text-ink shadow-[0_60px_120px_-40px_rgba(212,255,58,0.35)] transition duration-500 hover:rotate-0">
            <div className="flex items-start justify-between text-[11px] tracking-[0.14em] uppercase">
              <div>
                <div className="font-display text-[26px] font-bold tracking-[-0.04em] normal-case">engram</div>
                <div className="mt-1 opacity-60">proof of decision</div>
              </div>
              <div className="text-right opacity-60">
                <div>r_5080ccb4</div>
                <div>checkpoint 397,926,925</div>
              </div>
            </div>
            <div className="my-5 border-t-2 border-dashed border-ink/25" />
            <ol className="space-y-4">
              {CHAIN.map((c, i) => (
                <li key={c.k} className="flex gap-4">
                  <span className="text-[11px] opacity-50">0{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3 text-[13px] font-semibold tracking-wide uppercase">
                      {c.k}
                      <span className="flex-1 translate-y-[-3px] border-b border-dotted border-ink/30" />
                      <span className="rounded-sm bg-ink px-1.5 py-0.5 text-[10px] text-brand">OK</span>
                    </div>
                    <div className="mt-1 font-sans text-[13px] leading-snug opacity-70">{c.v}</div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="my-5 border-t-2 border-dashed border-ink/25" />
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[11px] tracking-[0.14em] uppercase opacity-60">verdict</div>
                <div className="font-display text-[40px] leading-none font-bold tracking-[-0.04em]">VALID</div>
              </div>
              {/* barcode */}
              <div className="flex h-12 items-end gap-[2px]" aria-hidden>
                {Array.from({ length: 34 }, (_, i) => (
                  <span key={i} className="bg-ink" style={{ width: (i * 7) % 3 === 0 ? 3 : 1, height: "100%" }} />
                ))}
              </div>
            </div>
            {/* torn edge */}
            <div className="absolute inset-x-0 -bottom-[9px] h-[10px] bg-[linear-gradient(135deg,var(--color-bone)_50%,transparent_50%),linear-gradient(225deg,var(--color-bone)_50%,transparent_50%)] bg-[length:14px_14px]" />
          </div>
        </BlurFade>
      </div>
    </Section>
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
    <Section id="story">
      <SectionHead
        index="04"
        eyebrow="The money-ops agent"
        title={<>Same agent, same code. <Em>Only its memory changed.</Em></>}
        text="A wallet watcher with Engram memory, run on real Sui transfers between five wallets. Watch how many it alerts on as it learns its owner."
      />
      <div className="mt-20 grid overflow-hidden rounded-2xl border border-border md:grid-cols-4">
        {PHASES.map((p, i) => (
          <BlurFade key={p.label} delay={0.08 * i} inView className="h-full">
            <div className="flex h-full flex-col border-b border-border p-7 transition hover:bg-surface-1 md:border-r md:border-b-0">
              <div className="flex items-center justify-between">
                <span className="label">{p.label}</span>
                {p.alerts > 0 ? <BellRing className="size-4 text-brand-2" /> : <BellOff className="size-4 text-brand" />}
              </div>
              <div className="mt-8 flex h-20 items-end gap-1.5">
                {Array.from({ length: p.total }, (_, j) => (
                  <motion.span
                    key={j}
                    initial={{ height: 0 }}
                    whileInView={{ height: j < p.alerts ? 76 : 26 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.15 + j * 0.06, type: "spring", stiffness: 140, damping: 16 }}
                    className={cn("w-3.5 rounded-[3px]", j < p.alerts ? "bg-brand-2" : "bg-brand")}
                  />
                ))}
              </div>
              <div className="mt-7 flex items-baseline gap-2">
                <span className="font-display text-[52px] leading-none font-semibold tracking-[-0.05em] tabular-nums">{p.alerts}/{p.total}</span>
                <span className="text-[13px] text-muted-foreground">alerted</span>
              </div>
              <p className="mt-4 text-[14px] leading-[1.6] text-foreground/65">{p.note}</p>
            </div>
          </BlurFade>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-[13px] text-muted-foreground">
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-2"><span className="size-2.5 rounded-[2px] bg-brand-2" /> alert raised</span>
          <span className="flex items-center gap-2"><span className="size-2.5 rounded-[2px] bg-brand" /> stayed quiet</span>
        </div>
        {(hasDemo || mode === "local") && (
          <Link to={mode === "local" ? "/app" : "/demo"} className="group inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-[14px] text-foreground transition hover:border-brand hover:text-brand">
            Open this agent&apos;s real memory <ArrowUpRight className="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        )}
      </div>
    </Section>
  );
}

// ---- developers ------------------------------------------------------------------------

const DEV_CARDS = [
  {
    icon: Terminal2,
    title: "CLI",
    text: "git for your agent's mind: commit, log, diff, blame, bisect, verify, forget, audit.",
    code: `npx @rohankumar4179/engram init my-agent
engram observe -s user "rent is 450 on the 1st"
engram sleep && engram commit -m "week 1"
engram verify HEAD`,
  },
  {
    icon: Code2,
    title: "SDK",
    text: "Wrap the agent you already have: relevant beliefs in, a signed receipt out.",
    code: `import { engram } from "@rohankumar4179/engram-sdk";

const mind = engram({ agent: "money-ops" });
const agent = mind.wrap(myAgent);
await agent(tx);   // agent.lastReceipt → r_…`,
  },
  {
    icon: Plug,
    title: "MCP",
    text: "Give Claude Code, Cursor or Claude Desktop beliefs, blame, commit and verify as tools.",
    code: `{ "mcpServers": { "engram": {
  "command": "npx",
  "args": ["@rohankumar4179/engram", "mcp"]
} } }`,
  },
];

function Developers() {
  const origin = typeof location === "undefined" ? "https://engram.app" : location.origin;
  const [tab, setTab] = useState(0);
  const c = DEV_CARDS[tab]!;
  return (
    <Section id="developers">
      <SectionHead
        index="05"
        eyebrow="For developers"
        title={<>Bring your own agent. <Em>Keep its memory honest.</Em></>}
        text="The same engine as this app, as a CLI, a TypeScript SDK and an MCP server. Link any of them to your dashboard with your wallet."
      />
      <BlurFade inView className="mt-20 grid overflow-hidden rounded-2xl border border-border lg:grid-cols-12">
        <div className="border-b border-border lg:col-span-4 lg:border-r lg:border-b-0">
          {DEV_CARDS.map((d, i) => (
            <button key={d.title} type="button" onClick={() => setTab(i)} className={cn("group flex w-full items-start gap-4 border-b border-border p-6 text-left transition last:border-b-0", tab === i ? "bg-surface-2" : "hover:bg-surface-1")}>
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border transition", tab === i ? "border-brand bg-brand text-ink" : "border-border text-foreground/70")}><d.icon className="size-[18px]" /></span>
              <div>
                <div className="font-display text-[22px] font-semibold tracking-[-0.03em]">{d.title}</div>
                <div className="mt-1 text-[14px] leading-[1.55] text-foreground/65">{d.text}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="flex flex-col bg-surface-1 lg:col-span-8">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <span className="label">{c.title === "MCP" ? "mcp.json" : c.title === "SDK" ? "agent.ts" : "terminal"}</span>
            <span className="flex gap-1.5"><span className="size-2 rounded-full bg-foreground/15" /><span className="size-2 rounded-full bg-foreground/15" /><span className="size-2 rounded-full bg-foreground/15" /></span>
          </div>
          <motion.pre key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="min-h-[220px] flex-1 overflow-x-auto p-6 font-mono text-[13px] leading-[1.8] text-foreground/85">{c.code}</motion.pre>
        </div>
      </BlurFade>
      <BlurFade delay={0.15} inView>
        <div className="mt-4 flex flex-col items-start gap-4 rounded-2xl border border-brand/25 bg-brand/[0.05] p-6 sm:flex-row sm:items-center">
          <Link2 className="size-5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium">Link a CLI or SDK agent to your dashboard</div>
            <div className="mt-1 text-[13.5px] text-foreground/60">Approve with your Sui wallet. Every commit syncs; the server re-verifies signatures, Merkle roots and Sui anchors before showing it. Raw memories and keys never leave your machine.</div>
          </div>
          <code className="max-w-full overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] whitespace-nowrap text-foreground/85">npx @rohankumar4179/engram link --server {origin}</code>
        </div>
        <Link to="/docs" className="group mt-4 inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-[14px] transition hover:border-brand hover:text-brand">
          Read the integration docs <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
        </Link>
      </BlurFade>
    </Section>
  );
}

// ---- final CTA + footer ----------------------------------------------------------------

function FinalCta() {
  return (
    <section className="grain relative isolate overflow-hidden border-b border-border">
      <div className="bg-dots absolute inset-0 -z-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="pointer-events-none absolute -bottom-96 left-1/2 -z-10 h-[700px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(212,255,58,0.28),transparent)] blur-2xl" />
      <div className="mx-auto flex max-w-[1400px] flex-col items-center px-5 py-36 text-center sm:px-8 lg:py-48">
        <span className="label">[06] Start</span>
        <h2 className="mt-8 font-display text-[52px] leading-[0.92] font-semibold tracking-[-0.055em] sm:text-[88px] lg:text-[120px]">
          Give your agent
          <br />a memory <Em>it can prove.</Em>
        </h2>
        <p className="mt-8 max-w-xl text-[18px] leading-[1.6] text-foreground/70">Connect a Sui wallet. Your agent reads your real transactions through Tatum, learns from what you tell it, and commits every belief to Walrus and Sui.</p>
        <div className="mt-11">
          <WalletButton size="lg" />
        </div>
      </div>
    </section>
  );
}

const FOOTER_COLS: { title: string; links: { label: string; href: string; scroll?: boolean; route?: boolean }[] }[] = [
  { title: "Product", links: [{ label: "How it works", href: "#how", scroll: true }, { label: "Features", href: "#features", scroll: true }, { label: "Proof", href: "#proof", scroll: true }, { label: "Demo agent", href: "#story", scroll: true }] },
  { title: "Developers", links: [{ label: "CLI on npm", href: "https://www.npmjs.com/package/@rohankumar4179/engram" }, { label: "SDK on npm", href: "https://www.npmjs.com/package/@rohankumar4179/engram-sdk" }, { label: "Documentation", href: "/docs", route: true }, { label: "Source on GitHub", href: GITHUB }] },
  { title: "Built on", links: [{ label: "Walrus Memory", href: "https://docs.wal.app/walrus-memory/getting-started/what-is-walrus-memory.md" }, { label: "Tatum", href: "https://tatum.io" }, { label: "Sui", href: "https://sui.io" }] },
];

function Footer() {
  return (
    <footer className="relative overflow-hidden">
      <div className="mx-auto max-w-[1400px] px-5 pt-20 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Brand />
            <p className="mt-5 max-w-sm text-[15px] leading-[1.6] text-foreground/65">Versioned, provable, forgettable memory for AI agents. Memory on Walrus, proofs on Sui, chain reads through Tatum.</p>
            <a href={GITHUB} target="_blank" rel="noreferrer" className="group mt-7 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[14px] transition hover:border-brand hover:text-brand">
              <Github className="size-4" /> Star on GitHub <ArrowUpRight className="size-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.title} className="lg:col-span-2">
              <div className="label">{col.title}</div>
              <ul className="mt-5 space-y-3 text-[15px]">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.route ? (
                      <Link to={l.href} className="text-foreground/75 transition hover:text-brand">{l.label}</Link>
                    ) : l.scroll ? (
                      <button type="button" onClick={() => go(l.href)} className="text-foreground/75 transition hover:text-brand">{l.label}</button>
                    ) : (
                      <a href={l.href} target="_blank" rel="noreferrer" className="text-foreground/75 transition hover:text-brand">{l.label} <span className="text-muted-foreground">↗</span></a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex lg:col-span-1 lg:justify-end">
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex size-11 items-center justify-center rounded-full border border-border transition hover:border-brand hover:bg-brand hover:text-ink" aria-label="back to top">
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </div>
      {/* giant wordmark */}
      <div aria-hidden className="mt-16 overflow-hidden select-none">
        <div className="text-center font-display text-[27vw] leading-[0.78] font-bold tracking-[-0.07em] text-outline">engram</div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-5 py-6 text-[12.5px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© 2026 Engram · MIT licensed</span>
          <span>Built for the Tatum × Walrus Total Recall hackathon</span>
        </div>
      </div>
    </footer>
  );
}
