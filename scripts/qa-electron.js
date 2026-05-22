'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const appExe = path.join(projectRoot, 'dist', 'win-unpacked', 'musiQ.exe');
const debugPort = Number(process.env.MUSIQ_QA_DEBUG_PORT || 9323);
const cdpUrl = `http://127.0.0.1:${debugPort}/json/list`;
const screenshotPath = path.join(projectRoot, 'dist', 'qa', 'musiq-electron-qa.png');

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  if (!fs.existsSync(appExe)) {
    throw new Error(`Packaged app not found: ${appExe}. Run npm run dist first.`);
  }

  await stopPackagedApp();

  const appProcess = childProcess.spawn(appExe, [`--remote-debugging-port=${debugPort}`], {
    cwd: path.dirname(appExe),
    detached: false,
    stdio: 'ignore'
  });

  let client;
  try {
    const page = await waitForDebugTarget(30_000);
    client = await createCdpClient(page.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await waitForAppReady(client);

    const initial = await client.evaluate(`(() => {
      const sourceButton = document.querySelector('.source-selector-btn');
      const glassPanel = document.querySelector('.glass-panel');
      const sourceStyle = sourceButton ? getComputedStyle(sourceButton) : null;
      const glassStyle = glassPanel ? getComputedStyle(glassPanel) : null;

      return {
        title: document.title,
        hrefCss: document.querySelector('link[rel="stylesheet"]')?.getAttribute('href') || '',
        scripts: Array.from(document.querySelectorAll('script[src]')).map((script) => script.getAttribute('src')),
        sourceButtonText: sourceButton?.textContent.trim() || '',
        sourceButtonColor: sourceStyle?.color || '',
        sourceButtonBg: sourceStyle?.backgroundColor || '',
        glassBackdrop: glassStyle ? (glassStyle.backdropFilter || glassStyle.webkitBackdropFilter || 'none') : 'missing'
      };
    })()`);

    const search = await client.evaluate(`new Promise((resolve) => {
      const input = document.querySelector('#search-input');
      const form = document.querySelector('#search-form');
      if (!input || !form) {
        resolve({ cards: 0, viewTitle: '', elapsedMs: 0, error: 'search form missing' });
        return;
      }

      input.value = '周杰伦 晴天';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      const started = Date.now();
      const timer = setInterval(() => {
        const cards = document.querySelectorAll('.song-card').length;
        if (cards > 0 || Date.now() - started > 25_000) {
          clearInterval(timer);
          resolve({
            cards,
            viewTitle: document.querySelector('#view-title')?.textContent || '',
            elapsedMs: Date.now() - started
          });
        }
      }, 250);
    })`, { awaitPromise: true, timeoutMs: 28_000 });

    const idleFrames = await collectIdleFrames(client);
    const resize = await collectResizeFrames(client);
    const screenshot = await captureWindow();

    const result = {
      initial,
      search,
      idleFrames,
      resize,
      screenshot,
      console: client.logs
    };

    assertQa(result);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    if (client) client.close();
    await stopPackagedApp();
  }
}

async function waitForAppReady(client) {
  const started = Date.now();

  while (Date.now() - started < 15_000) {
    try {
      const ready = await client.evaluate(`(() => ({
        title: document.title,
        hasSearch: Boolean(document.querySelector('#search-form')),
        hasSourceSelector: Boolean(document.querySelector('.source-selector-btn')),
        hasStyle: Boolean(document.querySelector('link[rel="stylesheet"]')),
        scripts: Array.from(document.querySelectorAll('script[src]')).length
      }))()`, { timeoutMs: 3_000 });

      if (ready.title === 'musiQ' && ready.hasSearch && ready.hasSourceSelector && ready.hasStyle && ready.scripts >= 2) {
        return ready;
      }
    } catch {
      // The page can be between splash and main load; keep polling briefly.
    }

    await delay(250);
  }

  throw new Error('Timed out waiting for musiQ renderer to finish initializing');
}

async function collectIdleFrames(client) {
  return client.evaluate(`new Promise((resolve) => {
    const samples = [];
    let last = performance.now();

    function step() {
      const now = performance.now();
      samples.push(now - last);
      last = now;

      if (samples.length >= 120) {
        resolve(frameStats(samples));
        return;
      }

      requestAnimationFrame(step);
    }

    function frameStats(values) {
      const sorted = values.slice().sort((a, b) => a - b);
      return {
        count: values.length,
        avg: values.reduce((sum, value) => sum + value, 0) / values.length,
        p95: sorted[Math.floor(values.length * 0.95)],
        max: Math.max(...values),
        over16: values.filter((value) => value > 16.7).length,
        over24: values.filter((value) => value > 24).length
      };
    }

    requestAnimationFrame(step);
  })`, { awaitPromise: true, timeoutMs: 10_000 });
}

