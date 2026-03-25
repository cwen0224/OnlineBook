const fileInput = document.getElementById("fileInput");
const resetButton = document.getElementById("resetButton");
const soundToggle = document.getElementById("soundToggle");
const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");
const pageCounter = document.getElementById("pageCounter");
const bookTitle = document.getElementById("bookTitle");
const bookMeta = document.getElementById("bookMeta");
const bookDesc = document.getElementById("bookDesc");
const leftPage = document.getElementById("leftPage");
const rightPage = document.getElementById("rightPage");
const leftArt = document.getElementById("leftArt");
const rightArt = document.getElementById("rightArt");
const leftTitle = document.getElementById("leftTitle");
const rightTitle = document.getElementById("rightTitle");
const leftBody = document.getElementById("leftBody");
const rightBody = document.getElementById("rightBody");
const underlayLeftPage = document.getElementById("underlayLeftPage");
const underlayRightPage = document.getElementById("underlayRightPage");
const underlayLeftArt = document.getElementById("underlayLeftArt");
const underlayRightArt = document.getElementById("underlayRightArt");
const underlayLeftTitle = document.getElementById("underlayLeftTitle");
const underlayRightTitle = document.getElementById("underlayRightTitle");
const underlayLeftBody = document.getElementById("underlayLeftBody");
const underlayRightBody = document.getElementById("underlayRightBody");
const book = document.getElementById("book");
const turnSheet = document.getElementById("turnSheet");

const pageTemplate = document.getElementById("pageTemplate");
const versionLabel = document.getElementById("versionLabel");
const versionInline = document.getElementById("versionInline");
const buildBadge = document.getElementById("buildBadge");

const VERSION = "V.202603251647";

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
  leftPage.addEventListener("pointerdown", (event) => beginPagePointerTurn("left", event));
  rightPage.addEventListener("pointerdown", (event) => beginPagePointerTurn("right", event));
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
  startTurnSession(direction, direction === "forward" ? rightPage : leftPage, targetIndex, {
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

function beginProgrammaticTurn(direction, sourcePage, targetIndex) {
  if (!state.book || state.isAnimating) return;
  startTurnSession(direction, sourcePage, targetIndex, { interactive: false });
  settleCurrentTurn(true);
}

function startTurnSession(direction, sourcePage, targetIndex, options = {}) {
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

  startSheetTurn(direction, sourcePage, targetIndex);
  playFlipSound(false);
  renderBook({ playAudio: false, previewIndex: targetIndex });
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
  renderBook();
  updateControls();
}

function renderBook(options = {}) {
  const { playAudio = true } = options;
  const book = state.book;
  const leftIndex = state.index;
  const rightIndex = state.index + 1;
  const currentLeft = book.pages[leftIndex] || null;
  const currentRight = book.pages[rightIndex] || null;
  const previewIndex =
    typeof options.previewIndex === "number"
      ? options.previewIndex
      : state.isAnimating
        ? state.turnTargetIndex
        : leftIndex + 2;
  const nextLeft = book.pages[previewIndex] || null;
  const nextRight = book.pages[previewIndex + 1] || null;

  bookTitle.textContent = book.title;
  bookMeta.textContent = [book.author, `${book.pages.length} 頁`].filter(Boolean).join(" · ");
  bookDesc.textContent = book.description || "從 JSON 或 ZIP 匯入不同故事版本。";
  pageCounter.textContent = `${leftIndex + 1}-${Math.min(rightIndex + 1, book.pages.length)} / ${book.pages.length}`;

  fillPage(underlayLeftPage, underlayLeftArt, underlayLeftTitle, underlayLeftBody, nextLeft || null, "left");
  fillPage(underlayRightPage, underlayRightArt, underlayRightTitle, underlayRightBody, nextRight || null, "right");

  fillPage(leftPage, leftArt, leftTitle, leftBody, currentLeft || null, "left");
  fillPage(rightPage, rightArt, rightTitle, rightBody, currentRight || null, "right");

  leftPage.classList.toggle("empty", !currentLeft);
  rightPage.classList.toggle("empty", !currentRight);

  if (currentRight?.background) {
    rightPage.style.background = `linear-gradient(180deg, rgba(255,255,255,0.92), rgba(247,237,220,0.96)), url("${currentRight.background}") center/cover`;
  } else {
    rightPage.style.background = "";
  }

  if (currentLeft?.background) {
    leftPage.style.background = `linear-gradient(180deg, rgba(255,255,255,0.92), rgba(247,237,220,0.96)), url("${currentLeft.background}") center/cover`;
  } else {
    leftPage.style.background = "";
  }

  if (nextLeft?.background) {
    underlayLeftPage.style.background = `linear-gradient(180deg, rgba(255,255,255,0.92), rgba(247,237,220,0.96)), url("${nextLeft.background}") center/cover`;
  } else {
    underlayLeftPage.style.background = "";
  }

  if (nextRight?.background) {
    underlayRightPage.style.background = `linear-gradient(180deg, rgba(255,255,255,0.92), rgba(247,237,220,0.96)), url("${nextRight.background}") center/cover`;
  } else {
    underlayRightPage.style.background = "";
  }

  preloadAround(state.index, 6);
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

function nextPage() {
  if (state.isAnimating || !state.book) return;
  if (state.index >= state.book.pages.length - 2) {
    playFlipSound(true);
    return;
  }

  const targetIndex = state.index + 2;
  beginProgrammaticTurn("forward", rightPage, targetIndex);
}

function previousPage() {
  if (state.isAnimating || !state.book) return;
  if (state.index <= 0) {
    playFlipSound(true);
    return;
  }

  const targetIndex = state.index - 2;
  beginProgrammaticTurn("backward", leftPage, targetIndex);
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
      renderBook();
    } else {
      renderBook({ playAudio: false });
    }

    clearTurnSheet();
    updateControls();
  });
}

