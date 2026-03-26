const fileInput = document.getElementById("fileInput");
const resetButton = document.getElementById("resetButton");
const soundToggle = document.getElementById("soundToggle");
const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");
const pageCounter = document.getElementById("pageCounter");
const bookTitle = document.getElementById("bookTitle");
const bookMeta = document.getElementById("bookMeta");
const bookDesc = document.getElementById("bookDesc");
const sheetDeck = document.getElementById("sheetDeck");
const turnSheet = document.getElementById("turnSheet");
const book = document.getElementById("book");

const pageTemplate = document.getElementById("pageTemplate");
const versionLabel = document.getElementById("versionLabel");
const versionInline = document.getElementById("versionInline");
const buildBadge = document.getElementById("buildBadge");

const VERSION = "V.202603261022";

const state = {
  book: null,
  index: 0,
  soundEnabled: true,
  isAnimating: false,
  isDragging: false,
  activeTurnId: 0,
  turnOriginIndex: 0,
  turnTargetIndex: 0,
  turnDirection: null,
  dragPointerId: null,
  dragStartX: 0,
  dragLastX: 0,
  dragProgress: 0,
  dragMoved: false,
  audioContext: null,
  pageAudio: null,
  loadedAssets: new Map(),
  preloadedImages: new Map(),
  preloadedAudio: new Map(),
  currentZip: null,
};

const defaultBook = createDefaultBook();

init();

function init() {
  document.title = `動態翻頁繪本 ${VERSION}`;
  versionLabel.textContent = VERSION;
  versionInline.textContent = `版本 ${VERSION}`;
  buildBadge.textContent = VERSION;
  bindEvents();
  loadBook(defaultBook);
}

function bindEvents() {
  fileInput.addEventListener("change", onFileSelected);
  resetButton.addEventListener("click", () => {
    cleanupZipAssets();
    loadBook(defaultBook);
  });
  soundToggle.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    soundToggle.textContent = `音效：${state.soundEnabled ? "開" : "關"}`;
    soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
    if (!state.soundEnabled && state.pageAudio) {
      state.pageAudio.pause();
      state.pageAudio = null;
    }
  });
  if (prevButton) prevButton.addEventListener("click", previousPage);
  if (nextButton) nextButton.addEventListener("click", nextPage);
  sheetDeck.addEventListener("pointerdown", onDeckPointerDown);
  window.addEventListener("pointermove", onPagePointerMove);
  window.addEventListener("pointerup", onPagePointerEnd);
  window.addEventListener("pointercancel", onPagePointerEnd);

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      handleKeyboardPage("right");
    }
    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      handleKeyboardPage("left");
    }
  });

  document.addEventListener("selectstart", (event) => {
    if (event.target instanceof Element && event.target.closest(".book")) {
      event.preventDefault();
    }
  });
}

function handleKeyboardPage(side) {
  if (state.isAnimating) {
    if (
      (state.turnDirection === "forward" && side === "left") ||
      (state.turnDirection === "backward" && side === "right")
    ) {
      cancelCurrentTurn();
    }
    return;
  }

  if (side === "left") {
    previousPage();
  } else {
    nextPage();
  }
}

function onDeckPointerDown(event) {
  const half = event.target instanceof Element ? event.target.closest(".page-left, .page-right") : null;
  const activeSheet = getActiveSheet();
  if (!half || !activeSheet || !activeSheet.contains(half)) return;

  const side = half.classList.contains("page-right") ? "right" : "left";
  beginPagePointerTurn(side, event);
}

function beginPagePointerTurn(side, event) {
  if (event.button !== 0 || state.isDragging) return;
  if (!state.book) return;

  if (state.isAnimating) {
    if (
      (state.turnDirection === "forward" && side === "left") ||
      (state.turnDirection === "backward" && side === "right")
    ) {
      cancelCurrentTurn();
    }
    return;
  }

  const direction = side === "right" ? "forward" : "backward";
  const targetIndex = direction === "forward" ? state.index + 2 : state.index - 2;
  if (direction === "forward" && state.index >= state.book.pages.length - 2) {
    playFlipSound(true);
    return;
  }
  if (direction === "backward" && state.index <= 0) {
    playFlipSound(true);
    return;
  }

  event.preventDefault();
  if (event.currentTarget?.setPointerCapture) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  startTurnSession(direction, targetIndex, {
    interactive: true,
    pointerId: event.pointerId,
    startX: event.clientX,
  });
}