async function collectResizeFrames(client) {
  await client.evaluate(`(() => {
    window.__musiqResizeMonitor = { samples: [], active: true, classHits: 0 };
    let last = performance.now();

    function step() {
      if (!window.__musiqResizeMonitor.active) return;
      const now = performance.now();
      window.__musiqResizeMonitor.samples.push(now - last);
      if (document.body.classList.contains('is-window-resizing')) {
        window.__musiqResizeMonitor.classHits += 1;
      }
      last = now;
      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  })()`);

  await runResizePowerShell();
  await delay(250);

  const statsJson = await client.evaluate(`JSON.stringify((() => {
    const monitor = window.__musiqResizeMonitor || { samples: [], classHits: 0, active: false };
    monitor.active = false;
    const samples = monitor.samples.slice(1);
    const sorted = samples.slice().sort((a, b) => a - b);
    if (!samples.length) {
      return {
        count: 0,
        classHits: monitor.classHits || 0,
        avg: null,
        p95: null,
        max: null,
        over16: 0,
        over24: 0,
        bodyClass: document.body.className
      };
    }

    return {
      count: samples.length,
      classHits: monitor.classHits,
      avg: samples.reduce((sum, value) => sum + value, 0) / samples.length,
      p95: sorted[Math.floor(samples.length * 0.95)],
      max: Math.max(...samples),
      over16: samples.filter((value) => value > 16.7).length,
      over24: samples.filter((value) => value > 24).length,
      bodyClass: document.body.className
    };
  })())`, { timeoutMs: 10_000 });

  return JSON.parse(statsJson);
}

function assertQa(result) {
  const failures = [];

  if (result.initial.title !== 'musiQ') failures.push(`Unexpected title: ${result.initial.title}`);
  if (!result.initial.hrefCss.includes('style.css?v=2.0.2')) failures.push(`CSS cache version not loaded: ${result.initial.hrefCss}`);
  if (!result.initial.scripts.some((script) => script.includes('main.js?v=2.1.0'))) failures.push('main.js cache version not loaded');
  if (!result.initial.scripts.some((script) => script.includes('source-selector.js?v=1.0.3'))) failures.push('source-selector cache version not loaded');
  if (!result.initial.sourceButtonBg.includes('rgba(255, 255, 255, 0.07)')) failures.push(`Unexpected source button background: ${result.initial.sourceButtonBg}`);
  if (result.search.cards < 1) failures.push('Search did not render song cards');
  if (result.idleFrames.p95 > 16.7) failures.push(`Idle P95 frame time too high: ${result.idleFrames.p95}`);
  if (result.idleFrames.over24 > 3) failures.push(`Idle frame spikes over 24ms: ${result.idleFrames.over24}`);
  if (!Number.isFinite(result.resize.count) || result.resize.count < 30) failures.push(`Resize frame sample count too low: ${result.resize.count}`);
  if (!Number.isFinite(result.resize.p95)) failures.push(`Resize P95 frame time missing: ${result.resize.p95}`);
  if (result.resize.classHits < 1) failures.push('Resize performance mode did not activate');
  if (result.resize.p95 > 24) failures.push(`Resize P95 frame time too high: ${result.resize.p95}`);
  if (result.resize.over24 > 10) failures.push(`Too many resize frames over 24ms: ${result.resize.over24}`);
  if (result.console.some((entry) => entry.type === 'error' || entry.type === 'exception')) failures.push('Console errors were recorded');
  if (!fs.existsSync(result.screenshot.path)) failures.push(`Screenshot was not written: ${result.screenshot.path}`);

  if (failures.length) {
    const error = new Error(`Electron QA failed:\n- ${failures.join('\n- ')}`);
    error.failures = failures;
    throw error;
  }
}

async function waitForDebugTarget(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const targets = await getJson(cdpUrl, 2_000);
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // Keep polling until timeout.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${cdpUrl}`);
}

