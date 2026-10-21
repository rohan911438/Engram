import { useEffect, useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { ArrowRight, BellOff, BellRing, Brain, Eraser, FileCheck2, GitCommitHorizontal, Lock, Radio, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { GithubLogo as Github } from "@phosphor-icons/react";
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
    <div className="relative min-h-screen overflow-x-hidden bg-black text-foreground">
      <Nav />
      <Hero />
      <LiveStrip />
      <HowItWorks />
      <Features />
      <Proof />
      <Story />
      <FinalCta />
      <Footer />
    </div>
  );
}

// ---- nav --------------------------------------------------------------------

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 border-b transition-all duration-300", scrolled ? "border-white/[0.07] bg-black/80 backdrop-blur-xl" : "border-transparent bg-gradient-to-b from-black/60 to-transparent")}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Brand />
        <div className="hidden md:block">
          <SpotlightNavbar
            items={[
              { label: "How it works", href: "#how" },
              { label: "Features", href: "#features" },
              { label: "Proof", href: "#proof" },
              { label: "Demo", href: "#story" },
            ]}
            onItemClick={(item) => document.querySelector(item.href)?.scrollIntoView({ behavior: "smooth" })}
          />
        </div>
        <div className="flex items-center gap-2">
          <a href={GITHUB} target="_blank" rel="noreferrer" className="hidden size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/5 hover:text-foreground sm:flex" aria-label="GitHub">
            <Github className="size-4.5" />
          </a>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

// ---- hero -------------------------------------------------------------------

const VERIFY_LINES: { mark: "ok" | "dim" | "head"; text: string; detail?: string }[] = [
  { mark: "head", text: "$ engram verify r_787dace2" },
  { mark: "ok", text: "receipt signature", detail: "ALERT[critical] 250 USDC → 0x9bad… · signed by agent" },
  { mark: "ok", text: "belief proofs", detail: "b_scam_address_flag@1 ∈ commit 31f306ab" },
  { mark: "ok", text: "merkle root", detail: "5 beliefs + 0 tombstones → 247af223…" },
  { mark: "ok", text: "history", detail: "2 earlier commits, signed + hash-linked" },
  { mark: "ok", text: "walrus", detail: "manifest recalled from Walrus Memory" },
  { mark: "ok", text: "sui anchor", detail: "certified · checkpoint 336,516,038 · via Tatum" },
];

function Terminal() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= VERIFY_LINES.length + 1) {
      const t = setTimeout(() => setN(0), 4200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setN((x) => x + 1), n === 0 ? 900 : 420);
    return () => clearTimeout(t);
  }, [n]);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#07070a]/90 shadow-[0_30px_120px_-30px_rgba(124,92,255,0.45)] backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
        <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
        <span className="size-2.5 rounded-full bg-[#28c840]/80" />
        <span className="ml-3 font-mono text-[11px] text-muted-foreground">money-ops — verify a decision</span>
      </div>
      <div className="min-h-[268px] space-y-1.5 p-5 font-mono text-[12.5px] leading-relaxed">
        {VERIFY_LINES.slice(0, n).map((l, i) =>
          l.mark === "head" ? (
            <div key={i} className="text-foreground">{l.text}</div>
          ) : (
            <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-3">
              <span className="text-emerald-400">✔</span>
              <span className="w-32 shrink-0 text-foreground/90">{l.text}</span>
              <span className="truncate text-muted-foreground">{l.detail}</span>
            </motion.div>
          ),
        )}
        {n > VERIFY_LINES.length - 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-3">
            <span className="rounded-md bg-emerald-400/15 px-2 py-0.5 font-semibold text-emerald-300">VALID</span>
            <span className="ml-2 text-muted-foreground">this decision used exactly this memory — untampered.</span>
          </motion.div>
        )}
        {n < VERIFY_LINES.length && <span className="inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-white/70" />}
      </div>
      <BorderBeam size={120} duration={8} colorFrom="#a78bfa" colorTo="#67e8f9" />
    </div>
  );
}

