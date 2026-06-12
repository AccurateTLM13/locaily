const DEFAULT_ROLES = [
  "fast_worker",
  "default_worker",
  "reasoning_worker",
  "voice_worker"
];

const ROLE_SUITABILITY = {
  fast_worker: {
    label: "Fast Worker",
    strengths: [
      "classification",
      "simple_extraction",
      "routing_hints",
      "short_summaries"
    ],
    limitations: [
      "long_form_writing",
      "complex_reasoning"
    ],
    cost: "low"
  },
  default_worker: {
    label: "Default Worker",
    strengths: [
      "summaries",
      "rewrites",
      "structured_markdown",
      "general_tool_tasks"
    ],
    limitations: [
      "ambiguous_multi_step_planning"
    ],
    cost: "medium"
  },
  reasoning_worker: {
    label: "Reasoning Worker",
    strengths: [
      "multi_step_planning",
      "tool_routing",
      "failed_output_review",
      "logic_checks"
    ],
    limitations: [
      "latency",
      "memory_footprint"
    ],
    cost: "high"
  },
  voice_worker: {
    label: "Voice Worker",
    strengths: [
      "transcription",
      "voice_cleanup",
      "speech_to_text"
    ],
    limitations: [
      "not_implemented"
    ],
    cost: "medium"
  }
};

const DEFAULT_PROFILES = {
  lightweight: {
    id: "lightweight",
    label: "Lightweight",
    description: "One model loaded at a time with conservative memory limits.",
    policy: "single_loaded",
    max_auto_model_gb: 2.5,
    roles: {
      reasoning_worker: null,
      voice_worker: null
    },
    providers: {}
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    description: "Default model stays warm; specialists load on demand.",
    policy: "smart_load",
    max_auto_model_gb: 4,
    roles: {},
    providers: {}
  },
  developer: {
    id: "developer",
    label: "Developer",
    description: "Allows multiple warm models and heavier optional fallbacks.",
    policy: "multi_warm",
    max_auto_model_gb: 7,
    roles: {},
    providers: {}
  }
};

function createModelProfileManager(config = {}) {
  const defaultModel = config.defaultModel || null;
  let activeProfileId = normalizeProfileId(config.active || "balanced");
  const profiles = normalizeProfiles(config.profiles || {}, defaultModel);

  if (!profiles[activeProfileId]) {
    throw new Error(`Active model profile '${activeProfileId}' is not configured.`);
  }

  return {
    list() {
      return Object.values(profiles).map((profile) => toPublicProfile(
        profile,
        defaultModel,
        profile.id === activeProfileId
      ));
    },
    getActive() {
      return toPublicProfile(profiles[activeProfileId], defaultModel, true);
    },
    getRoleSuitability(roleId) {
      const role = normalizeRoleId(roleId);
      return ROLE_SUITABILITY[role] || null;
    },
    setActive(profileId) {
      const normalized = normalizeProfileId(profileId);

      if (!normalized) {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "Profile update requires a profile id.",
            nextStep: "Send profile or profile_id from GET /models/profiles."
          }
        };
      }

      if (!profiles[normalized]) {
        return {
          ok: false,
          error: {
            code: "PROFILE_NOT_FOUND",
            message: `Model profile '${normalized}' was not found.`,
            nextStep: "Use GET /models/profiles to list available profiles."
          }
        };
      }

      activeProfileId = normalized;

      return {
        ok: true,
        active_profile: normalized,
        profile: toPublicProfile(profiles[normalized], defaultModel, true)
      };
    },
    applyProfileRoles(roleManager, profileId = activeProfileId, providerIds = []) {
      const profile = profiles[normalizeProfileId(profileId) || activeProfileId];

      if (!profile) {
        return {
          ok: false,
          error: {
            code: "PROFILE_NOT_FOUND",
            message: `Model profile '${profileId}' was not found.`,
            nextStep: "Use GET /models/profiles to list available profiles."
          }
        };
      }

      const resolvedRoles = resolveProfileRoles(profile, defaultModel);
      const applied = [];
      const providersToSync = normalizeProviderIdList(providerIds, resolvedRoles.providers);

      for (const role of DEFAULT_ROLES) {
        const model = resolvedRoles.base[role] || null;

        if (model) {
          roleManager.set({ role, model });
          applied.push({ role, model, provider: null });
        } else if (profile.roles && Object.prototype.hasOwnProperty.call(profile.roles, role)) {
          roleManager.clear({ role });
          applied.push({ role, model: null, provider: null });
        }
      }

      for (const provider of providersToSync) {
        const providerRoleMap = resolvedRoles.providers[provider] || resolvedRoles.base;

        for (const role of DEFAULT_ROLES) {
          const model = providerRoleMap[role] || null;
          const profileProviderRoles = profile.providers && profile.providers[provider];
          const hasProviderOverride = profileProviderRoles
            && Object.prototype.hasOwnProperty.call(profileProviderRoles, role);
          const hasBaseOverride = profile.roles && Object.prototype.hasOwnProperty.call(profile.roles, role);

          if (model) {
            roleManager.set({ role, model, provider });
            applied.push({ role, model, provider });
          } else if (hasProviderOverride || (!profileProviderRoles && hasBaseOverride)) {
            roleManager.clear({ role, provider });
            applied.push({ role, model: null, provider });
          }
        }
      }

      return {
        ok: true,
        profile_id: profile.id,
        policy: profile.policy,
        max_auto_model_gb: profile.max_auto_model_gb,
        applied,
        active_provider: providersToSync[0] || null
      };
    },
    resolveActiveProfileId() {
      return activeProfileId;
    }
  };
}

