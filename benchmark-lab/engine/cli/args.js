function parseArgs(args, spec = {}) {
  const parsed = {};

  for (const [key, config] of Object.entries(spec)) {
    if (config.multiple) {
      parsed[key] = [];
    }
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument '${arg}'.`);
    }

    const key = arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    const config = spec[key];

    if (!config) {
      throw new Error(`Unknown option '${arg}'.`);
    }

    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Option '${arg}' requires a value.`);
    }

    if (config.multiple) {
      parsed[key].push(value);
    } else {
      parsed[key] = value;
    }

    index += 1;
  }

  return parsed;
}

function requireArgs(parsed, required) {
  for (const key of required) {
    const value = parsed[key];
    const missing = Array.isArray(value) ? value.length === 0 : !value;

    if (missing) {
      throw new Error(`Missing required option --${toKebab(key)}.`);
    }
  }
}

function printHelp({ command, description, options, examples = [] }) {
  const lines = [
    description,
    "",
    `Usage: ${command}`,
    "",
    "Options:"
  ];

  for (const option of options) {
    lines.push(`  ${option.flag.padEnd(24)} ${option.description}`);
  }

  if (examples.length > 0) {
    lines.push("", "Examples:");
    for (const example of examples) {
      lines.push(`  ${example}`);
    }
  }

  console.log(lines.join("\n"));
}

function toKebab(key) {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

module.exports = {
  parseArgs,
  requireArgs,
  printHelp
};