async function getJson(url, timeoutMs) {
  const response = await withTimeout(fetch(url), timeoutMs, `GET ${url}`);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function createCdpClient(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  const logs = [];
  let id = 0;

  await withTimeout(new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  }), 5_000, 'CDP WebSocket open');

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString());

    if (message.method === 'Runtime.consoleAPICalled') {
      logs.push({
        type: message.params.type,
        text: message.params.args.map((arg) => arg.value || arg.description || '').join(' ')
      });
    }

    if (message.method === 'Runtime.exceptionThrown') {
      logs.push({
        type: 'exception',
        text: message.params.exceptionDetails?.text || 'exception'
      });
    }

    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    }
  });

  return {
    logs,
    close: () => ws.close(),
    send(method, params = {}, timeoutMs = 8_000) {
      id += 1;
      const callId = id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return withTimeout(new Promise((resolve, reject) => {
        pending.set(callId, { resolve, reject });
      }), timeoutMs, method);
    },
    async evaluate(expression, options = {}) {
      const result = await this.send('Runtime.evaluate', {
        expression,
        awaitPromise: Boolean(options.awaitPromise),
        returnByValue: true
      }, options.timeoutMs || 8_000);

      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result.exceptionDetails));
      }

      return result.result.value;
    }
  };
}

async function runResizePowerShell() {
  const script = `
$definition = 'using System; using System.Runtime.InteropServices; public static class Win32ResizeQa { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }'
Add-Type -TypeDefinition $definition
$exe = $env:MUSIQ_EXE
$proc = Get-Process | Where-Object { $_.Path -eq $exe -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { throw "No running musiQ window found" }
[void][Win32ResizeQa]::ShowWindow($proc.MainWindowHandle, 9)
Start-Sleep -Milliseconds 150
$sizes = @(
  @{W=1280;H=820}, @{W=1180;H=760}, @{W=1080;H=700}, @{W=980;H=660},
  @{W=1160;H=760}, @{W=1360;H=860}, @{W=1500;H=920}, @{W=1280;H=820}
)
for ($round = 0; $round -lt 10; $round++) {
  foreach ($s in $sizes) {
    [void][Win32ResizeQa]::SetWindowPos($proc.MainWindowHandle, [IntPtr]::Zero, 80, 80, $s.W, $s.H, 0x0040)
    Start-Sleep -Milliseconds 35
  }
}
`;

  runPowerShell(script, { MUSIQ_EXE: appExe });
}

async function captureWindow() {
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });

  const script = `
$definition = 'using System; using System.Runtime.InteropServices; public static class Win32CaptureQa { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect); [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); public struct RECT { public int Left; public int Top; public int Right; public int Bottom; } }'
Add-Type -TypeDefinition $definition
Add-Type -AssemblyName System.Drawing
$exe = $env:MUSIQ_EXE
$out = $env:MUSIQ_SCREENSHOT
$proc = Get-Process | Where-Object { $_.Path -eq $exe -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { throw "No visible musiQ window found" }
[void][Win32CaptureQa]::ShowWindow($proc.MainWindowHandle, 9)
Start-Sleep -Milliseconds 300
$rect = New-Object Win32CaptureQa+RECT
[void][Win32CaptureQa]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$hdc = $graphics.GetHdc()
try { [void][Win32CaptureQa]::PrintWindow($proc.MainWindowHandle, $hdc, 2) } finally { $graphics.ReleaseHdc($hdc) }
$bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
[pscustomobject]@{ path = $out; width = $width; height = $height } | ConvertTo-Json
`;

  const output = runPowerShell(script, {
    MUSIQ_EXE: appExe,
    MUSIQ_SCREENSHOT: screenshotPath
  });

  return JSON.parse(output);
}

async function stopPackagedApp(startedPid) {
  const script = `
$exe = $env:MUSIQ_EXE
$startedPid = $env:MUSIQ_STARTED_PID
$targets = Get-Process | Where-Object {
  $_.Path -eq $exe -and (-not $startedPid -or $_.Id -eq [int]$startedPid)
}
$windowProc = $targets | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($windowProc) {
  [void]$windowProc.CloseMainWindow()
  Start-Sleep -Seconds 3
}
$remaining = Get-Process | Where-Object {
  $_.Path -eq $exe -and (-not $startedPid -or $_.Id -eq [int]$startedPid)
}
if ($remaining) {
  $remaining | Stop-Process -Force
  Start-Sleep -Milliseconds 500
}
`;

  runPowerShell(script, {
    MUSIQ_EXE: appExe,
    MUSIQ_STARTED_PID: startedPid ? String(startedPid) : ''
  });
}

function runPowerShell(script, env = {}) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return childProcess.execFileSync('powershell', ['-NoProfile', '-EncodedCommand', encoded], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
