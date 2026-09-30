const fs = require("node:fs");
const path = require("node:path");

function listFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function captureFile(filePath) {
  return fs.existsSync(filePath)
    ? { exists: true, content: fs.readFileSync(filePath) }
    : { exists: false, content: null };
}

function installDevelopmentStateGuard(projectRoot, extraFiles = []) {
  const developmentRoot = path.join(projectRoot, "development");
  const originalFiles = new Map(
    listFiles(developmentRoot).map(filePath => [
      path.relative(developmentRoot, filePath),
      fs.readFileSync(filePath),
    ])
  );
  const extras = new Map(extraFiles.map(relativePath => {
    const filePath = path.join(projectRoot, relativePath);
    return [filePath, captureFile(filePath)];
  }));
  let restored = false;

  function restore() {
    if (restored) return;
    restored = true;
    for (const filePath of listFiles(developmentRoot)) {
      const relativePath = path.relative(developmentRoot, filePath);
      if (!originalFiles.has(relativePath)) fs.unlinkSync(filePath);
    }
    for (const [relativePath, content] of originalFiles) {
      const filePath = path.join(developmentRoot, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
    for (const [filePath, snapshot] of extras) {
      if (!snapshot.exists) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        continue;
      }
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, snapshot.content);
    }
  }

  process.once("exit", restore);
  return restore;
}

module.exports = { installDevelopmentStateGuard };
