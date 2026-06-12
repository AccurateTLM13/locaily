const DEFAULT_ROLES = [
  "fast_worker",
  "default_worker",
  "reasoning_worker",
  "voice_worker"
];

function createModelRoleManager(config = {}) {
  const defaultModel = config.defaultModel || null;
  const baseRoles = normalizeRoleMap({
    fast_worker: defaultModel,
    default_worker: defaultModel,
    reasoning_worker: defaultModel,
    voice_worker: null,
    ...(config.roles || {})
  });
  const providerRoles = normalizeProviderRoles(config.providers || {});

  return {
    list(providerId = null) {
      return buildRoleList({
        providerId,
        baseRoles,
        providerRoles
      });
    },
    resolve(roleId, providerId = null) {
      const role = normalizeRoleId(roleId || "default_worker");
      const providerMap = providerId ? providerRoles[providerId] : null;
      const model = providerMap && Object.prototype.hasOwnProperty.call(providerMap, role)
        ? providerMap[role]
        : baseRoles[role];

      if (!Object.prototype.hasOwnProperty.call(baseRoles, role) && !(providerMap && Object.prototype.hasOwnProperty.call(providerMap, role))) {
        return {
          ok: false,
          role,
          model: null,
          error: {
            code: "MODEL_ROLE_NOT_FOUND",
            message: `Model role '${role}' is not configured.`,
            nextStep: "Use one of the roles returned by GET /models/roles."
          }
        };
      }

      if (!model) {
        return {
          ok: false,
          role,
          model: null,
          error: {
            code: "MODEL_ROLE_UNASSIGNED",
            message: `Model role '${role}' does not have a model assigned.`,
            nextStep: "Assign a model with POST /models/roles/set or choose another role."
          }
        };
      }

      return {
        ok: true,
        role,
        model
      };
    },
    clear({ role, provider = null }) {
      const roleId = normalizeRoleId(role);

      if (!roleId) {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "Role clear requires a role.",
            nextStep: "Send role to clear."
          }
        };
      }

      if (provider) {
        const providerId = String(provider).trim();
        if (providerRoles[providerId]) {
          providerRoles[providerId][roleId] = null;
        }
      } else if (Object.prototype.hasOwnProperty.call(baseRoles, roleId)) {
        baseRoles[roleId] = null;
      }

      return {
        ok: true,
        role: roleId,
        model: null,
        provider: provider || null
      };
    },
    set({ role, model, provider = null }) {
      const roleId = normalizeRoleId(role);

      if (!roleId) {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "Role update requires a role.",
            nextStep: "Send role and model fields."
          }
        };
      }

      if (typeof model !== "string" || !model.trim()) {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "Role update requires a non-empty model string.",
            nextStep: "Send the local model name to use for this role."
          }
        };
      }

      if (provider) {
        const providerId = String(provider).trim();
        providerRoles[providerId] = {
          ...(providerRoles[providerId] || {}),
          [roleId]: model.trim()
        };
      } else {
        baseRoles[roleId] = model.trim();
      }

      return {
        ok: true,
        role: roleId,
        model: model.trim(),
        provider: provider || null
      };
    }
  };
}

function buildRoleList({ providerId, baseRoles, providerRoles }) {
  const providerMap = providerId ? providerRoles[providerId] || {} : {};
  const roleIds = Array.from(new Set([
    ...DEFAULT_ROLES,
    ...Object.keys(baseRoles),
    ...Object.keys(providerMap)
  ]));

  return roleIds.map((role) => ({
    role,
    label: labelForRole(role),
    model: Object.prototype.hasOwnProperty.call(providerMap, role) ? providerMap[role] : baseRoles[role] || null,
    provider: providerId || null
  }));
}

function normalizeRoleMap(roles) {
  const normalized = {};

  for (const [role, model] of Object.entries(roles || {})) {
    normalized[normalizeRoleId(role)] = typeof model === "string" && model.trim() ? model.trim() : null;
  }

  return normalized;
}

function normalizeProviderRoles(providers) {
  const normalized = {};

  for (const [providerId, roles] of Object.entries(providers || {})) {
    normalized[providerId] = normalizeRoleMap(roles);
  }

  return normalized;
}

function normalizeRoleId(role) {
  return typeof role === "string" ? role.trim() : "";
}

function labelForRole(role) {
  return role
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

module.exports = {
  DEFAULT_ROLES,
  createModelRoleManager
};
