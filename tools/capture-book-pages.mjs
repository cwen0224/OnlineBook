#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOOKS = ['zaojiao', 'shigo', 'zaojiao_story', 'penghu_shihu'];
const DEFAULTS = {
  lang: 'zh-TW', width: 1440, height: 1000, fromPage: 1,
  translation: 'closed',
};
const PRINTED_TO_READER_PAGE_OFFSET = { zaojiao: 4, shigo: 0, zaojiao_story: 0, penghu_shihu: 3 };

function help() {
  console.log(`Usage: node tools/capture-book-pages.mjs --book <key> [options]

Capture every visible page state in the actual book reader with headless Chrome.

Required:
  --book <key>            ${BOOKS.join(' | ')}

Options:
  --lang <zh-TW|en>       Reader language (default: ${DEFAULTS.lang})
  --out <directory>       Screenshot output directory (default: OS temp directory)
  --width <pixels>        Browser viewport width (default: ${DEFAULTS.width})
  --height <pixels>       Browser viewport height (default: ${DEFAULTS.height})
  --from-page <number>    First printed page to include (default: 1)
  --to-page <number>      Last printed page to include (default: last page)
  --translation <state>   English panel: closed | open (default: closed)
  --preview-page <number> Overlay page text plus any annotated facing-page text
  --base-url <url>        Use an already-running site instead of starting a local server
  --chrome <path>         Chrome executable (or set CHROME_PATH)
  --help                  Show this help

Examples:
  node tools/capture-book-pages.mjs --book penghu_shihu --lang en
  node tools/capture-book-pages.mjs --book zaojiao --from-page 5 --to-page 10 --translation open
  node tools/capture-book-pages.mjs --book penghu_shihu --lang en --preview-page 13
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  const explicitlySet = new Set();
  const names = new Map([
    ['--book', 'book'], ['--lang', 'lang'], ['--out', 'out'],
    ['--width', 'width'], ['--height', 'height'], ['--from-page', 'fromPage'],
    ['--to-page', 'toPage'], ['--translation', 'translation'],
    ['--base-url', 'baseUrl'], ['--chrome', 'chrome'], ['--preview-page', 'previewPage'],
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') { options.help = true; continue; }
    const key = names.get(flag);
    if (!key) throw new Error(`Unknown option: ${flag}`);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
    options[key] = argv[++i];
    explicitlySet.add(key);
  }
  if (options.help) return options;
  if (!BOOKS.includes(options.book)) throw new Error(`--book must be one of: ${BOOKS.join(', ')}`);
  if (!['zh-TW', 'en'].includes(options.lang)) throw new Error('--lang must be zh-TW or en');
  if (!['open', 'closed'].includes(options.translation)) throw new Error('--translation must be open or closed');
  if (options.previewPage !== undefined) {
    options.previewPage = Number(options.previewPage);
    if (!Number.isInteger(options.previewPage) || options.previewPage < 1) throw new Error('--preview-page must be a positive integer');
    if (!explicitlySet.has('fromPage')) options.fromPage = options.previewPage;
    if (!explicitlySet.has('toPage')) options.toPage = options.previewPage;
  }
  for (const key of ['width', 'height', 'fromPage']) {
    options[key] = Number(options[key]);
    if (!Number.isInteger(options[key]) || options[key] < 1) throw new Error(`Invalid ${key}: expected a positive integer`);
  }
  if (options.toPage !== undefined) {
    options.toPage = Number(options.toPage);
    if (!Number.isInteger(options.toPage) || options.toPage < options.fromPage) throw new Error('--to-page must be an integer >= --from-page');
  }
  return options;
}

async function loadPreviewPages(book, pageNumber) {
  const data = JSON.parse(await fs.readFile(path.join(ROOT, 'text-placement-zones.json'), 'utf8'));
  const pages = data.books[book]?.pages || [];
  const facePageNumbers = pageNumber === 1
    ? [1]
    : pageNumber % 2 === 0 ? [pageNumber, pageNumber + 1] : [pageNumber - 1, pageNumber];
  const previews = facePageNumbers.map((number) => {
    const page = pages.find((item) => item.page === number);
    const scope = page?.translationScope;
    const readerPageOffset = PRINTED_TO_READER_PAGE_OFFSET[book] || 0;
    const isPageScoped = scope?.granularity === 'page'
      || (scope?.startPage === scope?.endPage
        && (scope?.granularity === 'reader-pages' || scope?.granularity === 'printed-pages')
        && scope.startPage + readerPageOffset === number);
    if (!page?.englishTranslation || !page.zones?.length || !isPageScoped) return null;
    const points = page.zones[0].polygon;
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return {
      page: number,
      text: page.englishTranslation,
      wordCount: page.englishWordCount,
      zoneId: page.zones[0].id,
      box: { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
    };
  }).filter(Boolean);
  if (!previews.some((preview) => preview.page === pageNumber)) {
    throw new Error(`Page ${pageNumber} needs page-specific English text and a placement zone in text-placement-zones.json.`);
  }
  return previews;
}

async function addPreviewOverlay(devtools, preview) {
  const payload = JSON.stringify(preview);
  const result = await devtools.evaluate(`(() => {
    const preview = ${payload};
    const img = [...document.querySelectorAll('#book img')].find(item => item.alt === '第' + preview.page + '頁');
    if (!img) return false;
    const face = img.closest('.face');
    if (!face) return false;
    face.querySelector('[data-cli-english-preview]')?.remove();
    const box = document.createElement('div');
    box.dataset.cliEnglishPreview = 'true';
    box.style.cssText = [
      'position:absolute', 'z-index:5', 'box-sizing:border-box',
      'left:' + preview.box.left + '%', 'top:' + preview.box.top + '%',
      'width:' + preview.box.width + '%', 'height:' + preview.box.height + '%',
      'display:flex', 'align-items:center', 'overflow:hidden',
      'padding:clamp(16px,1.4vw,20px)', 'border-radius:12px', 'color:#fffaf3',
      'background:linear-gradient(105deg,rgba(91,58,34,.50),rgba(112,74,45,.50))',
      'box-shadow:0 0 18px 5px rgba(91,58,34,.12),0 5px 18px rgba(38,30,20,.12)',
      'backdrop-filter:blur(2px)', '-webkit-backdrop-filter:blur(2px)'
    ].join(';');
    const text = document.createElement('span');
    text.dataset.cliEnglishText = 'true';
    text.textContent = preview.text;
    text.style.cssText = [
      'display:block', 'width:100%', 'max-height:100%', 'min-height:0', 'overflow:visible',
      'font:650 clamp(16px,1.3vw,20px)/1.2 system-ui,sans-serif',
      'letter-spacing:.01em', 'white-space:pre-line',
      'text-shadow:0 1px 3px rgba(35,20,10,.48)'
    ].join(';');
    box.append(text);
    face.append(box);
    const requiredHeight = text.scrollHeight;
    const availableHeight = box.clientHeight - parseFloat(getComputedStyle(box).paddingTop) - parseFloat(getComputedStyle(box).paddingBottom);
    const fits = requiredHeight <= availableHeight + 1;
    if (!fits) box.style.outline = '2px solid #ff3b30';
    return { fits, requiredHeight, availableHeight,
      overflowPx: Math.max(0, requiredHeight - availableHeight) };
  })()`);
  if (!result) throw new Error(`Could not place preview on page ${preview.page}.`);
  return result;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitFor(check, description, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch { /* The process or server may still be starting. */ }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function findChrome(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch { /* Try next known installation. */ }
  }
  throw new Error('Chrome was not found. Pass --chrome <path> or set CHROME_PATH.');
}

class DevTools {
  constructor(webSocketUrl) {
    this.nextId = 0;
    this.pending = new Map();
    this.diagnostics = [];
    this.socket = new WebSocket(webSocketUrl);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') {
        this.diagnostics.push({ type: 'exception', detail: message.params.exceptionDetails?.text || 'JavaScript exception' });
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        const entry = message.params.entry;
        const isMissingFavicon = /favicon\.ico(?:$|[?#])/i.test(entry.url || '') && /404/.test(entry.text);
        if (!isMissingFavicon) this.diagnostics.push({ type: 'console', detail: entry.text, url: entry.url || null });
      }
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      }
    });
    this.socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('Chrome DevTools connection closed'));
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Page evaluation failed');
    return result.result?.value;
  }
}

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); console.error('Use --help for usage.'); process.exitCode = 2; return; }
  if (options.help) { help(); return; }

  const previews = options.previewPage ? await loadPreviewPages(options.book, options.previewPage) : [];
  const chromePath = await findChrome(options.chrome);
  const outDir = path.resolve(options.out || path.join(os.tmpdir(), 'OnlineBook-captures', options.book, options.lang));
  await fs.mkdir(outDir, { recursive: true });

  let serverProcess;
  let chromeProcess;
  let profileDir;
  let devtools;
  try {
    let baseUrl = options.baseUrl;
    if (!baseUrl) {
      const port = await freePort();
      serverProcess = spawn(process.env.PYTHON || 'python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
        cwd: ROOT, stdio: 'ignore', windowsHide: true,
      });
      baseUrl = `http://127.0.0.1:${port}`;
      await waitFor(async () => {
        const response = await fetch(baseUrl);
        return response.ok;
      }, 'local web server');
    }

    profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onlinebook-chrome-'));
    chromeProcess = spawn(chromePath, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--disable-background-networking', '--disable-breakpad', '--disable-crash-reporter',
      '--no-first-run', '--no-default-browser-check',
      '--remote-allow-origins=*', '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`, `--window-size=${options.width},${options.height}`, 'about:blank',
    ], { stdio: 'ignore', windowsHide: true });

    const activePortPath = path.join(profileDir, 'DevToolsActivePort');
    const debugPort = await waitFor(async () => {
      const lines = (await fs.readFile(activePortPath, 'utf8')).trim().split(/\r?\n/);
      return lines[0] ? Number(lines[0]) : null;
    }, 'Chrome DevTools endpoint');
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      return response.ok ? response.json() : null;
    }, 'Chrome page target');
    const target = targets.find((item) => item.type === 'page');
    if (!target) throw new Error('Chrome did not create a page target.');
    devtools = new DevTools(target.webSocketDebuggerUrl);
    await devtools.open();
    await devtools.send('Page.enable');
    await devtools.send('Runtime.enable');
    await devtools.send('Log.enable');
    await devtools.send('Emulation.setDeviceMetricsOverride', {
      width: options.width, height: options.height, deviceScaleFactor: 1, mobile: false,
    });

    const readerUrl = `${baseUrl.replace(/\/$/, '')}/viewer.html?book=${encodeURIComponent(options.book)}&lang=${encodeURIComponent(options.lang)}`;
    await devtools.send('Page.navigate', { url: readerUrl });
    await waitFor(async () => devtools.evaluate(`(() => document.readyState === 'complete' && document.querySelectorAll('#book .leaf img').length > 0 && document.querySelector('#btn-next'))()`), 'reader initialization', 60000);
    await devtools.evaluate(`(async () => { await document.fonts.ready; return true; })()`);

    if (options.translation === 'open') {
      const toggleExists = await devtools.evaluate(`Boolean(document.querySelector('#translation-toggle') && getComputedStyle(document.querySelector('#translation-toggle')).display !== 'none')`);
      if (!toggleExists) console.warn('This book has no English panel toggle; capturing with the panel unavailable.');
      else await devtools.evaluate(`document.querySelector('#translation-toggle').click()`);
    }

    const totalPages = await devtools.evaluate(`document.querySelectorAll('#book .leaf').length * 2`);
    const manifestRes = await fetch(`${baseUrl.replace(/\/$/, '')}/book_${options.book}_${options.lang}.json`);
    if (!manifestRes.ok) throw new Error(`Could not load book manifest (${manifestRes.status}).`);
    const pageManifest = await manifestRes.json();
    const actualTotal = pageManifest.length;
    const toPage = Math.min(options.toPage ?? actualTotal, actualTotal);
    if (options.fromPage > actualTotal) throw new Error(`--from-page exceeds this book's ${actualTotal} pages.`);
    if (totalPages < actualTotal) throw new Error('Reader page count does not match the book manifest.');

    const states = [];
    const maxStates = Math.ceil(actualTotal / 2);
    for (let state = 0; state <= maxStates; state += 1) {
      const visiblePages = state === 0
        ? [1]
        : [...new Set([Math.min(state * 2, actualTotal), Math.min(state * 2 + 1, actualTotal)])];
      if (visiblePages.some((page) => page >= options.fromPage && page <= toPage)) {
        await waitFor(async () => devtools.evaluate(`(async () => {
          const nums = ${JSON.stringify(visiblePages)};
          const imgs = nums.map(n => [...document.querySelectorAll('#book img')].find(img => img.alt === '第' + n + '頁'));
          if (imgs.some(img => !img || !img.complete || img.naturalWidth === 0)) return false;
          await Promise.all(imgs.map(img => img.decode().catch(() => {})));
          return true;
        })()`), `images for ${visiblePages.join('-')}`, 30000);
        const label = visiblePages.length === 1 ? `page-${String(visiblePages[0]).padStart(3, '0')}` : `spread-${String(visiblePages[0]).padStart(3, '0')}-${String(visiblePages[1]).padStart(3, '0')}`;
        const file = `${options.book}-${options.lang}-${options.translation}-${label}.png`;
        const screenshot = await devtools.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
        await fs.writeFile(path.join(outDir, file), Buffer.from(screenshot.data, 'base64'));
        states.push({ visiblePages, file, width: options.width, height: options.height });
        console.log(`Captured ${visiblePages.join('–')} → ${path.join(outDir, file)}`);
        const visiblePreviews = previews.filter((preview) => visiblePages.includes(preview.page));
        if (visiblePreviews.length) {
          const previewFit = [];
          for (const preview of visiblePreviews) {
            const fit = await addPreviewOverlay(devtools, preview);
            previewFit.push({ page: preview.page, wordCount: preview.wordCount, zoneId: preview.zoneId, ...fit });
          }
          const previewLabel = visiblePreviews.length > 1
            ? `spread-${String(Math.min(...visiblePreviews.map((preview) => preview.page))).padStart(3, '0')}-${String(Math.max(...visiblePreviews.map((preview) => preview.page))).padStart(3, '0')}`
            : `page-${String(visiblePreviews[0].page).padStart(3, '0')}`;
          const previewFile = `${options.book}-${options.lang}-preview-${previewLabel}.png`;
          const previewScreenshot = await devtools.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
          await fs.writeFile(path.join(outDir, previewFile), Buffer.from(previewScreenshot.data, 'base64'));
          states.at(-1).previewFile = previewFile;
          states.at(-1).previewFit = previewFit;
          console.log(`Captured ${previewFit.map((item) => `page ${item.page}: ${item.wordCount} words in ${item.zoneId} (${item.fits ? 'fits' : `OVERFLOW ${item.overflowPx}px`})`).join('; ')} → ${path.join(outDir, previewFile)}`);
          break;
        }
        if (Math.max(...visiblePages) >= toPage) break;
      }
      if (state < maxStates) {
        const canNext = await devtools.evaluate(`!document.querySelector('#btn-next').disabled`);
        if (!canNext) break;
        await devtools.evaluate(`document.querySelector('#btn-next').click()`);
        await delay(520);
      }
    }

    const manifest = {
      book: options.book, language: options.lang, translationPanel: options.translation,
      viewport: { width: options.width, height: options.height },
      requestedPageRange: { from: options.fromPage, to: toPage },
      previewPages: previews.map(({ page, wordCount, zoneId }) => ({ page, wordCount, zoneId })),
      screenshots: states,
      diagnostics: devtools.diagnostics,
    };
    await fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Finished ${states.length} screenshot(s); ${devtools.diagnostics.length} browser error(s).`);
    console.log(`Index: ${path.join(outDir, 'manifest.json')}`);
    if (devtools.diagnostics.length) process.exitCode = 1;
  } finally {
    try { devtools?.socket.close(); } catch { /* Already closed. */ }
    if (chromeProcess?.pid) {
      if (process.platform === 'win32') {
        await new Promise((resolve) => {
          const killer = spawn('taskkill', ['/PID', String(chromeProcess.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          killer.once('exit', resolve);
          killer.once('error', resolve);
        });
      } else chromeProcess.kill('SIGTERM');
    }
    if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGTERM');
    if (profileDir) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await fs.rm(profileDir, { recursive: true, force: true });
          break;
        } catch (error) {
          if (attempt === 4) console.warn(`Temporary Chrome profile could not be removed: ${profileDir} (${error.code})`);
          else await delay(250);
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