function updateControls() {
  if (!prevButton || !nextButton) return;
  const hasPrev = state.index > 0;
  const hasNext = !!state.book && state.index < state.book.pages.length - 1;
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

function startSheetTurn(direction, sourcePage, targetIndex) {
  const content = sourcePage.querySelector(".page-content");
  const front = content ? content.cloneNode(true) : document.createElement("div");
  stripIds(front);

  turnSheet.innerHTML = "";
  turnSheet.className = `turn-sheet is-visible ${direction} dragging`;
  setTurnSheetRotation(0, false);

  const frontFace = document.createElement("div");
  frontFace.className = "turn-face turn-front";
  frontFace.appendChild(front);

  const backFace = document.createElement("div");
  backFace.className = "turn-face turn-back";

  const targetContent = buildTargetPageContent(direction, targetIndex);
  if (targetContent) {
    backFace.appendChild(targetContent);
  }

  turnSheet.append(frontFace, backFace);
}

function buildTargetPageContent(direction, targetIndex) {
  if (!state.book) return null;

  const page =
    direction === "forward"
      ? state.book.pages[targetIndex] || null
      : state.book.pages[targetIndex + 1] || null;
  if (!page) return null;

  const wrapper = document.createElement("div");
  wrapper.className = "page-content";

  const art = document.createElement("div");
  art.className = "page-art";
  if (page.image) {
    const img = document.createElement("img");
    img.alt = page.title;
    img.src = page.image;
    art.appendChild(img);
  } else {
    const svg = document.createElement("div");
    svg.innerHTML = createFallbackIllustration(page.title, direction === "forward" ? "right" : "left");
    art.appendChild(svg.firstElementChild);
  }

  const text = document.createElement("div");
  text.className = "page-text";
  const title = document.createElement("h3");
  title.textContent = page.title;
  const body = document.createElement("p");
  body.textContent = page.text;
  text.append(title, body);

  wrapper.append(art, text);
  return wrapper;
}

function clearTurnSheet() {
  turnSheet.className = "turn-sheet";
  turnSheet.style.removeProperty("--turn-rotation");
  turnSheet.innerHTML = "";
}

function setTurnSheetRotation(degrees, animate) {
  if (animate) {
    turnSheet.classList.remove("dragging");
  } else {
    turnSheet.classList.add("dragging");
  }
  turnSheet.style.setProperty("--turn-rotation", `${degrees}deg`);
}

function stripIds(root) {
  if (!root || !root.querySelectorAll) return;
  if (root.id) root.removeAttribute("id");
  root.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
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
