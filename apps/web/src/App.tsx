import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useOutletContext } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout, type AppContext } from "@/pages/app-layout";
import { useApi } from "@/lib/use-api";
import { api } from "@/lib/api";

// Each page is its own chunk: the homepage doesn't download the graph library, and so on.
const HomePage = lazy(() => import("@/pages/home").then((m) => ({ default: m.HomePage })));
const DashboardPage = lazy(() => import("@/pages/dashboard").then((m) => ({ default: m.DashboardPage })));
const MemoryPage = lazy(() => import("@/pages/memory").then((m) => ({ default: m.MemoryPage })));
const HistoryView = lazy(() => import("@/views/history").then((m) => ({ default: m.HistoryView })));
const MindView = lazy(() => import("@/views/mind").then((m) => ({ default: m.MindView })));
const DocsPage = lazy(() => import("@/pages/docs").then((m) => ({ default: m.DocsPage })));
const LinkPage = lazy(() => import("@/pages/link").then((m) => ({ default: m.LinkPage })));
const ReceiptsView = lazy(() => import("@/views/receipts").then((m) => ({ default: m.ReceiptsView })));

const Loading = () => <div className="h-64 animate-pulse rounded-3xl bg-surface-1" />;

function Mind() {
  const { data } = useApi(() => api.summary(), []);
  return data ? <MindView agent={data.agent} /> : <Loading />;
}

function PageHead({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mb-8">
      <div className="label"><span className="text-brand">●</span> {eyebrow}</div>
      <h1 className="mt-2 font-display text-5xl font-semibold tracking-[-0.05em]">{title}<span className="text-brand">.</span></h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function History() {
  const ctx = useOutletContext<AppContext>();
  return (
    <>
      <PageHead eyebrow="commits" title="History" text="Every signed snapshot of the agent's beliefs, hash-linked and anchored on Sui. Open one to verify it end to end." />
      <HistoryView onOpenBelief={ctx.openBelief} />
    </>
  );
}
function Receipts() {
  const ctx = useOutletContext<AppContext>();
  return (
    <>
      <PageHead eyebrow="decisions" title="Receipts" text="Each decision the agent made, signed, with Merkle proofs for the exact beliefs it used." />
      <ReceiptsView onOpenBelief={ctx.openBelief} />
    </>
  );
}

const page = (el: React.ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

function agentRoutes() {
  return (
    <>
      <Route index element={page(<DashboardPage />)} />
      <Route path="mind" element={page(<Mind />)} />
      <Route path="memory" element={page(<MemoryPage />)} />
      <Route path="history" element={page(<History />)} />
      <Route path="receipts" element={page(<Receipts />)} />
    </>
  );
}

export default function App() {
  return (
    <TooltipProvider>
      <Routes>
        <Route path="/" element={<Suspense fallback={<div className="min-h-svh bg-background" />}><HomePage /></Suspense>} />
        <Route path="/docs" element={<Suspense fallback={<div className="min-h-svh bg-background" />}><DocsPage /></Suspense>} />
        <Route path="/link" element={<Suspense fallback={<div className="min-h-svh bg-background" />}><LinkPage /></Suspense>} />
        <Route path="/app/linked/:id" element={<AppLayout kind="linked" />}>{agentRoutes()}</Route>
        <Route path="/app" element={<AppLayout kind="app" />}>{agentRoutes()}</Route>
        <Route path="/demo" element={<AppLayout kind="demo" />}>{agentRoutes()}</Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TooltipProvider>
  );
}
