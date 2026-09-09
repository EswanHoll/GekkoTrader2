import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DeskStatusChrome } from "@/components/desk";

type Props = {
  menuOpen?: boolean;
  onMenuClick?: () => void;
};

/** Sticky header — breadcrumbs + desk health chrome (GST-123 / GST-131). */
export function TopBar({ menuOpen = false, onMenuClick }: Props) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-gekko-border bg-gekko-bg/90 px-4 py-3 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="app-menu-trigger h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gekko-border text-white"
          aria-label="Open navigation"
          aria-expanded={menuOpen ? "true" : "false"}
          aria-controls="appSidebar"
          data-testid="app-menu-trigger"
          onClick={onMenuClick}
        >
          <span aria-hidden="true" className="flex w-4 flex-col gap-1">
            <span className="block h-0.5 w-full bg-current" />
            <span className="block h-0.5 w-full bg-current" />
            <span className="block h-0.5 w-full bg-current" />
          </span>
        </button>
        <Breadcrumbs />
      </div>
      <DeskStatusChrome />
    </header>
  );
}
