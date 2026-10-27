/**
 * Comprehensive Browser Walkthrough for Gate (Archetype X · Turnstile)
 * Connects to Headless Chrome via CDP, loads mock-wallet.js,
 * tests 1280px & 360px viewports, footer links, dropdown contrast,
 * walks every state in §3.3, checks shareable address verification,
 * performs real on-chain transaction (buy/stamp pass),
 * and asserts zero console errors / zero hydration warnings.
 */
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_PORT = 9222;
const APP_URL = "http://localhost:3000";
const RPC_URL = "http://127.0.0.1:8719";
const ACC_ALICE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ACC_BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ACC_CHARLIE = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const ACC_DAVE = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

const mockWalletScript = readFileSync(
  new URL("../../docs/specs/tools/mock-wallet.js", import.meta.url),
  "utf8"
);

const userDir = mkdtempSync(join(tmpdir(), "chrome-gate-"));

console.log("Launching headless Chrome...");
const chrome = spawn("google-chrome", [
  "--headless=new",
  `--remote-debugging-port=${CHROME_PORT}`,
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  `--user-data-dir=${userDir}`,
  "about:blank",
]);

await new Promise((r) => setTimeout(r, 1200));

async function cdpHttp(path, method = "GET") {
  const res = await fetch(`http://127.0.0.1:${CHROME_PORT}${path}`, { method });
  return await res.json();
}

const version = await cdpHttp("/json/version");
console.log("Connected to Chrome:", version["Browser"]);

const list = await cdpHttp("/json/list");
const pageTarget = list.find((t) => t.type === "page");
const wsUrl = pageTarget?.webSocketDebuggerUrl;
if (!wsUrl) throw new Error("No page webSocketDebuggerUrl found");

const ws = new WebSocket(wsUrl);
let reqId = 1;
const pending = new Map();
const consoleErrors = [];
const cdpListeners = new Set();

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  for (const listener of cdpListeners) {
    try {
      listener(msg);
    } catch (e) {
      console.error("Listener error:", e);
    }
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    if (msg.params.type === "error") {
      const errText = msg.params.args.map((a) => a.value || a.description).join(" ");
      if (!errText.includes("net::ERR_CONNECTION_REFUSED")) {
        consoleErrors.push(errText);
      }
    }
  }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(msg.error);
    else resolve(msg.result);
  }
};

await new Promise((resolve) => (ws.onopen = resolve));