function onPagePointerMove(event) {
  if (!state.isDragging || event.pointerId !== state.dragPointerId) return;
  event.preventDefault();
  updateTurnSheetProgress(event.clientX);
}

function onPagePointerEnd(event) {
  if (!state.isDragging || event.pointerId !== state.dragPointerId) return;
  event.preventDefault();

  const commit = !state.dragMoved || state.dragProgress >= 0.5;
  settleCurrentTurn(commit);
}

function beginProgrammaticTurn(direction, targetIndex) {
  if (!state.book || state.isAnimating) return;
  startTurnSession(direction, targetIndex, { interactive: false });
  settleCurrentTurn(true);
}

function startTurnSession(direction, targetIndex, options = {}) {
  if (!state.book || state.isAnimating) return false;

  const { interactive = false, pointerId = null, startX = 0 } = options;
  state.activeTurnId += 1;
  state.isAnimating = true;
  state.isDragging = interactive;
  state.turnDirection = direction;
  state.turnOriginIndex = state.index;
  state.turnTargetIndex = targetIndex;
  state.dragPointerId = pointerId;
  state.dragStartX = startX;
  state.dragLastX = startX;
  state.dragProgress = 0;
  state.dragMoved = false;

  playFlipSound(false);
  renderBook({ playAudio: false });
  updateControls();
  setTurnSheetRotation(0, false);
  return true;
}

async function onFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const isZip = file.name.toLowerCase().endsWith(".zip") || file.type.includes("zip");
    if (isZip) {
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      const manifestPath = findManifestPath(zip);
      if (!manifestPath) {
        throw new Error("ZIP 裡找不到 book.json 或 manifest.json");
      }
      cleanupZipAssets();
      const manifestText = await zip.file(manifestPath).async("text");
      const manifest = JSON.parse(manifestText);
      const resolved = await resolveZipManifest(manifest, zip, manifestPath);
      state.currentZip = zip;
      loadBook(resolved);
      return;
    }

    const text = await file.text();
    const parsed = JSON.parse(text);
    cleanupZipAssets();
    loadBook(normalizeBook(parsed));
  } catch (error) {
    console.error(error);
    alert(`無法讀取繪本：${error.message}`);
  } finally {
    fileInput.value = "";
  }
}

function findManifestPath(zip) {
  const candidates = ["book.json", "manifest.json", "story.json"];
  for (const name of candidates) {
    if (zip.file(name)) return name;
  }
  return null;
}

async function resolveZipManifest(manifest, zip, manifestPath) {
  const normalized = normalizeBook(manifest);
  const baseDir = manifestPath.includes("/") ? manifestPath.slice(0, manifestPath.lastIndexOf("/")) : "";
  const refs = collectAssetRefs(normalized);

  for (const ref of refs) {
    const resolvedPath = resolveZipPath(baseDir, ref.path);
    const file = zip.file(resolvedPath);
    if (!file) {
      throw new Error(`ZIP 缺少檔案：${resolvedPath}`);
    }
    const blob = await file.async("blob");
    const url = URL.createObjectURL(blob);
    state.loadedAssets.set(url, true);
    ref.assign(url);
  }

  return normalized;
}

function resolveZipPath(baseDir, relativePath) {
  const safeBase = baseDir ? `${baseDir.replace(/\\/g, "/").replace(/\/+$/, "")}/` : "";
  const rawParts = `${safeBase}${relativePath}`.split("/");
  const stack = [];

  for (const part of rawParts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (stack.length) stack.pop();
      continue;
    }
    stack.push(part);
  }

  return stack.join("/");
}

function collectAssetRefs(book) {
  const refs = [];

  const pushRef = (path, assign) => {
    if (typeof path === "string" && path && !isDataUrl(path) && !isAbsoluteUrl(path)) {
      refs.push({ path, assign });
    }
  };

  pushRef(book.coverImage, (url) => {
    book.coverImage = url;
  });

  for (const page of book.pages) {
    pushRef(page.image, (url) => {
      page.image = url;
    });
    pushRef(page.audio, (url) => {
      page.audio = url;
    });
    pushRef(page.background, (url) => {
      page.background = url;
    });
  }

  if (book.music?.src) {
    pushRef(book.music.src, (url) => {
      book.music.src = url;
    });
  }

  return refs;
}

