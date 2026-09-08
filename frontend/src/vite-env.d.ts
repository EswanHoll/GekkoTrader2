/// <reference types="vite/client" />

interface GekkoControlConfigApi {
  MISSING_MSG: string;
  configuredUrl: () => string;
  mockEnabled: () => boolean;
  resolveControlBase: (opts?: { allowMockLocal?: boolean }) => string;
  isConfigured: () => boolean;
}

interface Window {
  GEKKO_API_URL?: string;
  GEKKO_UI_VERSION?: string;
  GEKKO_USE_MOCK_API?: boolean;
  GEKKO_SUPABASE_URL?: string;
  GEKKO_SUPABASE_ANON_KEY?: string;
  GEKKO_OPENING_BALANCE?: number;
  GekkoControlConfig?: GekkoControlConfigApi;
}
