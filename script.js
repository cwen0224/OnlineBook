document.addEventListener("DOMContentLoaded", () => {
  const VERSION = "V.202603261513";
  const PAGE_COUNT = 8;
  const SPREAD_COUNT = PAGE_COUNT / 2;
  const FLIP_MS = 620;

  const buildBadge = document.getElementById("buildBadge");
  const soundToggle = document.getElementById("soundToggle");
  const book = document.getElementById("book");

  const pageData = createPageData();
  const state = {
    currentSpread: 0,
    turn: null,
    soundEnabled: true,
    audioContext: null,
    layers: [],
    turnSheet: null,
    turnFront: null,
    turnBack: null,
  };

  init();

  function init() {
    document.title = `動態翻頁繪本 ${VERSION}`;
    if (buildBadge) {
      buildBadge.textContent = VERSION;
    }
    if (soundToggle) {
      soundToggle.textContent = "音效：開";
      soundToggle.setAttribute("aria-pressed", "true");
    }

    buildStructure();
    bindEvents();
    renderBook();
  }

  function createPageData() {
    const specs = [
      {
        title: "封面",
        kicker: "01 / 08",
        text: "夜裡出發的列車，會把每個願望送到月亮旁邊。",
        image: "https://picsum.photos/seed/story-01/1600/2200",
      },
      {
        title: "第一站",
        kicker: "02 / 08",
        text: "海浪像一頁會呼吸的紙，慢慢把白天翻成夜晚。",
        image: "https://picsum.photos/seed/story-02/1600/2200",
      },
      {
        title: "第二站",
        kicker: "03 / 08",
        text: "狐狸在路口探頭，像是在邀請你走進下一個故事。",
        image: "https://picsum.photos/seed/story-03/1600/2200",
      },
      {
        title: "第三站",
        kicker: "04 / 08",
        text: "屋頂的燈火慢慢亮起，城市開始把心事收進窗裡。",
        image: "https://picsum.photos/seed/story-04/1600/2200",
      },
      {
        title: "第四站",
        kicker: "05 / 08",
        text: "樹影沿著風走，枝葉之間有一種安靜的節奏。",
        image: "https://picsum.photos/seed/story-05/1600/2200",
      },
      {
        title: "第五站",
        kicker: "06 / 08",
        text: "山路彎進霧裡，像一本正在等待你翻開的紙書。",
        image: "https://picsum.photos/seed/story-06/1600/2200",
      },
      {
        title: "第六站",
        kicker: "07 / 08",
        text: "湖面把天空完整收進來，連時間也變得很輕。",
        image: "https://picsum.photos/seed/story-07/1600/2200",
      },
      {
        title: "終點",
        kicker: "08 / 08",
        text: "當最後一道晨光出現，整本書都安靜地合上了。",
        image: "https://picsum.photos/seed/story-08/1600/2200",
      },
    ];

    return specs.map((spec, index) => ({
      number: index + 1,
      ...spec,
    }));
  }

  function buildStructure() {
    book.innerHTML = "";
    state.layers = [];

    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 4; index += 1) {
      const layer = document.createElement("section");
      layer.className = `spread-layer layer-${index}`;
      layer.dataset.layer = String(index);
      layer.innerHTML = `
        <div class="page left static" data-part="left"></div>
        <div class="page right static" data-part="right"></div>
      `;
      state.layers.push(layer);
      fragment.appendChild(layer);
    }

    const turnSheet = document.createElement("div");
    turnSheet.className = "turn-sheet side-right";
    turnSheet.style.display = "none";
    turnSheet.innerHTML = `
      <div class="page-face front"></div>
      <div class="page-face back"></div>
    `;
    state.turnSheet = turnSheet;
    state.turnFront = turnSheet.querySelector(".front");
    state.turnBack = turnSheet.querySelector(".back");
    fragment.appendChild(turnSheet);

    book.appendChild(fragment);
  }

  function bindEvents() {
    if (soundToggle) {
      soundToggle.addEventListener("click", () => {
        state.soundEnabled = !state.soundEnabled;
        soundToggle.textContent = `音效：${state.soundEnabled ? "開" : "關"}`;
        soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
        if (!state.soundEnabled && state.audioContext?.state === "running") {
          state.audioContext.suspend().catch(() => {});
        }
      });
    }

    book.addEventListener("pointerdown", onPointerDown);
    book.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", () => renderBook());

    document.addEventListener("selectstart", (event) => {
      if (event.target instanceof Element && event.target.closest(".book")) {
        event.preventDefault();
      }
    });

    document.addEventListener("dragstart", (event) => {
      if (event.target instanceof Element && event.target.closest(".book")) {
        event.preventDefault();
      }
    });
  }

  function renderBook() {
    renderLayers();
    renderTurnSheet();
  }

  function renderLayers() {
    const current = state.currentSpread;
    const next = mod(current + 1, SPREAD_COUNT);
    const prev = mod(current - 1, SPREAD_COUNT);
    const far = mod(current + 2, SPREAD_COUNT);

    const currentSide = state.turn?.direction === "next"
      ? "left"
      : state.turn?.direction === "prev"
        ? "right"
        : "both";

    renderLayer(state.layers[0], current, "current", currentSide);

    if (state.turn?.direction === "next") {
      renderLayer(state.layers[1], next, "next", "right");
      renderLayer(state.layers[2], prev, "prev", "hidden");
    } else if (state.turn?.direction === "prev") {
      renderLayer(state.layers[1], next, "next", "hidden");
      renderLayer(state.layers[2], prev, "prev", "left");
    } else {
      renderLayer(state.layers[1], next, "next", "hidden");
      renderLayer(state.layers[2], prev, "prev", "hidden");
    }

    renderLayer(state.layers[3], far, "far", "hidden");
  }

  function renderLayer(layer, spreadIndex, role, visibleSide) {
    const leftPage = pageData[mod(spreadIndex * 2, PAGE_COUNT)];
    const rightPage = pageData[mod(spreadIndex * 2 + 1, PAGE_COUNT)];

    layer.className = `spread-layer is-${role}`;
    if (role === "current") {
      layer.classList.add("is-current");
    } else if (role === "next") {
      layer.classList.add("is-next");
    } else if (role === "prev") {
      layer.classList.add("is-prev");
    } else {
      layer.classList.add("is-far");
    }

    if (visibleSide !== "hidden") {
      layer.classList.add("is-exposed");
    }

    const leftHidden = visibleSide === "right" || visibleSide === "hidden";
    const rightHidden = visibleSide === "left" || visibleSide === "hidden";

    layer.innerHTML = `
      <div class="page left static ${leftHidden ? "hidden" : ""}" data-part="left">
        ${pageMarkup(leftPage, "left", false)}
      </div>
      <div class="page right static ${rightHidden ? "hidden" : ""}" data-part="right">
        ${pageMarkup(rightPage, "right", false)}
      </div>
    `;
  }

  function renderTurnSheet() {
    if (!state.turn) {
      state.turnSheet.style.display = "none";
      state.turnSheet.classList.remove("side-left", "side-right");
      state.turnSheet.style.removeProperty("--turn-angle");
      state.turnSheet.style.removeProperty("--turn-shadow");
      state.turnFront.innerHTML = "";
      state.turnBack.innerHTML = "";
      return;
    }

    const { direction, angle } = state.turn;
    const currentLeft = pageData[mod(state.currentSpread * 2, PAGE_COUNT)];
    const currentRight = pageData[mod(state.currentSpread * 2 + 1, PAGE_COUNT)];
    const nextLeft = pageData[mod(state.currentSpread * 2 + 2, PAGE_COUNT)];
    const prevRight = pageData[mod(state.currentSpread * 2 - 1, PAGE_COUNT)];

    state.turnSheet.style.display = "block";
    state.turnSheet.classList.toggle("side-right", direction === "next");
    state.turnSheet.classList.toggle("side-left", direction === "prev");
    state.turnSheet.style.setProperty("--turn-angle", `${angle}deg`);
    state.turnSheet.style.setProperty("--turn-shadow", `${Math.min(1, Math.abs(angle) / 180)}`);

    if (direction === "next") {
      state.turnFront.innerHTML = pageMarkup(currentRight, "right", false);
      state.turnBack.innerHTML = pageMarkup(nextLeft, "left", true);
    } else {
      state.turnFront.innerHTML = pageMarkup(currentLeft, "left", false);
      state.turnBack.innerHTML = pageMarkup(prevRight, "right", true);
    }
  }

  function pageMarkup(page, side, mirrored) {
    const alignClass = side === "left" ? "align-left" : "align-right";
    const edgeShadow = side === "left" ? "page-left-shadow" : "page-right-shadow";
    const mirrorClass = mirrored ? " mirror" : "";

    return `
      <div class="page-card${mirrorClass}" data-page="${page.number}">
        <img class="page-media" src="${page.image}" alt="${escapeHtml(page.title)}" draggable="false" loading="eager" fetchpriority="high" />
        <div class="page-overlay"></div>
        <div class="page-meta">${String(page.number).padStart(2, "0")} / ${PAGE_COUNT}</div>
        <div class="page-copy ${alignClass}">
          <span class="page-kicker">${escapeHtml(page.kicker)}</span>
          <h2 class="page-title">${escapeHtml(page.title)}</h2>
          <p class="page-text">${escapeHtml(page.text)}</p>
        </div>
        <div class="${edgeShadow}"></div>
      </div>
    `;
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;

    const side = getSide(event.clientX);

    if (state.turn) {
      const opposite =
        (state.turn.direction === "next" && side === "left") ||
        (state.turn.direction === "prev" && side === "right");

      if (opposite && state.turn.mode !== "drag") {
        clearTurnTimer();
        settleTurn(0);
      }
      return;
    }

    startTurn(side === "right" ? "next" : "prev", event);
  }

  function startTurn(direction, event) {
    state.turn = {
      direction,
      mode: "drag",
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      angle: 0,
      timer: null,
    };

    setTurnTransition(false);
    renderBook();
    setTurnAngle(0);

    try {
      book.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture failures on browsers that do not allow it.
    }
  }

  function onPointerMove(event) {
    if (!state.turn || state.turn.mode !== "drag" || event.pointerId !== state.turn.pointerId) {
      return;
    }

    event.preventDefault();
    state.turn.lastX = event.clientX;

    const rect = book.getBoundingClientRect();
    const dragDist = rect.width / 2;
    const deltaX = event.clientX - state.turn.startX;

    let angle = state.turn.direction === "next"
      ? clamp(state.turn.startAngle + (deltaX / dragDist) * 180, -180, 0)
      : clamp(state.turn.startAngle + (deltaX / dragDist) * 180, 0, 180);

    state.turn.angle = angle;
    setTurnAngle(angle);
  }

  function onPointerUp(event) {
    if (!state.turn || event.pointerId !== state.turn.pointerId) {
      return;
    }

    const deltaX = state.turn.lastX - state.turn.startX;
    const clicked = Math.abs(deltaX) < 12;
    const complete =
      clicked ||
      (state.turn.direction === "next" ? state.turn.angle <= -90 : state.turn.angle >= 90);
    const targetAngle = complete ? (state.turn.direction === "next" ? -180 : 180) : 0;

    state.turn.mode = "settling";
    settleTurn(targetAngle);

    try {
      book.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release failures.
    }
  }

  function settleTurn(targetAngle) {
    if (!state.turn) return;

    clearTurnTimer();
    setTurnTransition(true);
    setTurnAngle(targetAngle);

    if (targetAngle !== 0) {
      playFlipSound(state.turn.direction);
    }

    state.turn.timer = window.setTimeout(() => {
      if (!state.turn) return;

      const shouldAdvance = targetAngle !== 0;
      const direction = state.turn.direction;

      if (shouldAdvance) {
        state.currentSpread = mod(
          state.currentSpread + (direction === "next" ? 1 : -1),
          SPREAD_COUNT,
        );
      }

      state.turn = null;
      setTurnTransition(false);
      renderBook();
    }, FLIP_MS);
  }

  function clearTurnTimer() {
    if (state.turn?.timer) {
      window.clearTimeout(state.turn.timer);
      state.turn.timer = null;
    }
  }

  function setTurnAngle(angle) {
    if (!state.turnSheet) return;
    state.turnSheet.style.setProperty("--turn-angle", `${angle}deg`);
    state.turnSheet.style.setProperty("--turn-shadow", `${Math.min(1, Math.abs(angle) / 180)}`);
    if (state.turn?.direction === "next" || state.turn?.direction === "prev") {
      state.turn.angle = angle;
    }
  }

  function setTurnTransition(enabled) {
    state.turnSheet.style.transition = enabled
      ? `transform ${FLIP_MS}ms cubic-bezier(0.24, 0.82, 0.24, 1)`
      : "none";
  }

  function playFlipSound(direction) {
    if (!state.soundEnabled) return;

    const context = ensureAudioContext();
    if (!context) return;

    const duration = 0.12;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < channel.length; index += 1) {
      const fade = 1 - index / channel.length;
      channel[index] = (Math.random() * 2 - 1) * fade * 0.42;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = direction === "next" ? 1200 : 920;
    filter.Q.value = 0.9;

    const gain = context.createGain();
    gain.gain.value = 0.0001;

    source.connect(filter).connect(gain).connect(context.destination);

    const now = context.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.085, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.start(now);
  }

  function ensureAudioContext() {
    if (!state.soundEnabled) return null;

    if (!state.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }
      state.audioContext = new AudioContextClass();
    }

    if (state.audioContext.state === "suspended") {
      state.audioContext.resume().catch(() => {});
    }

    return state.audioContext;
  }

  function onKeyDown(event) {
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      if (state.turn && state.turn.direction === "prev") {
        clearTurnTimer();
        settleTurn(0);
        return;
      }
      if (!state.turn) {
        startProgrammaticTurn("next");
      }
    }

    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      if (state.turn && state.turn.direction === "next") {
        clearTurnTimer();
        settleTurn(0);
        return;
      }
      if (!state.turn) {
        startProgrammaticTurn("prev");
      }
    }
  }

  function startProgrammaticTurn(direction) {
    state.turn = {
      direction,
      mode: "drag",
      pointerId: -1,
      startX: 0,
      lastX: 0,
      angle: 0,
      timer: null,
    };

    setTurnTransition(false);
    renderBook();
    setTurnAngle(0);
    state.turn.mode = "settling";
    settleTurn(direction === "next" ? -180 : 180);
  }

  function getSide(clientX) {
    const rect = book.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2 ? "left" : "right";
  }

  function pageAt(index) {
    return pageData[mod(index, PAGE_COUNT)];
  }

  function mod(value, base) {
    return ((value % base) + base) % base;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
});