function normalizeBook(input) {
  if (!input || typeof input !== "object") {
    throw new Error("JSON 格式不正確");
  }

  const pages = Array.isArray(input.pages) ? input.pages : [];
  if (pages.length === 0) {
    throw new Error("繪本至少需要 1 頁");
  }

  return {
    title: input.title || "未命名繪本",
    author: input.author || "",
    description: input.description || "",
    coverImage: input.coverImage || "",
    theme: input.theme || {},
    music: input.music || null,
    pages: pages.map((page, index) => ({
      id: page.id || `page-${index + 1}`,
      title: page.title || `第 ${index + 1} 頁`,
      text: page.text || page.body || "",
      image: page.image || page.illustration || "",
      audio: page.audio || "",
      background: page.background || "",
      note: page.note || "",
    })),
  };
}

function loadBook(book) {
  state.book = normalizeBook(book);
  state.index = 0;
  state.activeTurnId += 1;
  state.isAnimating = false;
  state.isDragging = false;
  state.turnDirection = null;
  state.dragPointerId = null;
  state.dragProgress = 0;
  state.dragMoved = false;
  clearTurnSheet();
  resetPreloadCache();
  preloadAllPages();
  renderBook();
  updateControls();
}

function renderBook(options = {}) {
  const { playAudio = true } = options;
  const currentBook = state.book;
  const leftIndex = state.index;
  const rightIndex = state.index + 1;
  const currentRight = currentBook.pages[rightIndex] || null;
  const totalSpreads = Math.max(1, Math.ceil(currentBook.pages.length / 2));
  const activeSpreadIndex = Math.max(0, Math.floor(leftIndex / 2));

  bookTitle.textContent = currentBook.title;
  bookMeta.textContent = [currentBook.author, `${currentBook.pages.length} 頁`].filter(Boolean).join(" · ");
  bookDesc.textContent = currentBook.description || "從 JSON 或 ZIP 匯入不同故事版本。";
  pageCounter.textContent = `${leftIndex + 1}-${Math.min(rightIndex + 1, currentBook.pages.length)} / ${currentBook.pages.length}`;

  book.classList.toggle("is-turning", state.isAnimating);

  renderSheetDeck(currentBook, activeSpreadIndex, totalSpreads);
  if (state.isAnimating) {
    renderTurnSheet(currentBook);
  } else {
    clearTurnSheet();
  }
  preloadAround(state.index, 8);
  if (playAudio) {
    playPageAudio(currentRight?.audio);
  }
}

function fillPage(pageEl, artEl, titleEl, bodyEl, pageData, side) {
  artEl.innerHTML = "";
  titleEl.textContent = "";
  bodyEl.textContent = "";

  if (!pageData) {
    pageEl.classList.add("blank");
    const blank = document.createElement("div");
    blank.className = "blank-state";
    blank.textContent = side === "left" ? "封面前頁" : "點擊右頁開始閱讀";
    blank.style.color = "#61708c";
    blank.style.fontStyle = "italic";
    blank.style.display = "grid";
    blank.style.placeItems = "center";
    blank.style.height = "100%";
    artEl.appendChild(blank);
    return;
  }

  pageEl.classList.remove("blank");
  titleEl.textContent = pageData.title;
  bodyEl.textContent = pageData.text;

  if (pageData.image) {
    const img = document.createElement("img");
    img.alt = pageData.title;
    img.src = pageData.image;
    artEl.appendChild(img);
  } else {
    const svg = document.createElement("div");
    svg.innerHTML = createFallbackIllustration(pageData.title, side);
    artEl.appendChild(svg.firstElementChild);
  }
}

function applyPageSurface(pageEl, pageData) {
  if (pageData?.background) {
    pageEl.style.background = `linear-gradient(180deg, rgba(255,255,255,0.92), rgba(247,237,220,0.96)), url("${pageData.background}") center/cover`;
  } else {
    pageEl.style.background = "";
  }
}

function nextPage() {
  if (state.isAnimating || !state.book) return;
  if (state.index >= state.book.pages.length - 2) {
    playFlipSound(true);
    return;
  }

  const targetIndex = state.index + 2;
  beginProgrammaticTurn("forward", targetIndex);
}

function previousPage() {
  if (state.isAnimating || !state.book) return;
  if (state.index <= 0) {
    playFlipSound(true);
    return;
  }

  const targetIndex = state.index - 2;
  beginProgrammaticTurn("backward", targetIndex);
}

function cancelCurrentTurn() {
  if (!state.isAnimating || !state.book) return;
  settleCurrentTurn(false);
}

