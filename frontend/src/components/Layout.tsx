import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import {
  NotificationToasts,
  useNotifications,
} from "@/components/layout";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { useAuthSession } from "@/hooks/useAuthSession";

export function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const { signedIn } = useAuthSession();
  const { toasts, dismiss } = useNotifications({ enabled: signedIn });

  useEffect(() => {
    document.body.classList.toggle("shell-nav-open", navOpen);
    return () => {
      document.body.classList.remove("shell-nav-open");
    };
  }, [navOpen]);

  return (
    <div className="flex min-h-screen" data-shell="workspace">
      <div
        id="appSidebarBackdrop"
        className="app-sidebar-backdrop fixed inset-0 z-30 bg-black/50"
        hidden={!navOpen}
        onClick={() => setNavOpen(false)}
        aria-hidden={navOpen ? "false" : "true"}
      />
      <Sidebar
        open={navOpen}
        onNavigate={() => setNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          menuOpen={navOpen}
          onMenuClick={() => setNavOpen((v) => !v)}
        />
        <main className="flex-1 px-4 py-5 md:px-6">
          <Outlet />
        </main>
      </div>
      <NotificationToasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
