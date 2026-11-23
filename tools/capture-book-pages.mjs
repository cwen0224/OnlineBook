#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOOKS = ['zaojiao', 'shigo', 'zaojiao_story', 'penghu_shihu', 'nautilus', 'chequbei'];
const DEFAULTS = {
  lang: 'zh-TW', width: 1440, height: 1000, fromPage: 1,
  translation: 'auto',
};

function help() {
  console.log(`Usage: node tools/capture-book-pages.mjs --book <key> [options]

Capture every visible page state in the actual book reader with headless Chrome.

Required:
  --book <key>            ${BOOKS.join(' | ')}

Options:
  --library               Capture and audit the six-card book library
  --lang <zh-TW|en>       Reader language (default: ${DEFAULTS.lang})
  --mode <spread|focus>   Layout to capture (default: spread)
  --out <directory>       Screenshot output directory (default: OS temp directory)
  --width <pixels>        Browser viewport width (default: ${DEFAULTS.width})
  --height <pixels>       Browser viewport height (default: ${DEFAULTS.height})
  --from-page <number>    First printed page to include (default: 1)
  --to-page <number>      Last printed page to include (default: last page)
  --capture-pages <list>  Capture selected printed pages only (for example 1,2,3,43,50)
  --focus-interaction-test Exercise late-page drag, keyboard, preload, and left-page mode anchoring
  --spread-interaction-test Verify page-drag flipping with English strips open
  --focus-navigation-test Audit focus companions, 2↔3, 3↔4, and left-page mode anchors
  --translation <state>   English display: auto | closed | open (default: auto by language)
  --legacy-panel          Keep the legacy English panel enabled for fallback auditing
  --p12-bars-test         Enable the p12–13 two-column bottom English-strip test
  --ten-spreads-test      Capture ten spreads of bottom strips at desktop and mobile sizes
  --viewport <size>       ten-spreads-test viewport: desktop | mobile | both (default: both)
  --preview-page <number> Overlay page text plus any annotated facing-page text
  --audit-only            Measure overlay fit without writing screenshots
  --base-url <url>        Use an already-running site instead of starting a local server
  --chrome <path>         Chrome executable (or set CHROME_PATH)
  --help                  Show this help

Examples:
  node tools/capture-book-pages.mjs --book penghu_shihu --lang en
  node tools/capture-book-pages.mjs --book zaojiao --from-page 5 --to-page 10 --translation open
  node tools/capture-book-pages.mjs --book penghu_shihu --lang en --preview-page 13
  node tools/capture-book-pages.mjs --book penghu_shihu --ten-spreads-test --out .english-preview/run-name
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
    ['--viewport', 'viewport'],
    ['--mode', 'mode'],
    ['--capture-pages', 'capturePages'],
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') { options.help = true; continue; }
    if (flag === '--audit-only') { options.auditOnly = true; continue; }
    if (flag === '--focus-interaction-test') { options.focusInteractionTest = true; continue; }
    if (flag === '--focus-navigation-test') { options.focusNavigationTest = true; continue; }
    if (flag === '--spread-interaction-test') { options.spreadInteractionTest = true; continue; }
    if (flag === '--legacy-panel') { options.legacyPanel = true; continue; }
    if (flag === '--library') { options.library = true; continue; }
    if (flag === '--p12-bars-test') { options.p12BarsTest = true; continue; }
    if (flag === '--ten-spreads-test') { options.tenSpreadsTest = true; continue; }
    const key = names.get(flag);
    if (!key) throw new Error(`Unknown option: ${flag}`);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
    options[key] = argv[++i];
    explicitlySet.add(key);
  }
  if (options.help) return options;
  if (!BOOKS.includes(options.book)) throw new Error(`--book must be one of: ${BOOKS.join(', ')}`);
  if (!['zh-TW', 'en'].includes(options.lang)) throw new Error('--lang must be zh-TW or en');
  if (!['auto', 'open', 'closed'].includes(options.translation)) throw new Error('--translation must be auto, open or closed');
  options.mode ||= 'spread';
  if (!['spread', 'focus'].includes(options.mode)) throw new Error('--mode must be spread or focus');
  if (options.focusInteractionTest && options.mode !== 'focus') throw new Error('--focus-interaction-test requires --mode focus');
  if (options.focusNavigationTest && options.mode !== 'focus') throw new Error('--focus-navigation-test requires --mode focus');
  if (options.spreadInteractionTest && options.mode !== 'spread') throw new Error('--spread-interaction-test requires --mode spread');
  if (options.p12BarsTest && (options.book !== 'penghu_shihu' || options.lang !== 'en')) {
    throw new Error('--p12-bars-test requires --book penghu_shihu --lang en');
  }
  if (options.tenSpreadsTest) {
    if (options.book !== 'penghu_shihu') throw new Error('--ten-spreads-test requires --book penghu_shihu');
    if (!explicitlySet.has('fromPage')) options.fromPage = 4;
    if (!explicitlySet.has('toPage')) options.toPage = 23;
    options.viewport ||= 'both';
    if (!['desktop', 'mobile', 'both'].includes(options.viewport)) throw new Error('--viewport must be desktop, mobile or both');
    if (Number(options.toPage) - Number(options.fromPage) !== 19 || Number(options.fromPage) % 2 !== 0) {
      throw new Error('--ten-spreads-test requires exactly ten spreads, from an even page through the following odd page (for example --from-page 24 --to-page 43)');
    }
    options.lang = options.lang || 'zh-TW';
  } else if (options.viewport !== undefined) {
    throw new Error('--viewport is only available with --ten-spreads-test');
  }
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
  if (options.capturePages !== undefined) {
    options.capturePages = options.capturePages.split(',').map(Number);
    if (!options.capturePages.length || options.capturePages.some(page => !Number.isInteger(page) || page < 1)) {
      throw new Error('--capture-pages must be a comma-separated list of positive page numbers');
    }
    options.fromPage = Math.min(options.fromPage, ...options.capturePages);
    options.toPage = Math.max(options.toPage ?? 1, ...options.capturePages);
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
    if (!page?.englishTranslation || !page.zones?.length) return [];
    return page.zones.map((zone) => {
      const text = zone.englishText || (page.zones.length === 1 ? page.englishTranslation : null);
      if (!text) return null;
      const points = zone.polygon;
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      return {
        page: number,
        text,
        wordCount: text.trim().split(/\s+/).filter(Boolean).length,
        zoneId: zone.id,
        polygon: points,
        box: { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
      };
    }).filter(Boolean);
  }).flat();
  if (!previews.some((preview) => preview.page === pageNumber)) {
    throw new Error(`Page ${pageNumber} needs page-specific English text and a placement zone in text-placement-zones.json.`);
  }
  return previews;
}

async function readExpectedStripTexts(book, fromPage, toPage) {
  const data = JSON.parse(await fs.readFile(path.join(ROOT, 'text-placement-zones.json'), 'utf8'));
  const pages = data.books?.[book]?.pages || [];
  return Object.fromEntries(Array.from({ length: toPage - fromPage + 1 }, (_, index) => {
    const pageNumber = index + fromPage;
    const page = pages.find((item) => item.page === pageNumber);
    const text = typeof page?.bottomStripText === 'string' ? page.bottomStripText.trim() : '';
    return [String(pageNumber), text || null];
  }));
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
      'display:flex', 'align-items:center', 'justify-content:center', 'overflow:auto',
      'padding:clamp(10px,1.35vw,24px)', 'border-radius:10px', 'color:#fffaf3',
      'background:rgba(112,74,45,.50)',
      'border:1px solid rgba(255,244,226,.28)', 'box-shadow:none'
    ].join(';');
    const left = preview.box.left, top = preview.box.top;
    box.style.clipPath = 'polygon(' + preview.polygon.map(([x,y]) => (((x-left)/preview.box.width)*100) + '% ' + (((y-top)/preview.box.height)*100) + '%').join(',') + ')';
    const text = document.createElement('span');
    text.dataset.cliEnglishText = 'true';
    text.textContent = preview.text;
    text.style.cssText = [
      'display:block', 'width:100%', 'max-height:100%', 'min-height:0', 'overflow:visible',
      'box-sizing:border-box',
      'font:650 clamp(12px,1.12vw,20px)/1.48 system-ui,sans-serif',
      'letter-spacing:.01em', 'white-space:pre-line',
      'text-shadow:0 1px 3px rgba(35,20,10,.48)'
    ].join(';');
    box.append(text);
    face.append(box);
    const requiredHeight = text.scrollHeight;
    const availableHeight = box.clientHeight - parseFloat(getComputedStyle(box).paddingTop) - parseFloat(getComputedStyle(box).paddingBottom);
    const fits = requiredHeight <= availableHeight + 1;
    if (!fits) box.style.outline = '2px solid #ff3b30';
    const rect = box.getBoundingClientRect();
    return { fits, requiredHeight, availableHeight,
      overflowPx: Math.max(0, requiredHeight - availableHeight),
      hoverPoint: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } };
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Page evaluation failed');
    return result.result?.value;
  }
}

async function inspectFocusPages(devtools) {
  return devtools.evaluate(`(() => {
    const book = document.querySelector('#book');
    const bookRect = book?.getBoundingClientRect();
    if (!book || !bookRect) return {mode: null, indicator: '', indicatorPages: [], visiblePages: []};
    const indicator = document.querySelector('#page-indicator')?.textContent.trim() || '';
    const indicatorPages = [...indicator.matchAll(/\\d+/g)].map(match => Number(match[0]));
    const visiblePages = [...document.querySelectorAll('#book img[alt^="第"]')].flatMap(image => {
      const rect = image.getBoundingClientRect();
      const styles = [];
      for (let node = image; node && node !== book.parentElement; node = node.parentElement) {
        styles.push(getComputedStyle(node));
        if (node === book) break;
      }
      if (styles.some(style => style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < .05)) return [];
      const left = Math.max(rect.left, bookRect.left, 0);
      const right = Math.min(rect.right, bookRect.right, innerWidth);
      const top = Math.max(rect.top, bookRect.top, 0);
      const bottom = Math.min(rect.bottom, bookRect.bottom, innerHeight);
      if (right - left < 12 || bottom - top < 12) return [];
      let hitSamples = 0;
      for (const fx of [.25,.5,.75]) for (const fy of [.25,.5,.75]) {
        const x = left + (right-left)*fx, y = top + (bottom-top)*fy;
        const stack = document.elementsFromPoint(x,y);
        const topPageImage = stack.map(node => {
          if (node.matches?.('#book img[alt^="第"]')) return node;
          return node.closest?.('.leaf')?.querySelector('img[alt^="第"]') || null;
        }).find(Boolean);
        if (topPageImage === image) hitSamples += 1;
      }
      return hitSamples ? [{page:Number((image.alt.match(/\\d+/)||[])[0]), hitSamples,
        rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height}}] : [];
    });
    return {mode:document.body.classList.contains('focus-mode')?'focus':'spread', indicator, indicatorPages,
      visiblePages:visiblePages.map(item=>item.page), visiblePageEvidence:visiblePages};
  })()`);
}

function focusCompanionFor(page, total) {
  if (page === 1) return null;
  const companion = page % 2 === 0 ? page + 1 : page - 1;
  return companion <= total ? companion : null;
}

async function runFocusNavigationAudit(devtools, readerUrl, outDir, actualTotal, auditOnly) {
  if (actualTotal < 4) throw new Error('Focus navigation audit requires at least four printed pages.');
  await devtools.send('Page.navigate', {url:readerUrl});
  await waitFor(async () => devtools.evaluate(`(() => document.readyState === 'complete'
    && document.querySelectorAll('#book .leaf img').length > 0 && !document.querySelector('#loading-screen')?.isConnected)()`), 'focus navigation test reader reload', 60000);
  await devtools.evaluate(`(async () => { await document.fonts.ready; return true; })()`);
  const captures=[];
  const failures=[];
  const states={};
  async function readExpected(mode, pages, label) {
    await waitFor(async () => {
      const state=await inspectFocusPages(devtools);
      return state.mode===mode && state.indicatorPages[0]===pages[0]
        && (pages.length===1 || state.indicatorPages[1]===pages[1]);
    }, `${label} state (${mode} ${pages.join('-')})`, 12000);
    await delay(420);
    const state=await inspectFocusPages(devtools);
    state.expectedMode=mode; state.expectedPages=pages;
    state.pageIndicatorMatches=state.mode===mode && state.indicatorPages[0]===pages[0]
      && (pages.length===1 || state.indicatorPages[1]===pages[1]);
    if (!state.pageIndicatorMatches) failures.push(`${label}: indicator ${state.mode} ${state.indicator} did not match ${mode} ${pages.join('-')}`);
    states[label]=state;
    if (mode==='focus') {
      const companion=focusCompanionFor(pages[0],actualTotal);
      state.expectedCompanion=companion;
      state.focusPageVisible=state.visiblePages.includes(pages[0]);
      state.companionVisible=companion===null || state.visiblePages.includes(companion);
      if (!state.focusPageVisible) failures.push(`${label}: focused page ${pages[0]} is not top-visible in the book viewport`);
      if (!state.companionVisible) failures.push(`${label}: same-spread companion ${companion} is not visibly rendered`);
    }
    if (!auditOnly) {
      const file=`focus-navigation-${label}.png`;
      const screenshot=await devtools.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
      await fs.writeFile(path.join(outDir,file),Buffer.from(screenshot.data,'base64'));
      captures.push({label,file});
    }
    return state;
  }
  async function move(button, mode, pages, label) {
    await devtools.evaluate(`document.querySelector(${JSON.stringify(button)}).click()`);
    return readExpected(mode,pages,label);
  }
  async function transitionMode(mode, pages, label, visualPage) {
    const pairPages=visualPage<=1?[1]:[visualPage%2===0?visualPage:visualPage-1,visualPage%2===0?visualPage+1:visualPage].filter(page=>page<=actualTotal);
    const readRect = (markTarget = false) => devtools.evaluate(`(() => {
      const image=[...document.querySelectorAll('#book img')].find(item=>item.alt==='第${visualPage}頁');
      const face=image?.closest('.face');
      if (!face) return null;
      if (${markTarget ? 'true' : 'false'}) face.dataset.modeAuditToken='${label}';
      const ghostPage=document.querySelector('.mode-zoom-ghost-page[data-page="${visualPage}"]');
      const ghostGroup=ghostPage?.parentElement;
      const pageRects=${JSON.stringify(pairPages)}.map(page=>{
        const ghost=document.querySelector('.mode-zoom-ghost-page[data-page="'+page+'"]');
        const target=[...document.querySelectorAll('#book img')].find(item=>item.alt==='第'+page+'頁')?.closest('.face');
        const box=(ghost||target)?.getBoundingClientRect();
        return box?{left:box.left,right:box.right,top:box.top,bottom:box.bottom}:null;
      }).filter(Boolean).sort((a,b)=>a.left-b.left);
      const union=pageRects.length?{
        left:Math.min(...pageRects.map(box=>box.left)),right:Math.max(...pageRects.map(box=>box.right)),
        top:Math.min(...pageRects.map(box=>box.top)),bottom:Math.max(...pageRects.map(box=>box.bottom)),
        width:Math.max(...pageRects.map(box=>box.right))-Math.min(...pageRects.map(box=>box.left)),
        height:Math.max(...pageRects.map(box=>box.bottom))-Math.min(...pageRects.map(box=>box.top))
      }:null;
      const visual=ghostGroup||face;
      const rect=ghostGroup?ghostGroup.getBoundingClientRect():union;
      const style=getComputedStyle(visual);
      return {left:rect.left,top:rect.top,width:rect.width,height:rect.height,
        translate:style.translate,scale:style.scale,
        animations:visual.getAnimations().filter(item=>item.playState==='running').length,
        seamGap:pageRects.length<2?0:pageRects[1].left-pageRects[0].right,
        targetIdentityPreserved:face.dataset.modeAuditToken==='${label}'};
    })()`);
    const start=await readRect();
    await devtools.evaluate(`document.querySelector('#reading-mode-toggle').click()`);
    await readRect(true);
    const samples=[];
    for (const pause of [95,95,95]) {
      await delay(pause);
      samples.push(await readRect());
      if (samples.length===2 && !auditOnly) {
        const screenshot=await devtools.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
        const file=`focus-mode-transition-${label}-mid.png`;
        await fs.writeFile(path.join(outDir,file),Buffer.from(screenshot.data,'base64'));
        captures.push({label:`${label}-mid`,file});
      }
    }
    const state=await readExpected(mode,pages,label);
    const end=await readRect();
    const distance=(a,b)=>a&&b?Math.hypot(a.left-b.left,a.top-b.top,a.width-b.width,a.height-b.height):Infinity;
    const startToEnd=distance(start,end);
    const midToEnd=distance(samples[1],end);
    const probe={visualPage,start,samples,end,startToEnd,midToEnd,
      intermediate:midToEnd>1 && midToEnd<startToEnd,
      settlesNearTarget:distance(samples[2],end)<24,
      sawRunningAnimation:samples.some(sample=>sample?.animations>0)};
    if (!probe.intermediate) failures.push(`${label}: page ${visualPage} did not move through an intermediate geometry`);
    if (!probe.settlesNearTarget) failures.push(`${label}: animation tail does not settle continuously onto the final page geometry`);
    if (!probe.sawRunningAnimation) failures.push(`${label}: no page-face animation was observed in sampled frames`);
    if (samples.some(sample=>sample && !sample.targetIdentityPreserved)) failures.push(`${label}: destination face was replaced during the mode transition`);
    probe.keepsPagesJoined=[...samples,end].every(sample=>sample && Math.abs(sample.seamGap)<=3);
    if (!probe.keepsPagesJoined) failures.push(`${label}: pages separated during the mode transition (seam gap ${[...samples,end].map(sample=>sample?.seamGap).join(', ')})`);
    return {state,probe};
  }
  await readExpected('focus',[1],'cover');
  const p2=await move('#btn-next','focus',[2],'focus-p2');
  const p3=await move('#btn-next','focus',[3],'focus-p3');
  await move('#btn-prev','focus',[2],'focus-p2-return');
  const p3Again=await move('#btn-next','focus',[3],'focus-p3-return');
  const p4=await move('#btn-next','focus',[4],'focus-p4-cross-spread');
  const p3Back=await move('#btn-prev','focus',[3],'focus-p3-cross-spread-back');

  const {state:spreadFromP3,probe:zoomOutP3}=await transitionMode('spread',[2,3],'spread-anchor-from-p3',3);
  const {state:focusFromAnchor,probe:zoomInP2}=await transitionMode('focus',[2],'focus-left-anchor-after-p3-toggle',2);
  const {state:spreadFromP2State,probe:zoomOutP2}=await transitionMode('spread',[2,3],'spread-anchor-from-p2',2);
  const {state:focusFromP2,probe:zoomInP2AfterP2}=await transitionMode('focus',[2],'focus-left-anchor-after-p2-toggle',2);

  const assertions={
    focusP2HasP3Companion:Boolean(p2.companionVisible),
    focusP3HasP2Companion:Boolean(p3.companionVisible),
    withinSpread2To3:Boolean(p3Again.pageIndicatorMatches && p3Again.visiblePages.includes(2) && p3Again.visiblePages.includes(3)),
    withinSpread3To2:Boolean(states['focus-p2-return']?.pageIndicatorMatches
      && states['focus-p2-return']?.visiblePages.includes(2) && states['focus-p2-return']?.visiblePages.includes(3)),
    crossSpread3To4:Boolean(p4.pageIndicatorMatches && p4.visiblePages.includes(4)
      && (focusCompanionFor(4,actualTotal) === null || p4.visiblePages.includes(focusCompanionFor(4,actualTotal)))),
    crossSpread4To3:Boolean(p3Back.pageIndicatorMatches && p3Back.visiblePages.includes(3)
      && p3Back.visiblePages.includes(2)),
    modeAnchorP3ToSpread23ToFocus2:Boolean(spreadFromP3.pageIndicatorMatches && focusFromAnchor.pageIndicatorMatches),
    modeAnchorP2ToSpread23ToFocus2:Boolean(spreadFromP2State.pageIndicatorMatches && focusFromP2.pageIndicatorMatches),
    zoomOutP3Continuous:Boolean(zoomOutP3.intermediate && zoomOutP3.settlesNearTarget && zoomOutP3.sawRunningAnimation),
    zoomInP2Continuous:Boolean(zoomInP2.intermediate && zoomInP2.settlesNearTarget && zoomInP2.sawRunningAnimation),
    zoomOutP2Continuous:Boolean(zoomOutP2.intermediate && zoomOutP2.settlesNearTarget && zoomOutP2.sawRunningAnimation),
    zoomInP2AfterP2ToggleContinuous:Boolean(zoomInP2AfterP2.intermediate && zoomInP2AfterP2.settlesNearTarget && zoomInP2AfterP2.sawRunningAnimation),
    allModeTransitionPagesStayJoined:Boolean([zoomOutP3,zoomInP2,zoomOutP2,zoomInP2AfterP2].every(probe=>probe.keepsPagesJoined)),
  };
  for (const [name,passed] of Object.entries(assertions)) if (!passed) failures.push(`${name}: expected focus companion, navigation target, or left-page anchor was not observed`);
  return {passed:failures.length===0,assertions,failures,states,transitionProbes:{zoomOutP3,zoomInP2,zoomOutP2,zoomInP2AfterP2},captures};
}

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); console.error('Use --help for usage.'); process.exitCode = 2; return; }
  if (options.help) { help(); return; }

  if (options.tenSpreadsTest && options.viewport === 'both') {
    const outDir = path.resolve(options.out || path.join(ROOT, '.english-preview', `shihu-ten-spreads-${new Date().toISOString().replace(/[:.]/g, '-')}`));
    await fs.mkdir(outDir, { recursive: true });
    const childArgs = process.argv.slice(2).filter((value, index, args) => {
      if (value === '--viewport') return false;
      if (index > 0 && args[index - 1] === '--viewport') return false;
      return true;
    });
    for (const viewport of ['desktop', 'mobile']) {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [process.argv[1], ...childArgs, '--viewport', viewport, '--out', outDir], {
          cwd: ROOT, stdio: 'inherit', windowsHide: true,
        });
        child.once('error', reject);
        child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${viewport} ten-spread capture exited with ${code}`)));
      });
    }
    const desktop = JSON.parse(await fs.readFile(path.join(outDir, 'desktop-manifest.json'), 'utf8'));
    const mobile = JSON.parse(await fs.readFile(path.join(outDir, 'mobile-manifest.json'), 'utf8'));
    const audit = {
      requestedSpreads: Array.from({ length: 10 }, (_, index) => [options.fromPage + index * 2, options.fromPage + index * 2 + 1]),
      expectedScreenshotCount: 20,
      actualScreenshotCount: desktop.screenshots.length + mobile.screenshots.length,
      desktop: desktop.audit,
      mobile: mobile.audit,
      browserErrors: [...desktop.diagnostics, ...mobile.diagnostics],
    };
    audit.passed = audit.actualScreenshotCount === audit.expectedScreenshotCount
      && audit.desktop.passed && audit.mobile.passed && audit.browserErrors.length === 0
      && desktop.screenshots.map((state) => state.visiblePages.join('-')).join(',') === Array.from({ length: 10 }, (_, index) => `${options.fromPage + index * 2}-${options.fromPage + index * 2 + 1}`).join(',')
      && mobile.screenshots.map((state) => state.visiblePages.join('-')).join(',') === Array.from({ length: 10 }, (_, index) => `${options.fromPage + index * 2}-${options.fromPage + index * 2 + 1}`).join(',');
    const index = { book: 'penghu_shihu', storyPages: [options.fromPage, options.toPage], language: 'zh-TW', screenshots: [...desktop.screenshots, ...mobile.screenshots], auditFile: 'audit.json' };
    await fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(outDir, 'audit.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(outDir, 'audit.txt'), [
      `Ten-spread audit (${options.fromPage}–${options.toPage}): ${audit.passed ? 'PASS' : 'FAIL'}`,
      `Spreads: ${audit.requestedSpreads.map(([a, b]) => `${a}-${b}`).join(', ')}`,
      `Screenshots: ${audit.actualScreenshotCount}/${audit.expectedScreenshotCount}`,
      `Desktop: ${audit.desktop.passed ? 'PASS' : 'FAIL'} (${audit.desktop.failures.length} layout/text issues; ${desktop.diagnostics.length} browser errors)`,
      `Mobile: ${audit.mobile.passed ? 'PASS' : 'FAIL'} (${audit.mobile.failures.length} layout/text issues; ${mobile.diagnostics.length} browser errors)`,
      ...[...audit.desktop.failures.map((item) => `DESKTOP: ${item}`), ...audit.mobile.failures.map((item) => `MOBILE: ${item}`)],
    ].join('\n') + '\n', 'utf8');
    console.log(`Ten-spread index: ${path.join(outDir, 'manifest.json')}`);
    console.log(`Audit: ${path.join(outDir, 'audit.txt')}`);
    if (!audit.passed) process.exitCode = 1;
    return;
  }

  if (options.tenSpreadsTest) {
    options.width = options.width !== DEFAULTS.width ? options.width : options.viewport === 'mobile' ? 390 : 1440;
    options.height = options.height !== DEFAULTS.height ? options.height : options.viewport === 'mobile' ? 844 : 1000;
    options.lang = 'zh-TW';
    options.fromPage = Number(options.fromPage);
    options.toPage = Number(options.toPage);
    options.translation = 'auto';
  }

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

    if (options.library) {
      await devtools.send('Page.navigate', { url: `${baseUrl.replace(/\/$/, '')}/index.html` });
      await waitFor(async () => devtools.evaluate(`(() => document.readyState === 'complete' && document.querySelectorAll('.book-link').length === 6)()`), 'six-card library');
      await devtools.evaluate(`(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); return true; })()`);
      if (options.lang === 'en') await devtools.evaluate(`document.querySelector('#btn-en').click()`);
      const expectedFeaturedTitle = options.lang === 'en' ? 'Guardians of the Sea Rose: Giant Clam' : '守護海中玫瑰—硨磲貝';
      const layout = await devtools.evaluate(`(() => {
        const shelf = document.querySelector('#entrance-overlay > div:nth-of-type(2)');
        const cards = [...document.querySelectorAll('.book-link')];
        const bounds = element => { const r = element.getBoundingClientRect(); return {left:Math.round(r.left),top:Math.round(r.top),right:Math.round(r.right),bottom:Math.round(r.bottom),width:Math.round(r.width),height:Math.round(r.height)}; };
        const shelfBox = bounds(shelf);
        const cardBoxes = cards.map(bounds);
        const mobile = matchMedia('(max-width: 700px)').matches;
        const featuredTitle = document.querySelector('[data-book="chequbei"] .b-title')?.textContent.trim() || '';
        return { cardCount: cards.length, columns: getComputedStyle(shelf).gridTemplateColumns, mobile,
          featuredTitle, featuredTitleMatches: featuredTitle === ${JSON.stringify(expectedFeaturedTitle)},
          viewport: {width: innerWidth,height: innerHeight}, shelf: shelfBox, cards: cardBoxes,
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
          cardsInsideShelf: cardBoxes.every(card => card.left >= shelfBox.left - 1 && card.right <= shelfBox.right + 1),
          desktopThreeRows: mobile || new Set(cardBoxes.map(card => card.top)).size === 3,
          mobileSingleColumn: !mobile || new Set(cardBoxes.map(card => card.left)).size === 1 };
      })()`);
      const file = `library-${options.width <= 700 ? 'mobile' : 'desktop'}.png`;
      const screenshot = await devtools.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      await fs.writeFile(path.join(outDir, file), Buffer.from(screenshot.data, 'base64'));
      const manifest = { page: 'library', viewport: {width: options.width,height: options.height}, layout, diagnostics: devtools.diagnostics,
        passed: layout.cardCount === 6 && layout.featuredTitleMatches && layout.noHorizontalOverflow && layout.cardsInsideShelf
          && layout.desktopThreeRows && layout.mobileSingleColumn && devtools.diagnostics.length === 0 };
      await fs.writeFile(path.join(outDir, `library-${options.width <= 700 ? 'mobile' : 'desktop'}-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      console.log(`Captured library → ${path.join(outDir, file)} (${manifest.passed ? 'layout PASS' : 'layout FAIL'}; ${devtools.diagnostics.length} browser errors)`);
      if (!manifest.passed) process.exitCode = 1;
      return;
    }

    const readerUrl = `${baseUrl.replace(/\/$/, '')}/viewer.html?book=${encodeURIComponent(options.book)}&lang=${encodeURIComponent(options.lang)}&mode=${options.mode}${options.legacyPanel ? '&legacy=1' : ''}`;
    await devtools.send('Page.navigate', { url: readerUrl });
    await waitFor(async () => devtools.evaluate(`(() => document.readyState === 'complete' && document.querySelectorAll('#book .leaf img').length > 0 && document.querySelector('#btn-next'))()`), 'reader initialization', 60000);
    await devtools.evaluate(`(async () => { await document.fonts.ready; return true; })()`);
    await waitFor(async () => devtools.evaluate(`(() => !document.querySelector('#loading-screen')?.isConnected)()`), 'book loading screen dismissal', 60000);

    let initialToggleEvidence = null;
    {
      const toggleExists = await devtools.evaluate(`Boolean(document.querySelector('#translation-toggle') && getComputedStyle(document.querySelector('#translation-toggle')).display !== 'none')`);
      if (!toggleExists) console.warn('This book has no English panel toggle; capturing with the panel unavailable.');
      else {
        if (options.tenSpreadsTest) {
          initialToggleEvidence = await devtools.evaluate(`(() => {
            const strips = document.querySelector('#page-english-strips');
            return {
              uiLanguage: document.documentElement.lang,
              isOpen: document.body.classList.contains('page-english-open'),
              label: document.querySelector('#translation-toggle')?.textContent.trim() || '',
              renderedStripCount: [...(strips?.querySelectorAll('.page-english-strip') || [])]
                .filter(strip => getComputedStyle(strip).display !== 'none').length,
              stripsHidden: !strips || getComputedStyle(strips).display === 'none'
            };
          })()`);
          initialToggleEvidence.closedDefaultVerified = initialToggleEvidence.uiLanguage === 'zh-TW'
            && !initialToggleEvidence.isOpen
            && initialToggleEvidence.label === '顯示英文'
            && initialToggleEvidence.renderedStripCount === 0
            && initialToggleEvidence.stripsHidden;
          if (!initialToggleEvidence.closedDefaultVerified) {
            throw new Error(`Ten-spread test must start zh-TW with English closed and strips hidden: ${JSON.stringify(initialToggleEvidence)}`);
          }
          // Keep the true default-closed state through navigation to the first target spread.
        } else {
          const panelIsOpen = await devtools.evaluate(`document.body.classList.contains('page-english-open')`);
          const shouldBeOpen = options.translation === 'auto'
            ? options.lang === 'en'
            : options.translation === 'open';
          if (panelIsOpen !== shouldBeOpen) {
            await devtools.evaluate(`document.querySelector('#translation-toggle').click()`);
          }
        }
      }
    }

    const totalPages = await devtools.evaluate(`document.querySelectorAll('#book img[alt^="第"]').length`);
    const manifestRes = await fetch(`${baseUrl.replace(/\/$/, '')}/book_${options.book}_${options.lang}.json`);
    if (!manifestRes.ok) throw new Error(`Could not load book manifest (${manifestRes.status}).`);
    const pageManifest = await manifestRes.json();
    const actualTotal = pageManifest.length;
    const toPage = Math.min(options.toPage ?? actualTotal, actualTotal);
    if (options.fromPage > actualTotal) throw new Error(`--from-page exceeds this book's ${actualTotal} pages.`);
    if (totalPages < actualTotal) throw new Error('Reader page count does not match the book manifest.');

    const states = [];
    if (options.focusInteractionTest) {
      await devtools.evaluate(`(() => {
        const descriptor = Object.getOwnPropertyDescriptor(Image.prototype, 'src');
        window.__focusPreloadUrls = [];
        Object.defineProperty(Image.prototype, 'src', {configurable:true, get(){return descriptor.get.call(this);}, set(value){window.__focusPreloadUrls.push(String(value)); return descriptor.set.call(this,value);}});
        return true;
      })()`);
    }
    const maxStates = options.mode === 'focus' ? actualTotal - 1 : Math.ceil(actualTotal / 2);
    for (let state = 0; state <= maxStates; state += 1) {
      const visiblePages = options.mode === 'focus'
        ? [state + 1]
        : state === 0 ? [1] : [...new Set([Math.min(state * 2, actualTotal), Math.min(state * 2 + 1, actualTotal)])];
      const selectedForCapture = options.focusNavigationTest
        ? [2,3,4].includes(visiblePages[0])
        : visiblePages.some((page) => page >= options.fromPage && page <= toPage
          && (!options.capturePages || options.capturePages.includes(page)));
      if (selectedForCapture) {
        await waitFor(async () => devtools.evaluate(`(async () => {
          const nums = ${JSON.stringify(visiblePages)};
          const imgs = nums.map(n => [...document.querySelectorAll('#book img')].find(img => img.alt === '第' + n + '頁'));
          if (imgs.some(img => !img || !img.complete || img.naturalWidth === 0)) return false;
          await Promise.all(imgs.map(img => img.decode().catch(() => {})));
          return true;
        })()`), `images for ${visiblePages.join('-')}`, 30000);
        if (options.mode === 'focus') {
          await waitFor(async () => devtools.evaluate(`(() => {
            const page = ${visiblePages[0]};
            const image = [...document.querySelectorAll('#book img')].find(item => item.alt === '第' + page + '頁');
            if (!image) return false;
            const expectedHeight = Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--strip-preview-page-height'));
            const imageHeight = image.getBoundingClientRect().height;
            return !document.body.classList.contains('strip-page-open') || !(expectedHeight > 0) || Math.abs(imageHeight - expectedHeight) < 5;
          })()`), `settled focus layout for page ${visiblePages[0]}`, 12000);
        }
        let toggleEvidence = null;
        if (options.tenSpreadsTest && visiblePages[0] === options.fromPage) {
          const initialState = await devtools.evaluate(`(() => ({
            isOpen: document.body.classList.contains('page-english-open'),
            label: document.querySelector('#translation-toggle')?.textContent.trim() || '',
            renderedStripCount: [...document.querySelectorAll('#page-english-strips .page-english-strip')]
              .filter(strip => getComputedStyle(strip).display !== 'none').length
          }))()`);
          if (initialState.isOpen || initialState.label !== '顯示英文' || initialState.renderedStripCount !== 0) {
            throw new Error(`Expected zh-TW default-closed state at spread ${options.fromPage}-${options.fromPage + 1} before clicking: ${JSON.stringify(initialState)}`);
          }
          await devtools.evaluate(`document.querySelector('#translation-toggle').click()`);
          await waitFor(async () => devtools.evaluate(`(() => document.body.classList.contains('page-english-open')
            && document.querySelector('#translation-toggle')?.textContent.trim() === '收合英文')()`), 'user-toggle open English strips');
          await waitFor(async () => devtools.evaluate(`(() => [...document.querySelectorAll('#page-english-strips .page-english-strip')]
            .some(strip => strip.dataset.page === '${options.fromPage + 1}' && getComputedStyle(strip).display !== 'none'))()`), 'English toggle to render first-spread strip');
          const openState = await devtools.evaluate(`(() => ({
            isOpen: document.body.classList.contains('page-english-open'),
            label: document.querySelector('#translation-toggle')?.textContent.trim() || '',
            renderedStripCount: [...document.querySelectorAll('#page-english-strips .page-english-strip')]
              .filter(strip => getComputedStyle(strip).display !== 'none').length
          }))()`);
          const expectedTexts = await readExpectedStripTexts(options.book, options.fromPage, options.toPage);
          const expectedCount = [options.fromPage, options.fromPage + 1].filter(page => expectedTexts[String(page)]).length;
          toggleEvidence = { initialState, closedDefaultVerified: !initialState.isOpen && initialState.label === '顯示英文' && initialState.renderedStripCount === 0, openState,
            openStateVerified: openState.isOpen && openState.label === '收合英文' && openState.renderedStripCount === expectedCount };
        }
        if (options.tenSpreadsTest) {
          await waitFor(async () => devtools.evaluate(`(() => {
            const container = document.querySelector('#page-english-strips');
            const rendered = Math.ceil(container?.getBoundingClientRect().height || 0);
            const reserved = Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--strip-preview-height')) || 0;
            return document.body.classList.contains('page-english-open') && Math.abs(rendered - reserved) <= 1;
          })()`), `strip space reservation for spread ${visiblePages.join('-')}`);
          await waitFor(async () => devtools.evaluate(`(() => [...document.querySelectorAll('#page-english-strips .page-english-strip')]
            .every(strip => {
              const shouldCue = getComputedStyle(strip).overflowY === 'auto' && strip.scrollHeight > strip.clientHeight + 1;
              return shouldCue === strip.classList.contains('is-scrollable');
            }))()`), `scroll cue synchronization for spread ${visiblePages.join('-')}`, 5000);
        }
        await delay(250);
        await waitFor(async () => devtools.evaluate(`(() => {
          const bookRect = document.querySelector('#book').getBoundingClientRect();
          const pages = ${JSON.stringify(visiblePages)};
          return bookRect.width > 1 && bookRect.height > 1 && pages.every(page => {
            const image = [...document.querySelectorAll('#book img')].find(item => item.alt === '第' + page + '頁');
            const rect = image?.getBoundingClientRect();
            return image && image.naturalWidth > 0 && rect.width > 1 && rect.height > 1;
          });
        })()`), `visible book layout for spread ${visiblePages.join('-')}`, 10000);
        const pageBoxAudit = await devtools.evaluate(`(() => {
          const pages = ${JSON.stringify(visiblePages)};
          return pages.flatMap(page => {
            const img = [...document.querySelectorAll('#book img')].find(item => item.alt === '第' + page + '頁');
            const face = img?.closest('.face');
            const boxes = [...(face?.querySelectorAll('.page-english-box') || [])];
            return boxes
              .filter(box => getComputedStyle(box).display !== 'none')
              .map(box => {
                const rect = box.getBoundingClientRect();
                return {
                  page,
                  label: box.getAttribute('aria-label'),
                  width: Math.round(box.clientWidth),
                  height: Math.round(box.clientHeight),
                  bounds: { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom) },
                  fontSize: getComputedStyle(box).fontSize,
                  scrollWidth: Math.round(box.scrollWidth),
                  scrollHeight: Math.round(box.scrollHeight),
                  fits: box.scrollWidth <= box.clientWidth + 1 && box.scrollHeight <= box.clientHeight + 1
                };
              });
          });
        })()`);
        const legacyBoxAudit = await devtools.evaluate(`(() => {
          const pages = ${JSON.stringify(visiblePages)};
          return pages.flatMap(page => {
            const image = [...document.querySelectorAll('#book img')].find(item => item.alt === '第' + page + '頁');
            return [...(image?.closest('.face')?.querySelectorAll('.page-english-box') || [])].map(box => ({
              page,
              visible: getComputedStyle(box).display !== 'none' && box.getBoundingClientRect().width > 0,
              text: box.textContent.trim()
            }));
          });
        })()`);
        const stripLayout = await devtools.evaluate(`(() => {
          const container = document.querySelector('#page-english-strips');
          if (!container || getComputedStyle(container).display === 'none') return null;
          const strips = [...container.querySelectorAll('.page-english-strip')];
          const controlsRect = document.querySelector('#controls').getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const pages = strips.map(strip => {
            const page = Number(strip.dataset.page);
            const paragraph = strip.querySelector('.page-english-strip-text p');
            const blankParagraph = strip.querySelector('.page-english-strip-text .empty-paragraph');
            const paragraphStyle = paragraph ? getComputedStyle(paragraph) : null;
            const blankParagraphRect = blankParagraph?.getBoundingClientRect();
            const paragraphGapRatio = paragraphStyle && blankParagraphRect
              ? blankParagraphRect.height / parseFloat(paragraphStyle.lineHeight)
              : null;
            const image = [...document.querySelectorAll('#book img')].find(item => item.alt === '第' + page + '頁');
            const pageRect = image?.getBoundingClientRect();
            const stripRect = strip.getBoundingClientRect();
            return {
              page,
              text: strip.dataset.englishText || strip.textContent.trim(),
              stripBounds: { left: Math.round(stripRect.left), top: Math.round(stripRect.top), right: Math.round(stripRect.right), bottom: Math.round(stripRect.bottom) },
              pageBounds: pageRect ? { left: Math.round(pageRect.left), top: Math.round(pageRect.top), right: Math.round(pageRect.right), bottom: Math.round(pageRect.bottom) } : null,
              gapBelowPage: pageRect ? Math.round(stripRect.top - pageRect.bottom) : null,
              outsideBook: Boolean(pageRect && stripRect.top >= pageRect.bottom),
              overflowY: getComputedStyle(strip).overflowY,
              canScroll: getComputedStyle(strip).overflowY === 'auto' && strip.scrollHeight > strip.clientHeight + 1,
              textAlign: getComputedStyle(strip.querySelector('.page-english-strip-text') || strip).textAlign,
              textAlignLast: getComputedStyle(strip.querySelector('.page-english-strip-text') || strip).textAlignLast,
              paragraphGapRatio,
              ordinaryParagraphMarginTop: paragraph ? getComputedStyle(paragraph).marginTop : null,
              hasScrollCue: strip.classList.contains('is-scrollable'),
              fits: strip.scrollWidth <= strip.clientWidth + 1 && (strip.scrollHeight <= strip.clientHeight + 1 || getComputedStyle(strip).overflowY === 'auto'),
              scrollWidth: Math.round(strip.scrollWidth), clientWidth: Math.round(strip.clientWidth),
              scrollHeight: Math.round(strip.scrollHeight), clientHeight: Math.round(strip.clientHeight),
              fontSize: getComputedStyle(strip).fontSize
            };
          });
          const containerRect = container.getBoundingClientRect();
          const sceneRect = document.querySelector('#scene').getBoundingClientRect();
          const bookRect = document.querySelector('#book').getBoundingClientRect();
          const safeTop = 48;
          const safeBottom = controlsRect.top - 12;
          const compositionTop = Math.min(bookRect.top, ...pages.map(page => page.stripBounds.top));
          const compositionBottom = Math.max(bookRect.bottom, ...pages.map(page => page.stripBounds.bottom));
          const pageBottom = Math.max(bookRect.bottom, ...pages.map(page => page.pageBounds?.bottom || bookRect.bottom));
          const pageToStripGap = pages.length ? Math.min(...pages.map(page => page.gapBelowPage)) : null;
          const topSlack = Math.round(compositionTop - safeTop);
          const bottomSlack = Math.round(safeBottom - compositionBottom);
          const expected = ${JSON.stringify(options.tenSpreadsTest ? await readExpectedStripTexts(options.book, options.fromPage, options.toPage) : null)};
          const visible = ${JSON.stringify(visiblePages)};
          const expectedForSpread = expected ? visible.filter(page => page >= ${options.fromPage} && page <= ${toPage})
            .map(page => ({ page, text: expected[String(page)] || null })) : [];
          const textMatches = expected ? expectedForSpread.every((item) => {
            const actual = pages.find((page) => page.page === item.page)?.text || null;
            return actual === item.text;
          }) && strips.length === expectedForSpread.filter((item) => item.text).length : null;
          return {
            strips: pages,
            stripTop: Math.round(containerRect.top), stripBottom: Math.round(containerRect.bottom),
            gapToControls: Math.round(controlsRect.top - containerRect.bottom),
            allOutsideBook: pages.every(page => page.outsideBook),
            allFit: pages.every(page => page.fits),
            allLeftAligned: pages.every(page => page.textAlign === 'left' && page.textAlignLast === 'left'),
            paragraphGapsHalfLine: pages.filter(page => page.paragraphGapRatio !== null)
              .every(page => Math.abs(page.paragraphGapRatio - 0.5) <= 0.015),
            ordinaryParagraphMarginsUnchanged: pages.every(page => page.ordinaryParagraphMarginTop === '0px'),
            scrollablePagesHaveCue: pages.every(page => page.canScroll === page.hasScrollCue),
            textMatches,
            suppressedPages: expectedForSpread.filter(item => !item.text).map(item => item.page),
            p43ScrollEvidence: pages.find(page => page.page === 43)
              ? { overflowY: pages.find(page => page.page === 43).overflowY, scrollHeight: pages.find(page => page.page === 43).scrollHeight,
                  clientHeight: pages.find(page => page.page === 43).clientHeight, canScroll: pages.find(page => page.page === 43).canScroll,
                  hasScrollCue: pages.find(page => page.page === 43).hasScrollCue }
              : null,
            scene: { top: Math.round(sceneRect.top), bottom: Math.round(sceneRect.bottom) },
            book: { top: Math.round(bookRect.top), bottom: Math.round(bookRect.bottom) },
            safeArea: { top: safeTop, bottom: Math.round(safeBottom), controlsBottom: Math.round(viewportHeight - controlsRect.bottom) },
            composition: { top: Math.round(compositionTop), bottom: Math.round(compositionBottom) },
            pageToStripGap,
            layoutVariables: Object.fromEntries(['--strip-preview-height', '--strip-preview-scene-top', '--strip-preview-scene-bottom', '--strip-preview-strip-top', '--strip-preview-page-height', '--strip-preview-scale'].map(name => [name, document.body.style.getPropertyValue(name)])),
            verticalSlack: { top: topSlack, bottom: bottomSlack, balanceDelta: Math.abs(topSlack - bottomSlack) },
            bookInsideScene: bookRect.top >= sceneRect.top - 1 && bookRect.bottom <= sceneRect.bottom + 1,
            controlsVisible: controlsRect.top >= 0 && controlsRect.bottom <= innerHeight,
            controlsInsideViewport: controlsRect.left >= 0 && controlsRect.right <= innerWidth,
            controlsGap: Math.round(controlsRect.top - containerRect.bottom)
          };
        })()`);
        const translationState = await devtools.evaluate(`({
          englishOpen: document.body.classList.contains('page-english-open'),
          fallbackPanelOpen: document.body.classList.contains('translation-open'),
          legacyView: document.body.classList.contains('legacy-translation-view'),
          legacyPanelPresent: Boolean(document.querySelector('#translation-panel #translation-content')),
          legacyPanelVisible: getComputedStyle(document.querySelector('#translation-panel')).display !== 'none',
          visibleLegacyPageBoxes: [...document.querySelectorAll('#book .page-english-box')].filter(box => getComputedStyle(box).display !== 'none').length,
          stripContainerPresent: Boolean(document.querySelector('#page-english-strips')),
          stripContainerVisible: Boolean(document.querySelector('#page-english-strips') && getComputedStyle(document.querySelector('#page-english-strips')).display !== 'none'),
          visibleStripCount: [...document.querySelectorAll('#page-english-strips .page-english-strip')]
            .filter(strip => getComputedStyle(strip).display !== 'none' && strip.getBoundingClientRect().width > 0).length,
          stripPageOpen: document.body.classList.contains('strip-page-open'),
          translationToggleLabel: document.querySelector('#translation-toggle')?.textContent?.trim() || '',
          uiLanguage: document.documentElement.lang,
          coffeeUi: Object.fromEntries(['#top-bar a', '#book-title', '#translation-toggle', '#page-indicator', '#btn-prev', '#spread-info', '#btn-next'].map(selector => {
            const element = document.querySelector(selector);
            const style = element ? getComputedStyle(element) : null;
            return [selector, style ? { background: style.backgroundColor, borderRadius: style.borderRadius, color: style.color } : null];
          }))
        })`);
        const expectedVisibleStripPages = (await readExpectedStripTexts(options.book, 1, actualTotal));
        const expectedStripPages = Object.entries(expectedVisibleStripPages)
          .filter(([page, text]) => visiblePages.includes(Number(page)) && text)
          .map(([page]) => Number(page));
        const actualStripPages = await devtools.evaluate(`([...document.querySelectorAll('#page-english-strips .page-english-strip')]
          .filter(strip => getComputedStyle(strip).display !== 'none' && strip.getBoundingClientRect().width > 0)
          .map(strip => Number(strip.dataset.page)).sort((a,b) => a-b))`);
        const visibleStripPagesMatch = JSON.stringify(actualStripPages) === JSON.stringify(expectedStripPages);
        let wheelScrollEvidence = null;
        const scrollableStrip = stripLayout?.strips.find(strip => strip.canScroll);
        if (scrollableStrip) {
          const target = await devtools.evaluate(`(() => {
            const strip = [...document.querySelectorAll('#page-english-strips .page-english-strip')]
              .find(item => Number(item.dataset.page) === ${scrollableStrip.page});
            if (!strip) return null;
            const rect = strip.getBoundingClientRect();
            return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
          })()`);
          const before = await devtools.evaluate(`(() => ({
            scrollTop: document.querySelector('#page-english-strips .page-english-strip[data-page="${scrollableStrip.page}"]')?.scrollTop ?? -1,
            indicator: document.querySelector('#page-indicator')?.textContent.trim(),
            angles: [...document.querySelectorAll('#book .leaf')].map(leaf => leaf.style.transform)
          }))()`);
          if (target) {
            await devtools.send('Input.dispatchMouseEvent', {
              type: 'mouseWheel', x: target.x, y: target.y, deltaX: 0, deltaY: 180,
            });
            await delay(100);
          }
          const nativeAfter = await devtools.evaluate(`(() => ({
            scrollTop: document.querySelector('#page-english-strips .page-english-strip[data-page="${scrollableStrip.page}"]')?.scrollTop ?? -1,
            indicator: document.querySelector('#page-indicator')?.textContent.trim(),
            angles: [...document.querySelectorAll('#book .leaf')].map(leaf => leaf.style.transform)
          }))()`);
          let eventEvidence = null;
          if (target && nativeAfter.scrollTop <= before.scrollTop) {
            eventEvidence = await devtools.evaluate(`(() => {
              const point = ${JSON.stringify(target)};
              const event = new WheelEvent('wheel', { deltaY: 180, deltaX: 0, bubbles: true, cancelable: true,
                clientX: point.x, clientY: point.y });
              const targetElement = document.elementFromPoint(point.x, point.y);
              targetElement?.dispatchEvent(event);
              return { defaultPrevented: event.defaultPrevented, target: targetElement?.className || targetElement?.id || targetElement?.tagName };
            })()`);
            await delay(50);
          }
          const after = await devtools.evaluate(`(() => ({
            scrollTop: document.querySelector('#page-english-strips .page-english-strip[data-page="${scrollableStrip.page}"]')?.scrollTop ?? -1,
            indicator: document.querySelector('#page-indicator')?.textContent.trim(),
            angles: [...document.querySelectorAll('#book .leaf')].map(leaf => leaf.style.transform)
          }))()`);
          wheelScrollEvidence = { page: scrollableStrip.page, target, before, after,
            nativeAfter, eventEvidence,
            scrolled: after.scrollTop > before.scrollTop,
            pageStateUnchanged: before.indicator === after.indicator && JSON.stringify(before.angles) === JSON.stringify(after.angles) };
        }
        const label = visiblePages.length === 1 ? `page-${String(visiblePages[0]).padStart(3, '0')}` : `spread-${String(visiblePages[0]).padStart(3, '0')}-${String(visiblePages[1]).padStart(3, '0')}`;
        const focusLayout = await devtools.evaluate(`(() => {
          const book = document.querySelector('#book');
          const image = [...document.querySelectorAll('#book img')].find(item => item.alt === '第${visiblePages[0]}頁');
          const rect = image?.getBoundingClientRect();
          const scene = document.querySelector('#scene').getBoundingClientRect();
          const strip = [...document.querySelectorAll('#page-english-strips .page-english-strip')].find(item => item.dataset.page === '${visiblePages[0]}');
          const stripRect = strip?.getBoundingClientRect();
          const controls = document.querySelector('#controls').getBoundingClientRect();
          return {mode: document.body.classList.contains('focus-mode') ? 'focus' : 'spread', page: image?.alt,
            pageRect: rect && {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height},
            scene: {left: scene.left, top: scene.top, right: scene.right, bottom: scene.bottom},
            stripRect: stripRect && {left: stripRect.left, top: stripRect.top, right: stripRect.right, bottom: stripRect.bottom, width: stripRect.width, height: stripRect.height},
            controls: {top: controls.top, bottom: controls.bottom},
            topmostPageAtCenter: document.elementFromPoint(innerWidth/2, (rect.top+rect.bottom)/2)?.closest('img')?.alt || null,
            viewportSafe: Boolean(rect && rect.left >= scene.left-1 && rect.right <= scene.right+1 && rect.top >= 40 && rect.bottom < controls.top),
            stripSafe: !stripRect || (stripRect.left>=0 && stripRect.right<=innerWidth && stripRect.top>=rect.bottom && stripRect.bottom<=controls.top),
            pageWidth: rect?.width || 0};
        })()`);
        const focusPageAudit = options.mode === 'focus' ? await inspectFocusPages(devtools) : null;
        if (focusPageAudit) {
          focusPageAudit.expectedFocusPage = visiblePages[0];
          focusPageAudit.expectedCompanionPage = focusCompanionFor(visiblePages[0], actualTotal);
          focusPageAudit.companionVisible = focusPageAudit.expectedCompanionPage === null
            || focusPageAudit.visiblePages.includes(focusPageAudit.expectedCompanionPage);
          focusPageAudit.focusPageVisible = focusPageAudit.visiblePages.includes(visiblePages[0]);
        }
        let file = null;
        if (!options.auditOnly) {
          file = `${options.book}-${options.lang}-${options.translation}-${options.viewport || 'single'}-${label}.png`;
          const screenshot = await devtools.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
          await fs.writeFile(path.join(outDir, file), Buffer.from(screenshot.data, 'base64'));
          console.log(`Captured ${visiblePages.join('–')} → ${path.join(outDir, file)}`);
        }
        states.push({ visiblePages, file, width: options.width, height: options.height, focusLayout, focusPageAudit, ...translationState,
          expectedVisibleStripPages: options.translation === 'closed' ? [] : expectedStripPages,
          actualStripPages, visibleStripPagesMatch: options.translation === 'closed' || visibleStripPagesMatch,
          wheelScrollEvidence,
          initialToggleEvidence, toggleEvidence, pageBoxAudit, legacyBoxAudit, stripLayout });
        if (options.auditOnly) console.log(`Audited ${visiblePages.join('–')}: ${pageBoxAudit.length} visible English box(es)`);
        const visiblePreviews = previews.filter((preview) => visiblePages.includes(preview.page));
        if (visiblePreviews.length && !options.auditOnly) {
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

    const expectedStripTextsForAudit = options.tenSpreadsTest
      ? await readExpectedStripTexts(options.book, options.fromPage, toPage)
      : {};
    const stripFailures = options.tenSpreadsTest ? states.flatMap((state) => {
      const first = state.visiblePages[0], last = state.visiblePages.at(-1);
      const expectedPages = [first, last].filter((page) => page >= options.fromPage && page <= toPage);
      const layout = state.stripLayout;
      const failures = [];
      if (!state.englishOpen) failures.push(`spread ${first}-${last}: English toggle is closed while strips are required open`);
      if (!state.initialToggleEvidence?.closedDefaultVerified) {
        failures.push(`spread ${first}-${last}: Chinese initial default must be closed with strips hidden`);
      }
      if (first === options.fromPage && !state.toggleEvidence?.openStateVerified) {
        failures.push(`spread ${first}-${last}: explicit toggle-open strip evidence did not pass`);
      }
      if (state.fallbackPanelOpen) failures.push(`spread ${first}-${last}: legacy translation panel should remain hidden`);
      if (!state.legacyPanelPresent || state.legacyView) failures.push(`spread ${first}-${last}: legacy panel DOM must remain available but legacy mode disabled`);
      if (state.uiLanguage !== 'zh-TW') failures.push(`spread ${first}-${last}: ten-spread test UI language is not zh-TW`);
      if (state.translationToggleLabel !== '收合英文') failures.push(`spread ${first}-${last}: Chinese UI toggle does not show the open/collapse state`);
      if (!layout) failures.push(`spread ${first}-${last}: strips missing`);
      else {
        if (!layout.allOutsideBook) failures.push(`spread ${first}-${last}: a strip overlaps its book page`);
        if (!layout.allFit) failures.push(`spread ${first}-${last}: strip text overflows its strip`);
        if (!layout.allLeftAligned) failures.push(`spread ${first}-${last}: strip text or card content is not left aligned`);
        if (!layout.paragraphGapsHalfLine) failures.push(`spread ${first}-${last}: paragraph blank-line spacing is not half the normal line height`);
        if (!layout.ordinaryParagraphMarginsUnchanged) failures.push(`spread ${first}-${last}: ordinary paragraph margins changed`);
        if (!layout.scrollablePagesHaveCue) failures.push(`spread ${first}-${last}: scrollable strip lacks its visible scroll cue or cue is shown unnecessarily`);
        if (!layout.textMatches) failures.push(`spread ${first}-${last}: text does not match per-page zone text or expected strip count`);
        if (!layout.bookInsideScene) failures.push(`spread ${first}-${last}: book exceeds reserved scene bounds`);
        if (!layout.controlsVisible) failures.push(`spread ${first}-${last}: navigation controls clipped by viewport`);
        if (!layout.controlsInsideViewport) failures.push(`spread ${first}-${last}: navigation controls extend beyond viewport width`);
        if (layout.gapToControls < 0) failures.push(`spread ${first}-${last}: strip collides with navigation controls`);
        if (options.viewport === 'mobile') {
          const { top, bottom, balanceDelta } = layout.verticalSlack;
          if (top < 16 || bottom < 16 || balanceDelta > 24) {
            failures.push(`spread ${first}-${last}: mobile book+strip group is not vertically balanced in safe area (top ${top}px, bottom ${bottom}px, delta ${balanceDelta}px)`);
          }
          if (layout.safeArea.controlsBottom < 16) {
            failures.push(`spread ${first}-${last}: controls bottom safe margin below 16px (${layout.safeArea.controlsBottom}px)`);
          }
        }
        if (options.viewport === 'mobile' && layout.strips.some((strip) => strip.gapBelowPage < 8 || strip.gapBelowPage > 24)) {
          failures.push(`spread ${first}-${last}: mobile page-to-strip gap outside 8–24px (${layout.strips.map((strip) => `${strip.page}:${strip.gapBelowPage}px`).join(', ')})`);
        }
      const expectedStripCount = expectedPages.filter((page) => expectedStripTextsForAudit[String(page)]).length;
        if (layout.strips.length !== expectedStripCount) failures.push(`spread ${first}-${last}: expected ${expectedStripCount} separate per-page strip(s)`);
        if (layout.strips.some((strip) => !expectedStripTextsForAudit[String(strip.page)])) failures.push(`spread ${first}-${last}: strip rendered for a page with no expected English`);
        if (first <= 43 && last >= 43 && (!layout.p43ScrollEvidence?.canScroll
          || layout.p43ScrollEvidence.overflowY !== 'auto'
          || layout.p43ScrollEvidence.scrollHeight <= layout.p43ScrollEvidence.clientHeight
          || !layout.p43ScrollEvidence.hasScrollCue)) {
          failures.push('page 43: audit did not prove scrollHeight > clientHeight, overflow-y auto, and a visible scroll cue');
        }
      }
      return failures;
    }) : [];
    let focusNavigation = null;
    if (options.focusNavigationTest) {
      focusNavigation = await runFocusNavigationAudit(devtools, readerUrl, outDir, actualTotal, options.auditOnly);
    }
    let focusInteraction = null;
    if (options.focusInteractionTest) {
      await devtools.evaluate(`(() => {
        const descriptor = Object.getOwnPropertyDescriptor(Image.prototype, 'src');
        window.__focusPreloadUrls = [];
        Object.defineProperty(Image.prototype, 'src', {configurable:true,
          get(){return descriptor.get.call(this);},
          set(value){window.__focusPreloadUrls.push(String(value)); return descriptor.set.call(this,value);}});
        return true;
      })()`);
      const startPage = Math.max(2, Math.min(options.fromPage, actualTotal - 2));
      if (options.mode !== 'focus' || options.toPage < startPage) throw new Error('Interaction test page must be within the selected focus capture range.');
      let position = await inspectFocusPages(devtools);
      let navigationGuard = actualTotal + 2;
      while (position.indicatorPages[0] !== startPage && navigationGuard-- > 0) {
        const button = position.indicatorPages[0] > startPage ? '#btn-prev' : '#btn-next';
        await devtools.evaluate(`document.querySelector(${JSON.stringify(button)}).click()`);
        await delay(420);
        position = await inspectFocusPages(devtools);
      }
      if (position.indicatorPages[0] !== startPage) throw new Error(`Could not position focus interaction test at page ${startPage}: ${position.indicator}`);
      focusInteraction = await devtools.evaluate(`(() => {
        const image = [...document.querySelectorAll('#book img')].find(item => item.alt === '第${startPage}頁');
        if (!image) return {ready:false};
        window.__focusPointerEvents=[];
        for (const type of ['pointerdown','pointermove','pointerup','pointercancel']) document.querySelector('#book').addEventListener(type,event=>window.__focusPointerEvents.push({type,target:event.target.closest('.leaf')?.dataset.index||null,pointerId:event.pointerId,x:event.clientX,y:event.clientY}),true);
        const rect=image.getBoundingClientRect();
        return {ready:true, startPage:${startPage}, x:rect.right-18, y:rect.top+rect.height/2, width:rect.width,
          mode:document.body.classList.contains('focus-mode')?'focus':'spread'};
      })()`);
      if (focusInteraction?.ready) {
        await devtools.send('Input.dispatchMouseEvent', {type:'mousePressed',x:focusInteraction.x,y:focusInteraction.y,button:'left',buttons:1});
        await devtools.send('Input.dispatchMouseEvent', {type:'mouseMoved',x:Math.round(focusInteraction.x-focusInteraction.width*.9),y:focusInteraction.y,button:'left',buttons:1});
        await devtools.send('Input.dispatchMouseEvent', {type:'mouseReleased',x:Math.round(focusInteraction.x-focusInteraction.width*.9),y:focusInteraction.y,button:'left',buttons:0});
        await delay(520);
        const dragResult = await devtools.evaluate(`({indicator:document.querySelector('#page-indicator').textContent.trim(),angles:[...document.querySelectorAll('#book .leaf')].map(leaf=>leaf.style.transform)})`);
        const dragPage = dragResult.indicator;
        await delay(420);
        await devtools.send('Input.dispatchKeyEvent', {type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
        await devtools.send('Input.dispatchKeyEvent', {type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
        await delay(520);
        const keyboardPage = await devtools.evaluate(`document.querySelector('#page-indicator').textContent.trim()`);
        const preload = await devtools.evaluate(`(() => {
          const img=[...document.querySelectorAll('#book img')].find(item=>item.alt==='第${startPage+1}頁');
          return {requested:window.__focusPreloadUrls.some(url=>url.includes(img?.getAttribute('src')?.split('?')[0]||'__missing__')),
            loaded:Boolean(img?.complete&&img.naturalWidth>0), observed:window.__focusPreloadUrls.length};
        })()`);
        await devtools.evaluate(`document.querySelector('#reading-mode-toggle').click()`);
        await delay(520);
        const spreadState = await devtools.evaluate(`({mode:document.body.classList.contains('focus-mode')?'focus':'spread',indicator:document.querySelector('#page-indicator').textContent.trim(),pressed:document.querySelector('#reading-mode-toggle').getAttribute('aria-pressed')})`);
        await devtools.evaluate(`document.querySelector('#reading-mode-toggle').click()`);
        await delay(520);
        const focusState = await devtools.evaluate(`({mode:document.body.classList.contains('focus-mode')?'focus':'spread',indicator:document.querySelector('#page-indicator').textContent.trim(),pressed:document.querySelector('#reading-mode-toggle').getAttribute('aria-pressed'),preference:localStorage.getItem('onlinebook.readingMode')})`);
        const keyboardFocusPage = Math.min(startPage + 2, actualTotal);
        const keyboardAnchorPage = keyboardFocusPage === 1 ? 1 : keyboardFocusPage % 2 === 0 ? keyboardFocusPage : keyboardFocusPage - 1;
        const dragFirstPage = Number((dragPage.match(/\d+/) || [])[0]) || null;
        const keyboardFirstPage = Number((keyboardPage.match(/\d+/) || [])[0]) || null;
        const spreadFirstPages = [...spreadState.indicator.matchAll(/\d+/g)].map(match => Number(match[0]));
        const focusFirstPage = Number((focusState.indicator.match(/\d+/) || [])[0]) || null;
        focusInteraction = {ready:true,startPage,dragPage,dragResult,pointerEvents:await devtools.evaluate(`window.__focusPointerEvents`),preload,spreadState,focusState,
          dragAdvanced:dragFirstPage===startPage+1,keyboardAdvanced:keyboardFirstPage===keyboardFocusPage,
          preloadRequested:preload.requested&&preload.loaded,
          toggleUsesLeftAnchor:spreadState.mode==='spread'&&spreadFirstPages[0]===keyboardAnchorPage
            &&(keyboardAnchorPage+1>actualTotal||spreadFirstPages[1]===keyboardAnchorPage+1)
            &&focusState.mode==='focus'&&focusFirstPage===keyboardAnchorPage&&focusState.preference==='focus'};
      }
    }
    let spreadInteraction = null;
    if (options.spreadInteractionTest) {
      await devtools.send('Page.navigate', { url: readerUrl });
      await waitFor(async () => devtools.evaluate(`(() => document.readyState === 'complete'
        && document.querySelectorAll('#book .leaf img').length > 0 && document.querySelector('#btn-next'))()`), 'spread interaction reader initialization', 60000);
      await waitFor(async () => devtools.evaluate(`(() => !document.querySelector('#loading-screen')?.isConnected)()`), 'spread interaction loading screen', 60000);
      const englishInitiallyOpen = await devtools.evaluate(`document.body.classList.contains('page-english-open')`);
      const englishShouldBeOpen = options.translation === 'auto' ? options.lang === 'en' : options.translation === 'open';
      if (englishInitiallyOpen !== englishShouldBeOpen) await devtools.evaluate(`document.querySelector('#translation-toggle').click()`);
      await devtools.evaluate(`document.querySelector('#btn-next').click()`);
      await delay(480);
      const dragPoint = await devtools.evaluate(`(() => {
        const image = [...document.querySelectorAll('#book img')].find(item => item.alt === '第3頁');
        if (!image) return {ready:false};
        const rect = image.getBoundingClientRect();
        return {ready:rect.width>1&&rect.height>1,x:rect.right-18,y:rect.top+rect.height/2,width:rect.width,
          page:document.querySelector('#page-indicator').textContent.trim(),englishOpen:document.body.classList.contains('page-english-open')};
      })()`);
      if (dragPoint.ready) {
        const dragEndX = Math.round(dragPoint.x - dragPoint.width * 0.9);
        await devtools.send('Input.dispatchMouseEvent', {type:'mousePressed',x:dragPoint.x,y:dragPoint.y,button:'left',buttons:1});
        await devtools.send('Input.dispatchMouseEvent', {type:'mouseMoved',x:dragEndX,y:dragPoint.y,button:'left',buttons:1});
        await devtools.send('Input.dispatchMouseEvent', {type:'mouseReleased',x:dragEndX,y:dragPoint.y,button:'left',buttons:0});
        await delay(520);
        const finalPage = await devtools.evaluate(`document.querySelector('#page-indicator').textContent.trim()`);
        const initialFirstPage = Number((dragPoint.page.match(/\d+/) || [])[0]) || null;
        const finalFirstPage = Number((finalPage.match(/\d+/) || [])[0]) || null;
        spreadInteraction = {dragPoint,finalPage,dragAdvanced:finalFirstPage===initialFirstPage+2};
      } else spreadInteraction = {ready:false,dragPoint};
    }
    const diagnostics = devtools.diagnostics;
    const stripHeightSamples = states.flatMap(state => state.stripLayout?.strips.map(strip => strip.stripBounds.bottom - strip.stripBounds.top) || []);
    const stripHeightRange = stripHeightSamples.length
      ? Math.max(...stripHeightSamples) - Math.min(...stripHeightSamples)
      : 0;
    const stripHeightFailure = stripHeightRange > 1
      ? [`English strip height changed by ${stripHeightRange}px across captured pages`]
      : [];
    const visibleStripFailures = states.filter(state => !state.visibleStripPagesMatch)
      .map(state => `visible pages ${state.visiblePages.join('-')}: expected English strips ${state.expectedVisibleStripPages.join(',') || '(none)'}, got ${state.actualStripPages.join(',') || '(none)'}`);
    const wheelFailures = states.filter(state => state.wheelScrollEvidence
      && (!state.wheelScrollEvidence.scrolled || !state.wheelScrollEvidence.pageStateUnchanged))
      .map(state => `page ${state.wheelScrollEvidence.page}: wheel scroll did not move the strip without changing reader state`);
    const audit = {
      passed: stripFailures.length === 0 && visibleStripFailures.length === 0 && wheelFailures.length === 0 && stripHeightFailure.length === 0 && diagnostics.length === 0
        && states.filter(state => state.focusPageAudit).every(state => state.focusPageAudit.focusPageVisible && state.focusPageAudit.companionVisible)
        && (!options.focusNavigationTest || Boolean(focusNavigation?.passed))
        && (!options.spreadInteractionTest || Boolean(spreadInteraction?.dragAdvanced))
        && (!options.focusInteractionTest || Boolean(focusInteraction?.ready && focusInteraction.dragAdvanced && focusInteraction.keyboardAdvanced && focusInteraction.preloadRequested && focusInteraction.toggleUsesLeftAnchor)),
      failures: [...stripFailures, ...visibleStripFailures, ...wheelFailures, ...stripHeightFailure,
        ...states.filter(state => state.focusPageAudit && !state.focusPageAudit.focusPageVisible)
          .map(state => `focus page ${state.visiblePages[0]} is not top-visible in the book viewport`),
        ...states.filter(state => state.focusPageAudit && !state.focusPageAudit.companionVisible)
          .map(state => `focus page ${state.visiblePages[0]} is missing same-spread companion ${state.focusPageAudit.expectedCompanionPage}`),
        ...(options.focusNavigationTest ? focusNavigation?.failures || ['focus navigation audit did not run'] : []),
        ...(options.spreadInteractionTest && !spreadInteraction?.dragAdvanced ? ['spread interaction: page drag did not advance exactly one spread with English open'] : []),
        ...(options.focusInteractionTest && !focusInteraction?.dragAdvanced ? ['focus interaction: drag did not advance exactly one printed page'] : []),
        ...(options.focusInteractionTest && !focusInteraction?.keyboardAdvanced ? ['focus interaction: keyboard did not advance exactly one printed page'] : []),
        ...(options.focusInteractionTest && !focusInteraction?.preloadRequested ? ['focus interaction: next printed page was not observed in incremental preload'] : []),
        ...(options.focusInteractionTest && !focusInteraction?.toggleUsesLeftAnchor ? ['focus interaction: mode toggle did not use the spread left-page anchor'] : [])],
      focusNavigation,
      spreadInteraction,
      stripHeightSamples,
      stripHeightRange,
      focusInteraction,
      assertions: {
        englishOpen: options.tenSpreadsTest,
        chineseDefaultClosedAndExplicitOpenVerified: options.tenSpreadsTest
          ? Boolean(states.find((state) => state.visiblePages[0] === options.fromPage)?.initialToggleEvidence?.closedDefaultVerified
            && states.find((state) => state.visiblePages[0] === options.fromPage)?.toggleEvidence?.openStateVerified)
          : null,
        legacyPanelHidden: options.tenSpreadsTest,
        legacyPanelImplementationPreserved: states.every(state => state.legacyPanelPresent),
        legacyPanelHiddenByDefault: states.every(state => !state.legacyView && !state.fallbackPanelOpen),
        legacyPanelVisibleWhenRequested: options.legacyPanel
          ? states.every(state => state.legacyView && state.fallbackPanelOpen && state.legacyPanelVisible
            && state.visibleLegacyPageBoxes === 0 && !state.stripContainerVisible && state.visibleStripCount === 0)
          : null,
        visibleStripPagesMatchPrintedPages: states.every(state => state.visibleStripPagesMatch),
        trackpadWheelScrollsLongStripWithoutPageTurn: states.filter(state => state.wheelScrollEvidence)
          .every(state => state.wheelScrollEvidence.scrolled && state.wheelScrollEvidence.pageStateUnchanged),
        legacyPanelHasNoBottomStripOverlap: options.legacyPanel
          ? states.every(state => state.legacyView && state.legacyPanelVisible && state.visibleStripCount === 0)
          : null,
        stripNullPagesSuppressed: options.tenSpreadsTest ? states.every(state => state.stripLayout?.strips.every(strip => Boolean(strip.text))) : null,
        p24Suppressed: options.tenSpreadsTest ? Boolean(states.find(state => state.visiblePages[0] === 24)?.stripLayout?.suppressedPages.includes(24)) : null,
        p25TextExact: options.tenSpreadsTest ? Boolean(states.find(state => state.visiblePages[0] === 24)?.stripLayout?.strips.find(strip => strip.page === 25)?.text === expectedStripTextsForAudit['25']) : null,
        printedEnglishPages40to42Suppressed: options.tenSpreadsTest ? Boolean([40, 41, 42].every(page => {
          const state = states.find(item => item.visiblePages.includes(page));
          return state?.stripLayout?.suppressedPages.includes(page);
        })) : null,
        p43ScrollEvidence: options.tenSpreadsTest ? states.find(state => state.visiblePages.includes(43))?.stripLayout?.p43ScrollEvidence || null : null,
        uiLanguage: options.tenSpreadsTest ? 'zh-TW' : options.lang,
        mobilePageToStripGapPx: options.tenSpreadsTest && options.viewport === 'mobile' ? [8, 24] : null,
        mobileControlsBottomSafeMarginMinPx: options.tenSpreadsTest && options.viewport === 'mobile' ? 16 : null,
        mobileCompositionSlackBalanceDeltaMaxPx: options.tenSpreadsTest && options.viewport === 'mobile' ? 24 : null,
        mobileBookAndStripBalancedBetweenHeaderAndNavigation: options.tenSpreadsTest && options.viewport === 'mobile',
        desktopBookAndStripBalancedBetweenHeaderAndNavigation: options.tenSpreadsTest && options.viewport === 'desktop',
      },
    };
    const manifest = {
      book: options.book, language: options.lang, translationPanel: options.translation,
      viewport: { width: options.width, height: options.height },
      requestedPageRange: { from: options.fromPage, to: toPage },
      previewPages: previews.map(({ page, wordCount, zoneId }) => ({ page, wordCount, zoneId })),
      screenshots: states,
      diagnostics,
      audit,
    };
    const manifestName = options.tenSpreadsTest ? `${options.viewport}-manifest.json` : 'manifest.json';
    await fs.writeFile(path.join(outDir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    if (options.tenSpreadsTest) {
      await fs.writeFile(path.join(outDir, `${options.viewport}-audit.json`), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
      if (!audit.passed) process.exitCode = 1;
    }
    if (visibleStripFailures.length) {
      console.error(`Visible-page strip assertion failed: ${visibleStripFailures.join('; ')}`);
      process.exitCode = 1;
    }
    if (wheelFailures.length) {
      console.error(`Wheel-scroll assertion failed: ${wheelFailures.join('; ')}`);
      process.exitCode = 1;
    }
    console.log(options.auditOnly
      ? `Audited ${states.length} reader state(s); ${devtools.diagnostics.length} browser error(s).`
      : `Finished ${states.length} screenshot(s); ${devtools.diagnostics.length} browser error(s).`);
    console.log(`Index: ${path.join(outDir, manifestName)}`);
    if (devtools.diagnostics.length || (options.mode === 'focus' && !audit.passed)
      || (options.spreadInteractionTest && !audit.passed) || stripHeightFailure.length) process.exitCode = 1;
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
