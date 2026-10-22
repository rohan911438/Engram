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
const LinkPage = lazy(() => import("@/pages/link").then((m) => ({ default: m.LinkPage })));
const ReceiptsView = lazy(() => import("@/views/receipts").then((m) => ({ default: m.ReceiptsView })));

const Loading = () => <div className="h-64 animate-pulse rounded-3xl bg-white/[0.03]" />;

function Mind() {
  const { data } = useApi(() => api.summary(), []);
  return data ? <MindView agent={data.agent} /> : <Loading />;
}
function History() {
  const ctx = useOutletContext<AppContext>();
  return <HistoryView onOpenBelief={ctx.openBelief} />;
}
function Receipts() {
  const ctx = useOutletContext<AppContext>();
  return <ReceiptsView onOpenBelief={ctx.openBelief} />;
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
        <Route path="/" element={<Suspense fallback={<div className="min-h-svh bg-black" />}><HomePage /></Suspense>} />
        <Route path="/link" element={<Suspense fallback={<div className="min-h-svh bg-black" />}><LinkPage /></Suspense>} />
        <Route path="/app/linked/:id" element={<AppLayout kind="linked" />}>{agentRoutes()}</Route>
        <Route path="/app" element={<AppLayout kind="app" />}>{agentRoutes()}</Route>
        <Route path="/demo" element={<AppLayout kind="demo" />}>{agentRoutes()}</Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TooltipProvider>
  );
}