function updateTurnSheetProgress(currentX) {
  if (!state.isDragging || !state.isAnimating) return;

  const rect = book.getBoundingClientRect();
  const halfWidth = Math.max(rect.width / 2, 1);
  const delta = state.turnDirection === "forward" ? state.dragStartX - currentX : currentX - state.dragStartX;
  const progress = clamp(delta / halfWidth, 0, 1);

  state.dragLastX = currentX;
  state.dragProgress = progress;
  state.dragMoved = state.dragMoved || Math.abs(currentX - state.dragStartX) > 4;

  const rotation = state.turnDirection === "forward" ? -180 * progress : 180 * progress;
  setTurnSheetRotation(rotation, false);
}

function settleCurrentTurn(commit) {
  if (!state.isAnimating || !state.book) return;

  const turnId = state.activeTurnId;
  const direction = state.turnDirection;
  const finalRotation = commit ? (direction === "forward" ? -180 : 180) : 0;
  state.isDragging = false;
  state.dragPointerId = null;
  state.dragLastX = 0;
  state.turnDirection = direction;
  turnSheet.classList.remove("dragging");
  setTurnSheetRotation(finalRotation, true);

  waitForTurnTransition(turnSheet, () => {
    if (turnId !== state.activeTurnId) return;

    state.isAnimating = false;
    state.turnDirection = null;

    if (commit) {
      state.index = state.turnTargetIndex;
    }

    clearTurnSheet();
    renderBook({ playAudio: commit });
    updateControls();
  });
}

function updateControls() {
  if (!prevButton || !nextButton) return;
  const hasPrev = state.index > 0;
  const hasNext = !!state.book && state.index < state.book.pages.length - 2;
  prevButton.disabled = !hasPrev || state.isAnimating;
  nextButton.disabled = !hasNext || state.isAnimating;
}

function playFlipSound(softOnly) {
  if (!state.soundEnabled) return;

  ensureAudioContext();
  const ctx = state.audioContext;
  if (!ctx) return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(softOnly ? 0.025 : 0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.28, ctx.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) {
    channel[i] = (Math.random() * 2 - 1) * (1 - i / channel.length);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = softOnly ? 450 : 820;
  filter.Q.value = 0.9;

  const tone = ctx.createOscillator();
  tone.type = "triangle";
  tone.frequency.setValueAtTime(softOnly ? 110 : 160, now);
  tone.frequency.exponentialRampToValueAtTime(60, now + 0.3);

  noise.connect(filter);
  filter.connect(gain);
  tone.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + 0.25);
  tone.start(now);
  tone.stop(now + 0.35);
}

function playPageAudio(src) {
  if (!state.soundEnabled || !src) return;

  if (state.pageAudio) {
    state.pageAudio.pause();
    state.pageAudio = null;
  }

  const audio = state.preloadedAudio.get(src) || new Audio(src);
  audio.preload = "auto";
  audio.volume = 0.8;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Some browsers block remote playback or delayed autoplay.
  });
  if (!state.preloadedAudio.has(src)) {
    state.preloadedAudio.set(src, audio);
  }
  state.pageAudio = audio;
}

function preloadAround(centerIndex, radius) {
  if (!state.book) return;

  const start = Math.max(0, centerIndex - radius);
  const end = Math.min(state.book.pages.length - 1, centerIndex + radius);

  for (let index = start; index <= end; index += 1) {
    const page = state.book.pages[index];
    preloadImage(page.image);
    preloadAudio(page.audio);
  }
}

function preloadAllPages() {
  if (!state.book) return;

  preloadImage(state.book.coverImage);
  preloadAudio(state.book.music?.src);

  for (const page of state.book.pages) {
    preloadImage(page.image);
    preloadAudio(page.audio);
    preloadImage(page.background);
  }
}

function preloadImage(src) {
  if (!src || state.preloadedImages.has(src)) return;
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  state.preloadedImages.set(src, image);
}

function preloadAudio(src) {
  if (!src || state.preloadedAudio.has(src)) return;
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = src;
  state.preloadedAudio.set(src, audio);
}

function resetPreloadCache() {
  state.preloadedImages.clear();
  state.preloadedAudio.clear();
  if (state.pageAudio) {
    state.pageAudio.pause();
    state.pageAudio = null;
  }
}

function ensureAudioContext() {
  if (state.audioContext) {
    if (state.audioContext.state === "suspended") {
      state.audioContext.resume();
    }
    return;
  }
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;
  state.audioContext = new AudioContextCtor();
}

function cleanupZipAssets() {
  for (const url of state.loadedAssets.keys()) {
    URL.revokeObjectURL(url);
  }
  state.loadedAssets.clear();
  state.currentZip = null;
  resetPreloadCache();
}

