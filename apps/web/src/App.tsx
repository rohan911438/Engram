import { Navigate, Route, Routes, useOutletContext } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout, type AppContext } from "@/pages/app-layout";
import { DashboardPage } from "@/pages/dashboard";
import { HomePage } from "@/pages/home";
import { MemoryPage } from "@/pages/memory";
import { HistoryView } from "@/views/history";
import { MindView } from "@/views/mind";
import { ReceiptsView } from "@/views/receipts";
import { useApi } from "@/lib/use-api";
import { api } from "@/lib/api";

function Mind() {
  const { data } = useApi(() => api.summary(), []);
  return data ? <MindView agent={data.agent} /> : null;
}
function History() {
  const ctx = useOutletContext<AppContext>();
  return <HistoryView onOpenBelief={ctx.openBelief} />;
}
function Receipts() {
  const ctx = useOutletContext<AppContext>();
  return <ReceiptsView onOpenBelief={ctx.openBelief} />;
}

function agentRoutes() {
  return (
    <>
      <Route index element={<DashboardPage />} />
      <Route path="mind" element={<Mind />} />
      <Route path="memory" element={<MemoryPage />} />
      <Route path="history" element={<History />} />
      <Route path="receipts" element={<Receipts />} />
    </>
  );
}

export default function App() {
  return (
    <TooltipProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/app" element={<AppLayout kind="app" />}>{agentRoutes()}</Route>
        <Route path="/demo" element={<AppLayout kind="demo" />}>{agentRoutes()}</Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TooltipProvider>
  );
}