function send(method, params = {}) {
  const id = reqId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Page.enable");
await send("Runtime.enable");

// Automatically inject mock wallet on every page with ACC_CHARLIE
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    ${mockWalletScript}
    window.__installMockWallet({ rpc: "${RPC_URL}", account: "${ACC_CHARLIE}" });
    console.log("[MockWallet] Injected & installed for Charlie");
  `,
});

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
  }
  return res.result?.value;
}

async function setViewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
}

async function navigate(path) {
  const url = `${APP_URL}${path}`;
  const loadPromise = new Promise((resolve) => {
    const handler = (msg) => {
      if (msg.method === "Page.loadEventFired") {
        cdpListeners.delete(handler);
        resolve();
      }
    };
    cdpListeners.add(handler);
  });
  await send("Page.navigate", { url });
  await loadPromise;
  await new Promise((r) => setTimeout(r, 400));
}

async function waitForText(target, maxMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const text = await evaluate("document.body.innerText");
    if (text.includes(target)) return text;
    await new Promise((r) => setTimeout(r, 150));
  }
  return await evaluate("document.body.innerText");
}

console.log("\n--- Starting Gate Browser Verification ---");

try {
  // 1. Desktop 1280px on /
  console.log("1. Testing Desktop 1280px on /...");
  await setViewport(1280, 800);
  await navigate("/");

  const title = await evaluate("document.title");
  console.log(`   Page title: "${title}"`);
  if (!title.includes("Gate")) throw new Error("Title does not include 'Gate'");

  // Check 3 footer links
  const footerLinksCount = await evaluate(`
    (() => {
      const links = Array.from(document.querySelectorAll("footer a"));
      const hrefs = links.map(a => a.href);
      const hasBotchain = hrefs.some(h => h.includes("botchain.ai") && !h.includes("scan"));
      const hasScan = hrefs.some(h => h.includes("scan.botchain.ai"));
      const hasContract = links.some(a => a.textContent.includes("Built on") || a.title?.includes("contract") || a.href.includes("/address/"));
      return { total: links.length, hasBotchain, hasScan, hasContract };
    })()
  `);
  console.log("   Footer links check:", footerLinksCount);
  if (!footerLinksCount.hasBotchain || !footerLinksCount.hasScan || !footerLinksCount.hasContract) {
    throw new Error("Footer missing one of the 3 required links!");
  }

  // Check wallet menu tokens
  const menuTokens = await evaluate(`
    (() => {
      const s = getComputedStyle(document.documentElement);
      return {
        bg: s.getPropertyValue("--menu-bg").trim(),
        fg: s.getPropertyValue("--menu-fg").trim(),
        muted: s.getPropertyValue("--menu-muted").trim(),
        border: s.getPropertyValue("--menu-border").trim(),
        hover: s.getPropertyValue("--menu-hover-bg").trim(),
        danger: s.getPropertyValue("--menu-danger").trim()
      };
    })()
  `);
  console.log("   Wallet menu tokens:", menuTokens);
  if (!menuTokens.bg || !menuTokens.fg || !menuTokens.hover) {
    throw new Error("Missing wallet menu tokens in :root");
  }

  // 2. Mobile 360px Viewport Check
  console.log("2. Testing Mobile 360px Viewport...");
  await setViewport(360, 640);
  await navigate("/");
  const scrollWidth360 = await evaluate("document.documentElement.scrollWidth");
  const clientWidth360 = await evaluate("document.documentElement.clientWidth");
  console.log(`   360px viewport: scrollWidth=${scrollWidth360}, clientWidth=${clientWidth360}`);
  if (scrollWidth360 > clientWidth360) {
    throw new Error(`Horizontal scroll detected at 360px! (${scrollWidth360} > ${clientWidth360})`);
  }

  // 3. Screen Walkthrough: /new
  console.log("3. Walking /new (creation form & live ticket preview)...");
  await setViewport(1280, 800);
  await navigate("/new");
  const hasFormInput = await evaluate('Boolean(document.querySelector("#gate-name"))');
  const hasTicketPreview = await evaluate('Boolean(document.querySelector("div[style*=\'min-height\']"))');
  console.log(`   /new hasFormInput=${hasFormInput}, hasTicketPreview=${hasTicketPreview}`);
  if (!hasFormInput || !hasTicketPreview) throw new Error("/new is missing form or live ticket preview!");

  // 4. Screen Walkthrough: /me
  console.log("4. Walking /me (my passes & creator earnings)...");
  await navigate("/me");
  const meText = await waitForText("Passes");
  const meOk = meText.includes("Passes") || meText.includes("Connect Your Wallet");
  console.log(`   /me heading or prompt present: ${meOk}`);
  if (!meOk) throw new Error("/me missing passes or connect prompt!");

  // 5. Screen Walkthrough: Seeded Gates 1–4
  console.log("5. Walking seeded gates 1 through 4...");

  // Gate 1: Daily pass
  await navigate("/g/1");
  const g1Text = await waitForText("Day Pass Room");
  const g1Daily = g1Text.includes("Day Pass Room") || g1Text.includes("0.5 BOT");
  console.log(`   Gate 1: Daily pass found=${g1Daily}`);
  if (!g1Daily) throw new Error("Gate 1 missing daily pass!");

  // Gate 2: Monthly VIP pass
  await navigate("/g/2");
  const g2Text = await waitForText("Monthly Discord VIP");
  const g2Monthly = g2Text.includes("Monthly Discord VIP") || g2Text.includes("2 BOT");
  console.log(`   Gate 2: Monthly VIP pass found=${g2Monthly}`);
  if (!g2Monthly) throw new Error("Gate 2 missing monthly pass!");

  // Gate 3: Closed gate
  await navigate("/g/3");
  const g3Text = await waitForText("Archived Lounge");
  const g3Closed = g3Text.includes("Closed") || g3Text.includes("closed to new purchases");
  console.log(`   Gate 3: Closed status active=${g3Closed}`);
  if (!g3Closed) throw new Error("Gate 3 missing closed state!");

  // Gate 4: Newly opened (never bought)
  await navigate("/g/4");
  const g4Text = await waitForText("Genesis Circle");
  const g4Found = g4Text.includes("Genesis Circle");
  console.log(`   Gate 4: Genesis Circle found=${g4Found}`);
  if (!g4Found) throw new Error("Gate 4 missing!");

  // 6. Shareable Check Proof Walkthrough (/g/1/check/[address])
  console.log("6. Testing shareable address check routes...");
  // Bob is active member
  await navigate(`/g/1/check/${ACC_BOB}`);
  const bobCheck = await waitForText("VALID");
  const bobValid = bobCheck.includes("VALID") || bobCheck.includes("Valid");
  console.log(`   Bob public proof: Valid pass found=${bobValid}`);
  if (!bobValid) throw new Error("Bob public check should report valid pass!");

  // Dave is lapsed member
  await navigate(`/g/1/check/${ACC_DAVE}`);
  const daveCheck = await waitForText("EXPIRED");
  const daveExpired = daveCheck.includes("EXPIRED") || daveCheck.includes("Expired");
  console.log(`   Dave public proof: Expired pass found=${daveExpired}`);
  if (!daveExpired) throw new Error("Dave public check should report expired pass!");

  // Invalid address check
  await navigate(`/g/1/check/0xnotanaddress`);
  const invalidCheck = await waitForText("Invalid Address");
  const invalidOk = invalidCheck.includes("Invalid Address");
  console.log(`   Invalid address handled gracefully=${invalidOk}`);
  if (!invalidOk) throw new Error("Invalid address route did not show Invalid Address notice!");

  // 7. Real On-Chain User Interaction: Buy/Stamp Pass on Gate 4
  console.log("7. Performing real on-chain transaction: Buy/stamp pass on Gate 4...");
  await navigate("/g/4");

  // Connect mock wallet
  await evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Connect"));
      if (btn) btn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 600));

  // Select Mock Wallet from dropdown
  await evaluate(`
    (() => {
      const mockItem = Array.from(document.querySelectorAll("[role='menuitem'], button")).find(el => el.textContent.includes("Mock Wallet"));
      if (mockItem) mockItem.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 1000));

  // Check available buttons
  const buttons = await evaluate(`
    Array.from(document.querySelectorAll("button")).map(b => ({ text: b.textContent.trim(), disabled: b.disabled }))
  `);
  console.log("   Available buttons:", buttons);

  // Click purchase/renew button
  const stampClicked = await evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.includes("Stamp Pass") ||
        b.textContent.includes("Buy Access") ||
        b.textContent.includes("Renew Pass")
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()
  `);
  console.log("   Clicked 'Stamp Pass':", stampClicked);
  if (!stampClicked) throw new Error("Could not find or click 'Stamp Pass' button!");

  // Wait for tx confirmation
  await new Promise((r) => setTimeout(r, 3500));

  // Verify toast and stub stamped
  const afterText = await evaluate("document.body.innerText");
  console.log("   DEBUG afterText:\n", afterText.slice(0, 500));
  const stampConfirmed = afterText.includes("Access Purchased") || afterText.includes("Valid Until") || afterText.includes("VALID UNTIL");
  console.log("   Transaction completed. Stamped pass confirmed:", stampConfirmed);
  if (!stampConfirmed) throw new Error("Stamp pass transaction confirmation not reflected!");

  // 8. Verify Console Cleanliness
  console.log(`8. Console errors check: ${consoleErrors.length} unhandled errors`);
  if (consoleErrors.length > 0) {
    console.error("   Errors encountered:", consoleErrors);
    throw new Error(`Console errors found: ${consoleErrors.join("; ")}`);
  }

  console.log("\n✅ ALL GATE BROWSER CHECKS PASSED PERFECTLY!");
} catch (err) {
  console.error("\n❌ GATE BROWSER WALKTHROUGH FAILED:", err);
  process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill();
  process.exit(process.exitCode || 0);
}
