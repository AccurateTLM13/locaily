const { spawn } = require("node:child_process");

const PORT = 31410;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
const children = [];

function check(name, cond, detail) {
  if (cond) { passed += 1; console.log(`PASS: ${name}`); }
  else { failed += 1; console.error(`FAIL: ${name}`); if (detail) console.error(`  ${detail}`); }
}

async function waitForHealth(base, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server at ${base} not healthy in ${timeoutMs}ms`);
}

function startServer() {
  const child = spawn(process.execPath, ["companion/server.js"], {
    env: { ...process.env, LOCAL_AI_HOST: "127.0.0.1", LOCAL_AI_PORT: String(PORT) },
    stdio: ["ignore", "ignore", "ignore"]
  });
  children.push(child);
  return child;
}

async function main() {
  console.log("Starting server for unified shell test...");
  const child = startServer();
  await waitForHealth(BASE);
  console.log("Server healthy.");

  // Test 1: GET / returns shell HTML
  const rootRes = await fetch(`${BASE}/`);
  check("GET / returns 200", rootRes.status === 200);
  const rootHtml = await rootRes.text();
  check("GET / returns shell HTML", rootHtml.includes("shell") || rootHtml.includes("Locaily"));
  check("Shell HTML has nav links", rootHtml.includes("sidebar-nav"));
  check("Shell HTML has brand", rootHtml.includes("logo-text") && rootHtml.includes("Loc"));
  check("Shell HTML links Benchmark Lab", rootHtml.includes("data-section=\"benchmarks\""));

  // Test 2: GET /shell returns same shell
  const shellRes = await fetch(`${BASE}/shell`);
  check("GET /shell returns 200", shellRes.status === 200);
  const shellHtml = await shellRes.text();
  check("GET /shell returns shell HTML", shellHtml.includes("sidebar-nav"));

  // Test 3: Shell CSS loads
  const cssRes = await fetch(`${BASE}/shell/styles.css`);
  check("GET /shell/styles.css returns CSS", cssRes.status === 200 && cssRes.headers.get("content-type").includes("css"));

  // Test 4: Shell JS loads
  const jsRes = await fetch(`${BASE}/shell/app.js`);
  check("GET /shell/app.js returns JS", jsRes.status === 200 && jsRes.headers.get("content-type").includes("javascript"));
  const shellJs = await jsRes.text();
  check("Shell JS renders interactive benchmarks", shellJs.includes("renderBenchmarks") && shellJs.includes("EventSource"));

  // Test 5: Legacy /console still works
  const consoleRes = await fetch(`${BASE}/console`);
  check("GET /console still works (legacy)", consoleRes.status === 200);
  const consoleHtml = await consoleRes.text();
  check("Console HTML has expected content", consoleHtml.includes("Workflow Validation") || consoleHtml.includes("locaily-logo"));

  // Test 6: Legacy /operator redirects to shell
  const opRes = await fetch(`${BASE}/operator`, { redirect: "manual" });
  check("GET /operator redirects to shell", opRes.status === 200);
  const opHtml = await opRes.text();
  check("Operator redirect mentions shell", opHtml.includes("Redirecting") || opHtml.includes("#jobs"));

  // Test 7: Console status endpoint still works
  const statusRes = await fetch(`${BASE}/console/status`);
  check("GET /console/status returns 200", statusRes.status === 200);
  const status = await statusRes.json();
  check("Console status ok:true", status.ok === true);

  // Test 8: Demo endpoint still works
  const demoRes = await fetch(`${BASE}/console/demo`);
  check("GET /console/demo returns 200", demoRes.status === 200);
  const demo = await demoRes.json();
  check("Demo endpoint available", demo.demoAvailable === true);

  // Test 9: Operator JS still loads
  const opJsRes = await fetch(`${BASE}/operator/app.js`);
  check("GET /operator/app.js still loads", opJsRes.status === 200);

  child.kill("SIGKILL");

  console.log(`\n${passed}/${passed + failed} unified shell tests passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Unified shell test error:", error);
  process.exit(1);
}).finally(() => {
  for (const c of children) {
    try { if (c && !c.killed) c.kill("SIGKILL"); } catch {}
  }
});
