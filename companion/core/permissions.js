const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { dirname } = require("node:path");

const DEFAULT_APPROVED_PERMISSIONS = ["model.run"];
const DEFAULT_DENIED_PERMISSIONS = [
  "file.delete",
  "file.write",
  "network.send",
  "browser.write",
  "memory.delete"
];

function createPermissionManager(options = {}) {
  const filePath = options.filePath || null;
  const storedState = filePath ? readPermissionState(filePath) : {};
  const state = {
    approved: new Set([
      ...DEFAULT_APPROVED_PERMISSIONS,
      ...normalizeStringArray(options.approved),
      ...normalizeStringArray(storedState.approved)
    ]),
    denied: new Set([
      ...DEFAULT_DENIED_PERMISSIONS,
      ...normalizeStringArray(options.denied),
      ...normalizeStringArray(storedState.denied)
    ])
  };

  return {
    check({ tool, requestedPermissions = null }) {
      return checkToolPermissions({
        tool,
        requestedPermissions,
        approved: state.approved,
        denied: state.denied
      });
    },
    list() {
      return {
        approved: Array.from(state.approved).sort(),
        denied: Array.from(state.denied).sort()
      };
    },
    approve(permission) {
      const normalized = normalizePermission(permission);

      if (!normalized) {
        return false;
      }

      state.denied.delete(normalized);
      state.approved.add(normalized);
      persist(filePath, state);
      return true;
    },
    deny(permission) {
      const normalized = normalizePermission(permission);

      if (!normalized) {
        return false;
      }

      state.approved.delete(normalized);
      state.denied.add(normalized);
      persist(filePath, state);
      return true;
    }
  };
}

function checkToolPermissions({ tool, requestedPermissions = null, approved, denied }) {
  const declared = normalizeStringArray(tool && tool.permissions);
  const requested = requestedPermissions
    ? normalizeStringArray(requestedPermissions)
    : declared;
  const undeclared = requested.filter((permission) => !declared.includes(permission));

  if (undeclared.length > 0) {
    return {
      ok: false,
      code: "PERMISSION_DENIED",
      message: "Tool requested permissions it does not declare.",
      nextStep: "Update the tool definition to declare required permissions before requesting them.",
      permissions_used: [],
      denied: undeclared,
      undeclared
    };
  }

  const blocked = requested.filter((permission) => denied.has(permission) || !approved.has(permission));

  if (blocked.length > 0) {
    return {
      ok: false,
      code: "PERMISSION_DENIED",
      message: "Tool permission is not approved.",
      nextStep: "Approve the required permission before running this tool.",
      permissions_used: [],
      denied: blocked,
      undeclared: []
    };
  }

  return {
    ok: true,
    permissions_used: requested,
    denied: [],
    undeclared: []
  };
}

function readPermissionState(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    return {};
  }
}

function persist(filePath, state) {
  if (!filePath) {
    return;
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify({
    approved: Array.from(state.approved).sort(),
    denied: Array.from(state.denied).sort()
  }, null, 2));
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map(normalizePermission).filter(Boolean)
    : [];
}

function normalizePermission(permission) {
  return typeof permission === "string" && permission.trim() ? permission.trim() : null;
}

module.exports = {
  DEFAULT_APPROVED_PERMISSIONS,
  DEFAULT_DENIED_PERMISSIONS,
  createPermissionManager,
  checkToolPermissions
};
