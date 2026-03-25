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

const pageTemplate = document.getElementById("pageTemplate");
const versionLabel = document.getElementById("versionLabel");
const versionInline = document.getElementById("versionInline");
const buildBadge = document.getElementById("buildBadge");

const VERSION = "V.202603251557";

const state = {
  book: null,
  index: 0,
  soundEnabled: true,
  isAnimating: false,
  audioContext: null,
  loadedAssets: new Map(),
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
  prevButton.addEventListener("click", previousPage);
  nextButton.addEventListener("click", nextPage);
  leftPage.addEventListener("click", previousPage);
  rightPage.addEventListener("click", nextPage);

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      nextPage();
    }
    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      previousPage();
    }
  });
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
  renderBook();
  updateControls();
}

function renderBook() {
  const book = state.book;
  const current = book.pages[state.index];
  const next = book.pages[state.index + 1] || null;
  const previous = book.pages[state.index - 1] || null;

  bookTitle.textContent = book.title;
  bookMeta.textContent = [book.author, `${book.pages.length} 頁`].filter(Boolean).join(" · ");
  bookDesc.textContent = book.description || "從 JSON 或 ZIP 匯入不同故事版本。";
  pageCounter.textContent = `${state.index + 1} / ${book.pages.length}`;

  fillPage(leftPage, leftArt, leftTitle, leftBody, previous || null, "left");
  fillPage(rightPage, rightArt, rightTitle, rightBody, current || null, "right");

  if (state.index === 0) {
    leftPage.classList.add("empty");
  } else {
    leftPage.classList.remove("empty");
  }

  if (current?.background) {
    rightPage.style.background = `linear-gradient(180deg, rgba(255,255,255,0.92), rgba(247,237,220,0.96)), url("${current.background}") center/cover`;
  } else {
    rightPage.style.background = "";
  }

  if (previous?.background) {
    leftPage.style.background = `linear-gradient(180deg, rgba(255,255,255,0.92), rgba(247,237,220,0.96)), url("${previous.background}") center/cover`;
  } else {
    leftPage.style.background = "";
  }

  playPageAudio(current?.audio);
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
  if (state.index >= state.book.pages.length - 1) {
    playFlipSound(true);
    return;
  }

  state.isAnimating = true;
  rightPage.classList.remove("turning-back");
  rightPage.classList.add("turning");
  playFlipSound(false);
  runAfterAnimation(rightPage, "turning", () => {
    state.index += 1;
    renderBook();
    updateControls();
    state.isAnimating = false;
  });
}

function previousPage() {
  if (state.isAnimating || !state.book) return;
  if (state.index <= 0) {
    playFlipSound(true);
    return;
  }

  state.isAnimating = true;
  rightPage.classList.remove("turning");
  rightPage.classList.add("turning-back");
  playFlipSound(false);
  runAfterAnimation(rightPage, "turning-back", () => {
    state.index -= 1;
    renderBook();
    updateControls();
    state.isAnimating = false;
  });
}

function updateControls() {
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

  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = 0.8;
  audio.play().catch(() => {
    // Some browsers block remote playback or delayed autoplay.
  });
  state.pageAudio = audio;
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

  if (state.pageAudio) {
    state.pageAudio.pause();
    state.pageAudio = null;
  }
}

function runAfterAnimation(element, className, callback) {
  const onEnd = (event) => {
    if (event.target !== element) return;
    element.removeEventListener("animationend", onEnd);
    element.classList.remove(className);
    callback();
  };

  element.addEventListener("animationend", onEnd);
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
        title: "終點",
        text: "當第一道晨光出現，故事也輕輕停在頁尾。",
        image: specialFilePath("Night_sky_ft_Moon.jpg"),
        audio: specialFilePath("Nl-pageturner.ogg"),
      },
    ],
  };
}
