export type ExecutionEnv = "sim" | "demo" | "live";
export type Lane = "a" | "b";

export type DatasetScope =
  | { execution_env: "live"; lane: null; scope_key: "live" }
  | { execution_env: "sim" | "demo"; lane: Lane; scope_key: `${"sim" | "demo"}|${Lane}` };

export type DeskAccent = "live" | "a" | "b";

export type NavPage = {
  id: string;
  kind: "page";
  label: string;
  href: string;
  icon: string;
  exact?: boolean;
  accent: DeskAccent;
};

export type NavGroup = {
  id: string;
  kind: "group" | "home" | "utility";
  label: string;
  href: string;
  icon: string;
  accent: DeskAccent;
  children: readonly NavPage[];
};

export type OperationalDesk = {
  id: string;
  execution_env: ExecutionEnv;
  lane: Lane | null;
  scope_key: string;
  label: string;
  icon: string;
  accent: DeskAccent;
};