function Hero() {
  const { hasDemo, mode } = useSession();
  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden pt-16">
      <div className="absolute inset-0 -z-10">
        <LightLines gradientFrom="#000000" gradientTo="#07051a" lineColor="#8b7cff" lightColor="#c4b5fd" linesOpacity={0.07} lightsOpacity={0.8} speedMultiplier={0.6} className="h-full w-full" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(124,92,255,0.28),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-b from-transparent to-black" />

      <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 pt-20 pb-24 lg:grid-cols-[1.05fr_1fr] lg:pt-28">
        <div>
          <BlurFade delay={0.05}>
            <a href="#proof" className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs backdrop-blur">
              <span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" /></span>
              <AnimatedShinyText className="mx-0 text-xs">Memory on Walrus · proofs on Sui · verified via Tatum</AnimatedShinyText>
              <ArrowRight className="size-3 text-muted-foreground transition group-hover:translate-x-0.5" />
            </a>
          </BlurFade>
          <BlurFade delay={0.15}>
            <h1 className="mt-7 text-5xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-6xl lg:text-[76px]">
              Git for your agent&apos;s{" "}
              <span className="bg-gradient-to-r from-[#c4b5fd] via-[#a78bfa] to-[#67e8f9] bg-clip-text text-transparent">memory</span>.
            </h1>
          </BlurFade>
          <BlurFade delay={0.25}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-balance">
              Engram turns what an AI agent sees into beliefs it can explain, version, prove and forget. Connect your Sui wallet and watch an agent learn your money habits — with every decision signed and anchored on-chain.
            </p>
          </BlurFade>
          <BlurFade delay={0.35}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <WalletButton size="lg" />
              {(hasDemo || mode === "local") && (
                <Link to={mode === "local" ? "/app" : "/demo"} className="inline-flex h-12 items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-6 text-[15px] font-medium backdrop-blur transition hover:bg-white/[0.07]">
                  <Sparkles className="size-4 text-[#a78bfa]" /> Explore the demo agent
                </Link>
              )}
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Sign-in is one free signature. No transaction, no gas, no funds moved.
            </p>
          </BlurFade>
        </div>
        <BlurFade delay={0.45} className="relative">
          <div className="absolute -inset-8 -z-10 rounded-[40px] bg-[radial-gradient(closest-side,rgba(103,232,249,0.14),transparent)]" />
          <Terminal />
        </BlurFade>
      </div>
    </section>
  );
}

// ---- live strip -------------------------------------------------------------

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
    { label: "Episodes remembered", value: s?.episodes ?? 0 },
    { label: "Active beliefs", value: s?.beliefs ?? 0 },
    { label: "Signed commits", value: s?.commits ?? 0 },
    { label: "Provable decisions", value: s?.receipts ?? 0 },
  ];
  return (
    <section className="relative border-y border-white/[0.06] bg-[#050507]">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-6 px-6 py-10 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((it) => (
          <div key={it.label} className="px-2">
            <div className="text-3xl font-semibold tracking-tight tabular-nums">{s ? <NumberTicker value={it.value} className="text-foreground" /> : "—"}</div>
            <div className="mt-1 text-xs text-muted-foreground">{it.label}</div>
          </div>
        ))}
        <div className="col-span-2 px-2 sm:col-span-1">
          <div className="flex items-center gap-2 font-mono text-lg tabular-nums">
            <Radio className="size-4 animate-pulse text-emerald-400" />
            {s?.suiCheckpoint ? Number(s.suiCheckpoint).toLocaleString("en-US") : "—"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Sui checkpoint · live via Tatum</div>
        </div>
      </div>
    </section>
  );
}

// ---- how it works -----------------------------------------------------------

const STEPS = [
  { icon: Wallet, title: "Observe", text: "Every wallet event and every word you tell it becomes an episode — encrypted with its own key and stored on Walrus Memory.", tag: "AES-256-GCM · Walrus" },
  { icon: Brain, title: "Sleep", text: "The agent consolidates episodes into beliefs with confidence and evidence, and revises them when you correct it.", tag: "LLM, grounded in episode IDs" },
  { icon: GitCommitHorizontal, title: "Commit", text: "Beliefs are snapshotted into a Merkle root, signed by the agent and anchored on Sui. History you can diff, blame and bisect.", tag: "Ed25519 · Merkle · Sui" },
  { icon: ShieldCheck, title: "Prove", text: "Each decision carries a signed receipt naming the exact beliefs it used. Anyone can verify it end to end through Tatum.", tag: "Receipts · Tatum Sui RPC" },
];

