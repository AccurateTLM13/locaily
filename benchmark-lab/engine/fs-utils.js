const fs = require("node:fs/promises");
const path = require("node:path");

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(`${filePath}.tmp`, filePath);
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

module.exports = {
  readJson,
  writeJson,
  toPosixPath
};