function normalizeProfiles(overrides, defaultModel) {
  const merged = {};

  for (const [profileId, baseProfile] of Object.entries(DEFAULT_PROFILES)) {
    const override = overrides[profileId] || {};
    merged[profileId] = {
      ...baseProfile,
      ...override,
      id: profileId,
      roles: {
        ...baseProfile.roles,
        ...(override.roles || {})
      },
      providers: {
        ...baseProfile.providers,
        ...(override.providers || {})
      }
    };
  }

  for (const [profileId, override] of Object.entries(overrides)) {
    if (merged[profileId]) {
      continue;
    }

    merged[profileId] = {
      id: profileId,
      label: override.label || labelForProfile(profileId),
      description: override.description || "",
      policy: override.policy || "smart_load",
      max_auto_model_gb: typeof override.max_auto_model_gb === "number"
        ? override.max_auto_model_gb
        : 4,
      roles: normalizeRoleMap(override.roles || {}, defaultModel),
      providers: normalizeProviderRoles(override.providers || {}, defaultModel)
    };
  }

  return merged;
}

function resolveProfileRoles(profile, defaultModel) {
  const base = {};

  for (const role of DEFAULT_ROLES) {
    const model = resolveRoleModel(profile.roles, role, defaultModel);
    base[role] = model;
  }

  const providers = {};

  for (const [providerId, roleMap] of Object.entries(profile.providers || {})) {
    providers[providerId] = {};

    for (const role of DEFAULT_ROLES) {
      providers[providerId][role] = resolveRoleModel(roleMap, role, base[role] || defaultModel);
    }
  }

  return { base, providers };
}

function normalizeProviderIdList(providerIds, providerRoleMaps) {
  const normalized = new Set();

  if (typeof providerIds === "string" && providerIds.trim()) {
    normalized.add(providerIds.trim());
  } else if (Array.isArray(providerIds)) {
    for (const providerId of providerIds) {
      if (typeof providerId === "string" && providerId.trim()) {
        normalized.add(providerId.trim());
      }
    }
  }

  for (const providerId of Object.keys(providerRoleMaps || {})) {
    normalized.add(providerId);
  }

  return Array.from(normalized);
}

function resolveRoleModel(roleMap, role, fallback) {
  if (!roleMap || !Object.prototype.hasOwnProperty.call(roleMap, role)) {
    return typeof fallback === "string" && fallback.trim() ? fallback.trim() : null;
  }

  const model = roleMap[role];

  if (model === null) {
    return null;
  }

  if (typeof model === "string" && model.trim()) {
    return model.trim();
  }

  return typeof fallback === "string" && fallback.trim() ? fallback.trim() : null;
}

function toPublicProfile(profile, defaultModel, isActive = false) {
  const resolvedRoles = resolveProfileRoles(profile, defaultModel);

  return {
    id: profile.id,
    label: profile.label,
    description: profile.description,
    policy: profile.policy,
    max_auto_model_gb: profile.max_auto_model_gb,
    active: isActive,
    roles: DEFAULT_ROLES.map((role) => ({
      role,
      model: resolvedRoles.base[role] || null,
      suitability: ROLE_SUITABILITY[role] || null
    })),
    providers: Object.entries(resolvedRoles.providers).map(([providerId, roleMap]) => ({
      provider: providerId,
      roles: DEFAULT_ROLES.map((role) => ({
        role,
        model: roleMap[role] || null,
        suitability: ROLE_SUITABILITY[role] || null
      }))
    }))
  };
}

function normalizeRoleMap(roles, defaultModel) {
  const normalized = {};

  for (const role of DEFAULT_ROLES) {
    if (Object.prototype.hasOwnProperty.call(roles || {}, role)) {
      const model = roles[role];
      normalized[role] = typeof model === "string" && model.trim() ? model.trim() : null;
    } else if (defaultModel) {
      normalized[role] = defaultModel;
    } else {
      normalized[role] = null;
    }
  }

  return normalized;
}

function normalizeProviderRoles(providers, defaultModel) {
  const normalized = {};

  for (const [providerId, roles] of Object.entries(providers || {})) {
    normalized[providerId] = normalizeRoleMap(roles, defaultModel);
  }

  return normalized;
}

function normalizeProfileId(profileId) {
  return typeof profileId === "string" ? profileId.trim() : "";
}

function normalizeRoleId(role) {
  return typeof role === "string" ? role.trim() : "";
}

function labelForProfile(profileId) {
  return profileId
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

module.exports = {
  DEFAULT_PROFILES,
  ROLE_SUITABILITY,
  createModelProfileManager
};