function HowItWorks() {
  return (
    <section id="how" className="relative mx-auto max-w-7xl px-6 py-28">
      <SectionHead eyebrow="How it works" title="A memory that learns — and can prove what it knew." text="Four steps turn a black-box agent into one you can audit. They run on real data: your wallet, your words, real chain state." />
      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <BlurFade key={s.title} delay={0.08 * i} inView>
            <GlowBorderCard width="100%" aspectRatio="auto" height="100%" colorPreset="custom" gradientColors={["#5b3df5", "#7c5cff", "#a78bfa", "#67e8f9", "#22d3ee", "#7c5cff", "#5b3df5"]} borderRadius="1.1rem" animationDuration={6 + i} borderWidth="0.6em" blurAmount="0.5em" inset="-0.4em" className="h-full bg-transparent dark:bg-transparent" contentClassName="p-[1.5px] items-stretch">
              <div className="flex h-full min-h-[250px] w-full flex-col rounded-[calc(1.1rem-1.5px)] bg-[#060608] p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"><s.icon className="size-5 text-[#c4b5fd]" /></span>
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                <div className="mt-auto pt-5 font-mono text-[11px] text-[#a78bfa]/80">{s.tag}</div>
              </div>
            </GlowBorderCard>
          </BlurFade>
        ))}
      </div>
    </section>
  );
}

// ---- features -----------------------------------------------------------------

function Features() {
  return (
    <section id="features" className="relative border-t border-white/[0.06] bg-[#030304] py-28">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_0%,rgba(103,232,249,0.08),transparent)]" />
      <div className="relative mx-auto max-w-7xl px-6">
        <SectionHead eyebrow="Features" title="Everything Git gave code — now for an agent's mind." text="log · diff · checkout · blame · bisect · verify · forget. As an SDK, a CLI, and this app." />
        <div className="mt-14">
          <AgentBentoGrid className="max-w-none gap-3" />
        </div>
      </div>
    </section>
  );
}

// ---- proof ----------------------------------------------------------------------

const CHAIN = [
  { k: "Receipt", v: "Ed25519 signature over the decision and the beliefs it used" },
  { k: "Merkle proof", v: "Each belief is proven to be inside the commit's root" },
  { k: "Commit", v: "Signed manifest, hash-linked to its parent — history can't be rewritten" },
  { k: "Walrus", v: "Manifest stored and recalled from Walrus Memory" },
  { k: "Sui", v: "Anchor re-read through Tatum's Sui RPC: object, certification, checkpoint, time" },
];