function createBookPage(pageData, side, className) {
  const pageEl = document.createElement("div");
  pageEl.className = `page ${className}`;

  const content = pageTemplate.content.firstElementChild.cloneNode(true);
  const artEl = content.querySelector(".page-art");
  const titleEl = content.querySelector("h3");
  const bodyEl = content.querySelector("p");

  fillPage(pageEl, artEl, titleEl, bodyEl, pageData, side);
  applyPageSurface(pageEl, pageData);
  pageEl.appendChild(content);
  pageEl.classList.toggle("blank", !pageData);
  return pageEl;
}

function createSpreadPage(pageData, side) {
  return createBookPage(pageData, side, side === "left" ? "page-left" : "page-right");
}

function createTurnFace(pageData, side, faceClass) {
  const sideClass = side === "left" ? "turn-left" : "turn-right";
  return createBookPage(pageData, side, `turn-page ${sideClass} ${faceClass}`);
}

function buildLayerOffsets(direction) {
  const offsets = [0];
  for (let step = 1; offsets.length < 8; step += 1) {
    const primary = direction === "backward" ? -step : step;
    const secondary = -primary;
    offsets.push(primary);
    if (offsets.length < 8) {
      offsets.push(secondary);
    }
  }
  return offsets.slice(0, 8);
}

function renderSheetDeck(book, activeSpreadIndex, totalSpreads) {
  if (!sheetDeck) return;

  const offsets = buildLayerOffsets(state.turnDirection);
  sheetDeck.innerHTML = "";

  offsets.forEach((offset, layerIndex) => {
    const spreadIndex = activeSpreadIndex + offset;
    const layer = createSheetLayer(book, spreadIndex, offset, layerIndex);
    layer.style.setProperty("--sheet-depth", String(layerIndex));
    layer.style.zIndex = String(100 - layerIndex);

    if (offset === 0) {
      layer.classList.add("is-active");
    }

    sheetDeck.appendChild(layer);
  });
}

function renderTurnSheet(book) {
  if (!turnSheet || !state.isAnimating || !state.turnDirection) return;

  const frontSide = state.turnDirection === "forward" ? "right" : "left";
  const backSide = state.turnDirection === "forward" ? "left" : "right";
  const frontPageData =
    state.turnDirection === "forward"
      ? book.pages[state.turnOriginIndex + 1] || null
      : book.pages[state.turnOriginIndex] || null;
  const backPageData =
    state.turnDirection === "forward"
      ? book.pages[state.turnTargetIndex] || null
      : book.pages[state.turnTargetIndex + 1] || null;

  turnSheet.replaceChildren(
    createTurnFace(frontPageData, frontSide, "turn-front"),
    createTurnFace(backPageData, backSide, "turn-back"),
  );

  turnSheet.classList.add("is-active");
  turnSheet.classList.toggle("turn-forward", state.turnDirection === "forward");
  turnSheet.classList.toggle("turn-backward", state.turnDirection === "backward");
  turnSheet.classList.remove("dragging");
  turnSheet.style.setProperty("--sheet-rotation", "0deg");
}

function createSheetLayer(book, spreadIndex, offset, layerIndex) {
  const layer = document.createElement("div");
  layer.className = "sheet-layer";
  layer.dataset.offset = String(offset);
  layer.dataset.layer = String(layerIndex);
  layer.classList.toggle("blank", spreadIndex < 0 || spreadIndex * 2 >= book.pages.length);

  const surface = document.createElement("div");
  surface.className = "sheet-surface";

  const frontFace = document.createElement("div");
  frontFace.className = "sheet-face sheet-front";

  const backFace = document.createElement("div");
  backFace.className = "sheet-face sheet-back";

  const leftPageData = book.pages[spreadIndex * 2] || null;
  const rightPageData = book.pages[spreadIndex * 2 + 1] || null;
  frontFace.append(
    createSpreadPage(leftPageData, "left"),
    createSpreadPage(rightPageData, "right"),
  );

  surface.append(frontFace, backFace);
  layer.append(surface);
  return layer;
}

function getActiveSheet() {
  return sheetDeck?.querySelector(".sheet-layer.is-active") || null;
}

function clearTurnSheet() {
  if (!turnSheet) return;
  turnSheet.replaceChildren();
  turnSheet.classList.remove("is-active", "turn-forward", "turn-backward", "dragging");
  turnSheet.style.removeProperty("--sheet-rotation");
  book.classList.remove("is-turning");
}

