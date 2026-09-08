import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AdminGate } from "@/components/AdminGate";
import { OverviewPage } from "@/pages/OverviewPage";
import { LoginPage } from "@/pages/LoginPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { DeskPage } from "@/pages/DeskPage";
import { ResultsPage } from "@/pages/ResultsPage";
import { SetupPage } from "@/pages/SetupPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { ComparePage } from "@/pages/ComparePage";
import { LiveDesk } from "@/pages/LiveDesk";
import { SettingsPage } from "@/pages/Settings";
import { AdminHome } from "@/pages/Admin/AdminHome";
import { AdminUsers } from "@/pages/Admin/AdminUsers";
import { AdminKeys } from "@/pages/Admin/AdminKeys";
import { AdminOperator } from "@/pages/Admin/AdminOperator";
import { AuditPage } from "@/pages/Admin/AuditPage";

/** Dynamic desk surfaces — `/:env/:lane` (sim|demo × a|b). */
function deskSurfaceRoutes() {
  return (
    <>
      <Route path="/:env/:lane" element={<DeskPage />} />
      <Route path="/:env/:lane/" element={<DeskPage />} />
      <Route path="/:env/:lane/results" element={<ResultsPage />} />
      <Route path="/:env/:lane/results/" element={<ResultsPage />} />
      <Route path="/:env/:lane/setup" element={<SetupPage />} />
      <Route path="/:env/:lane/setup/" element={<SetupPage />} />
      <Route path="/:env/:lane/runs" element={<ReportsPage />} />
      <Route path="/:env/:lane/runs/" element={<ReportsPage />} />
      <Route path="/:env/:lane/compare" element={<ComparePage />} />
      <Route path="/:env/:lane/compare/" element={<ComparePage />} />
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/" element={<LoginPage />} />

      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/overview/" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/overview/" element={<OverviewPage />} />
        <Route
          path="/overview/strategies"
          element={<PlaceholderPage title="Strategies" />}
        />
        <Route
          path="/overview/strategies/"
          element={<PlaceholderPage title="Strategies" />}
        />
        <Route
          path="/overview/roadmaps"
          element={<PlaceholderPage title="Roadmaps" />}
        />
        <Route
          path="/overview/roadmaps/"
          element={<PlaceholderPage title="Roadmaps" />}
        />
        <Route path="/status" element={<PlaceholderPage title="Status" />} />
        <Route path="/status/" element={<PlaceholderPage title="Status" />} />
        <Route
          path="/audit"
          element={<AuditPage />}
        />
        <Route
          path="/audit/"
          element={<AuditPage />}
        />

        <Route path="/account/password" element={<SettingsPage />} />
        <Route path="/account/password/" element={<SettingsPage />} />

        <Route element={<AdminGate />}>
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/admin/" element={<AdminHome />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/users/" element={<AdminUsers />} />
          <Route path="/admin/keys" element={<AdminKeys />} />
          <Route path="/admin/keys/" element={<AdminKeys />} />
          <Route path="/admin/operator" element={<AdminOperator />} />
          <Route path="/admin/operator/" element={<AdminOperator />} />
          <Route path="/admin/audit" element={<AuditPage />} />
          <Route path="/admin/audit/" element={<AuditPage />} />
        </Route>

        <Route path="/live" element={<LiveDesk />} />
        <Route path="/live/" element={<LiveDesk />} />

        {deskSurfaceRoutes()}
        <Route path="*" element={<PlaceholderPage title="Not found" />} />
      </Route>
    </Routes>
  );
}