function Proof() {
  return (
    <section id="proof" className="relative mx-auto grid max-w-7xl items-center gap-16 px-6 py-28 lg:grid-cols-2">
      <div>
        <SectionHead align="left" eyebrow="Proof" title="Don't trust the agent. Verify it." text="When an agent moves money or raises an alarm, Engram can show exactly which memory it acted on — and that nobody changed that memory afterwards." />
        <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
          <Pill icon={FileCheck2} text="Signed receipts" />
          <Pill icon={GitCommitHorizontal} text="Hash-linked commits" />
          <Pill icon={ShieldCheck} text="Anchored on Sui" />
          <Pill icon={Eraser} text="Provable forgetting" />
        </div>
      </div>
      <ol className="relative space-y-3">
        <div className="absolute top-6 bottom-6 left-[19px] w-px bg-gradient-to-b from-[#a78bfa]/60 via-[#67e8f9]/40 to-emerald-400/60" />
        {CHAIN.map((c, i) => (
          <BlurFade key={c.k} delay={0.07 * i} inView>
            <li className="relative flex gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 backdrop-blur transition hover:border-white/15 hover:bg-white/[0.04]">
              <span className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black font-mono text-xs text-[#c4b5fd]">{i + 1}</span>
              <div>
                <div className="font-medium">{c.k}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">{c.v}</div>
              </div>
              <span className="ml-auto self-center text-emerald-400">✔</span>
            </li>
          </BlurFade>
        ))}
      </ol>
    </section>
  );
}

function Pill({ icon: Icon, text }: { icon: typeof Lock; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <Icon className="size-4 text-[#a78bfa]" /> {text}
    </div>
  );
}

// ---- story -----------------------------------------------------------------------

const PHASES = [
  { label: "July", note: "Knows nothing. Asks about everything.", alerts: 4, total: 4 },
  { label: "Aug – Sep", note: "Learned rent, salary, subscription, swaps. Stays quiet.", alerts: 0, total: 8 },
  { label: "October", note: "Rent rises → warn. 1,800 USDC to a stranger at 3 a.m. → critical.", alerts: 2, total: 2 },
  { label: "November", note: "New rent accepted. Scam address caught from memory.", alerts: 1, total: 2 },
];

function Story() {
  const { hasDemo, mode } = useSession();
  return (
    <section id="story" className="relative border-y border-white/[0.06] bg-[#040406] py-28">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHead eyebrow="The money-ops agent" title="Watch an agent's behaviour change as it learns." text="A wallet watcher with Engram memory. Same agent, same code — the only thing that changes is what it remembers." />
        <div className="mt-14 grid gap-4 md:grid-cols-4">
          {PHASES.map((p, i) => (
            <BlurFade key={p.label} delay={0.08 * i} inView>
              <div className="h-full rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.035] to-transparent p-5">
                <div className="text-sm text-muted-foreground">{p.label}</div>
                <div className="mt-3 flex items-end gap-1.5">
                  {Array.from({ length: p.total }, (_, j) => (
                    <motion.span
                      key={j}
                      initial={{ height: 0 }}
                      whileInView={{ height: j < p.alerts ? 56 : 22 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.15 + j * 0.06, type: "spring", stiffness: 140, damping: 16 }}
                      className={cn("w-3 rounded-full", j < p.alerts ? "bg-gradient-to-t from-amber-500/60 to-amber-300" : "bg-gradient-to-t from-emerald-500/40 to-emerald-300/80")}
                    />
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 text-2xl font-semibold tabular-nums">
                  {p.alerts > 0 ? <BellRing className="size-5 text-amber-300" /> : <BellOff className="size-5 text-emerald-300" />}
                  {p.alerts}/{p.total}
                  <span className="text-sm font-normal text-muted-foreground">alerted</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.note}</p>
              </div>
            </BlurFade>
          ))}
        </div>
        {(hasDemo || mode === "local") && (
          <div className="mt-10 flex justify-center">
            <Link to={mode === "local" ? "/app" : "/demo"} className="group inline-flex items-center gap-2 text-sm text-[#c4b5fd] hover:text-white">
              Open this agent's real memory — beliefs, commits and receipts <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

// ---- final CTA + footer ------------------------------------------------------------

function FinalCta() {
  return (
    <section className="relative overflow-hidden">
      <AnimatedRays className="min-h-[520px]">
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 py-32 text-center">
          <h2 className="text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl">Give your agent a memory it can prove.</h2>
          <p className="mt-5 max-w-xl text-muted-foreground">Connect a Sui wallet. Your agent reads your real transactions through Tatum, learns from what you tell it, and commits every belief to Walrus and Sui.</p>
          <div className="mt-9">
            <WalletButton size="lg" />
          </div>
        </div>
      </AnimatedRays>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-black">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center">
        <div>
          <Brand />
          <p className="mt-3 text-xs text-muted-foreground">Built for the Tatum × Walrus Total Recall hackathon. MIT licensed.</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <a className="hover:text-foreground" href="https://docs.wal.app/walrus-memory/getting-started/what-is-walrus-memory.md" target="_blank" rel="noreferrer">Walrus Memory</a>
          <a className="hover:text-foreground" href="https://tatum.io" target="_blank" rel="noreferrer">Tatum</a>
          <a className="hover:text-foreground" href="https://sui.io" target="_blank" rel="noreferrer">Sui</a>
          <a className="hover:text-foreground" href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>
    </footer>
  );
}

function SectionHead({ eyebrow, title, text, align = "center" }: { eyebrow: string; title: string; text: string; align?: "center" | "left" }) {
  return (
    <BlurFade inView className={cn(align === "center" && "mx-auto max-w-3xl text-center")}>
      <div className="font-mono text-xs tracking-[0.2em] text-[#a78bfa] uppercase">{eyebrow}</div>
      <h2 className="mt-4 text-4xl leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-5xl">{title}</h2>
      <p className={cn("mt-5 text-lg leading-relaxed text-muted-foreground text-balance", align === "center" && "mx-auto max-w-2xl")}>{text}</p>
    </BlurFade>
  );
}