function setTurnSheetRotation(degrees, animate) {
  if (!turnSheet) return;
  turnSheet.classList.toggle("dragging", !animate);
  turnSheet.style.setProperty("--sheet-rotation", `${degrees}deg`);
}

function waitForTurnTransition(element, callback) {
  const done = () => {
    element.removeEventListener("transitionend", onEnd);
    clearTimeout(timeoutId);
    callback();
  };

  const onEnd = (event) => {
    if (event.target !== element || event.propertyName !== "transform") return;
    done();
  };

  const timeoutId = window.setTimeout(done, 320);
  element.addEventListener("transitionend", onEnd);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isDataUrl(value) {
  return /^data:/i.test(value);
}

function isAbsoluteUrl(value) {
  return /^(https?:)?\/\//i.test(value) || value.startsWith("blob:");
}

function createFallbackIllustration(title, side) {
  const accent = side === "left" ? "#7dd3fc" : "#fdba74";
  return `
    <svg viewBox="0 0 420 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(title)}">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.12"/>
        </linearGradient>
      </defs>
      <rect x="20" y="18" width="380" height="264" rx="28" fill="url(#g)" opacity="0.36"/>
      <circle cx="286" cy="86" r="52" fill="rgba(255,255,255,0.38)"/>
      <path d="M84 220c32-58 68-87 112-88s78 26 118 78" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>
      <path d="M114 176l34-50 30 26 36-46 58 70" fill="none" stroke="#10203a" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="38" y="264" fill="#10203a" font-size="24" font-family="Georgia, serif">${escapeXml(title)}</text>
    </svg>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function createDefaultBook() {
  const specialFilePath = (fileName) =>
    `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;

  return {
    title: "月光列車",
    author: "示範繪本",
    description: `這本示範書使用公開素材，打開就能直接驗證圖片、翻頁動畫與音效。${VERSION}`,
    pages: [
      {
        title: "封面",
        text: "夜裡出發的列車，會把每個願望送到月亮旁邊。",
        image: specialFilePath("Night sky ft Moon.jpg"),
        audio: specialFilePath("Nl-pageturner.ogg"),
      },
      {
        title: "第一站",
        text: "狐狸在路口探頭，像是在邀請你走進下一個故事。",
        image: specialFilePath("Red fox (8385104980).jpg"),
        audio: specialFilePath("Nl-pageturner.ogg"),
      },
      {
        title: "第二站",
        text: "海浪像一頁會呼吸的紙，慢慢把白天翻成夜晚。",
        image: specialFilePath("Ocean_waves_water.jpg"),
        audio: specialFilePath("Nl-pageturner.ogg"),
      },
      {
        title: "第三站",
        text: "樹影慢慢把月光切成碎片，像有人在紙上灑了灰藍色的墨。",
        image: specialFilePath("Night_sky_ft_Moon.jpg"),
        audio: specialFilePath("Nl-pageturner.ogg"),
      },
      {
        title: "第四站",
        text: "狐狸又出現一次，這回牠站得更近，像是知道你正在翻頁。",
        image: specialFilePath("Red fox (8385104980).jpg"),
        audio: specialFilePath("Nl-pageturner.ogg"),
      },
      {
        title: "第五站",
        text: "海面捲起白色浪尖，下一頁像是剛從水裡浮上來。",
        image: specialFilePath("Ocean_waves_water.jpg"),
        audio: specialFilePath("Nl-pageturner.ogg"),
      },
      {
        title: "第六站",
        text: "這一頁故意留白，看看翻頁後的底層預載能不能先露出來。",
        audio: specialFilePath("Nl-pageturner.ogg"),
      },
      {
        title: "第七站",
        text: "月亮再次回到頁面中央，像是在提醒故事還沒結束。",
        image: specialFilePath("Night sky ft Moon.jpg"),
        audio: specialFilePath("Nl-pageturner.ogg"),
      },
      {
        title: "第八站",
        text: "狐狸在這裡停了一下，牠的眼睛像兩枚會發光的書籤。",
        image: specialFilePath("Red fox (8385104980).jpg"),
        audio: specialFilePath("Nl-pageturner.ogg"),
      },
      {
        title: "終點",
        text: "當第一道晨光出現，故事也輕輕停在頁尾。",
        image: specialFilePath("Night sky ft Moon.jpg"),
        audio: specialFilePath("Nl-pageturner.ogg"),
      },
    ],
  };
}
