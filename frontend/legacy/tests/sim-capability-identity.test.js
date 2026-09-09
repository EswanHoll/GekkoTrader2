const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const path = require("node:path");

const capabilityPath = path.join(__dirname, "..", "sim-capability.js");
const originalWindow = global.window;
const originalCapability = global.GekkoSimCapability;

function superAdminSession() {
  return {
    token: "test-login-token",
    user: { role: "super_admin" },
  };
}

function loadCapability({ session = superAdminSession(), operator = {} } = {}) {
  global.window = {
    GekkoAuth: { getSession: async () => session },
    GekkoOperator: operator,
  };
  delete require.cache[require.resolve(capabilityPath)];
  return require(capabilityPath);
}

afterEach(() => {
  delete require.cache[require.resolve(capabilityPath)];
  if (originalWindow === undefined) delete global.window;
  else global.window = originalWindow;
  if (originalCapability === undefined) delete global.GekkoSimCapability;
  else global.GekkoSimCapability = originalCapability;
});

test("GST-105 — super_admin alone unlocks writes without a control token", async () => {
  let renewals = 0;
  const Capability = loadCapability({
    operator: {
      getSessionToken: () => "",
      ensureWriteSession: async () => {
        renewals += 1;
        return { active: false, error: "legacy remint failed" };
      },
    },
  });

  const result = await Capability.assertCommandIdentity();

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.control_token, "");
  assert.equal(renewals, 1);
  assert.doesNotMatch(String(result.detail || ""), /Admin → Keys/);
});

test("best-effort remints a control token when available (legacy routes)", async () => {
  let control = "";
  const Capability = loadCapability({
    operator: {
      getSessionToken: () => control,
      ensureWriteSession: async () => {
        control = "renewed-control-token";
        return { active: true, ttl_remaining: 300 };
      },
    },
  });

  const result = await Capability.assertCommandIdentity();

  assert.equal(result.ok, true);
  assert.equal(result.control_token, "renewed-control-token");
});

test("never tries to restore a control session for a non-super-admin account", async () => {
  let renewals = 0;
  const Capability = loadCapability({
    session: { token: "test-login-token", user: { role: "view_only" } },
    operator: {
      getSessionToken: () => "",
      hasDeviceSecret: () => true,
      ensureWriteSession: async () => {
        renewals += 1;
        return { active: true };
      },
    },
  });

  const result = await Capability.assertCommandIdentity();

  assert.equal(renewals, 0);
  assert.deepEqual(result, {
    ok: false,
    status: 403,
    detail: "Super admin role required for settings/run commands",
  });
});

test("requires a signed-in session", async () => {
  const Capability = loadCapability({
    session: null,
    operator: {
      ensureWriteSession: async () => ({ active: true }),
    },
  });
  const result = await Capability.assertCommandIdentity();
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});
