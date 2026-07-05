/* Slow Reveal — picture overlay app
 *
 * Layering (bottom → top):
 *   #baseImg   sharp image, fit to stage
 *   #cover     transparent div with backdrop-filter: blur(N) — the frosted cover
 *   #spotLayer spotlights: divs that paint an offset sharp copy of the image
 *              via background-position, so each is a crisp aligned "window"
 *
 * All spotlight geometry is stored as FRACTIONS of the stage (0..1), so
 * window resizes / rotations keep every window registered with the image.
 */

"use strict";

// ---------- DOM ----------
const stageWrap  = document.getElementById("stageWrap");
const stage      = document.getElementById("stage");
const baseImg    = document.getElementById("baseImg");
const cover      = document.getElementById("cover");
const spotLayer  = document.getElementById("spotLayer");
const blurSlider = document.getElementById("blurSlider");
const coverBtn   = document.getElementById("coverBtn");
const clearBtn   = document.getElementById("clearBtn");
const imagesBtn  = document.getElementById("imagesBtn");
const imageTray  = document.getElementById("imageTray");
const thumbStrip = document.getElementById("thumbStrip");
const refreshBtn = document.getElementById("refreshBtn");
const folderBtn  = document.getElementById("folderBtn");
const zoomResetBtn = document.getElementById("zoomResetBtn");

// ---------- state ----------
let images = [];            // [{ name, url }]
let currentUrl = null;
let currentName = null;
let imgW = 0, imgH = 0;     // natural size of current image
let stageW = 0, stageH = 0; // fitted stage size in px
let spots = [];             // [{ el, x, y, w, h }]  fractions of stage
let coverOn = true;

const MIN_SPOT_PX = 56;
const TAP_SLOP = 12;        // px of movement still counted as a tap

// ---------- image fitting ----------
function layoutStage() {
  if (!imgW || !imgH) return;
  const availW = stageWrap.clientWidth;
  const availH = stageWrap.clientHeight;
  const scale = Math.min(availW / imgW, availH / imgH);
  stageW = Math.round(imgW * scale);
  stageH = Math.round(imgH * scale);
  stage.style.width  = stageW + "px";
  stage.style.height = stageH + "px";
  resetZoom();               // keep coordinate math sane across relayouts
  spots.forEach(renderSpot);
}

// ---------- zoom (whole image; spotlights ride along) ----------
const MAX_ZOOM = 6;
const zoom = { s: 1, tx: 0, ty: 0 };

function applyZoom() {
  stage.style.transform = `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.s})`;
  stage.style.setProperty("--z", zoom.s);   // spot chrome counter-scales by 1/--z
  zoomResetBtn.disabled = zoom.s === 1;
  zoomResetBtn.textContent = Math.round(zoom.s * 10) / 10 + "×";
  spots.forEach(renderSpot);                // border width depends on zoom
}

function clampZoomPan() {
  zoom.s = clamp(zoom.s, 1, MAX_ZOOM);
  zoom.tx = clamp(zoom.tx, stageW * (1 - zoom.s), 0);
  zoom.ty = clamp(zoom.ty, stageH * (1 - zoom.s), 0);
}

function zoomAt(ax, ay, newScale) {
  // zoom so the image point under client (ax, ay) stays put
  const rect = stage.getBoundingClientRect();
  const Lx = (ax - rect.left) / zoom.s;
  const Ly = (ay - rect.top) / zoom.s;
  const baseL = rect.left - zoom.tx, baseT = rect.top - zoom.ty;
  zoom.s = clamp(newScale, 1, MAX_ZOOM);
  zoom.tx = ax - Lx * zoom.s - baseL;
  zoom.ty = ay - Ly * zoom.s - baseT;
  clampZoomPan();
  applyZoom();
}

function resetZoom() {
  zoom.s = 1; zoom.tx = 0; zoom.ty = 0;
  applyZoom();
}

// client coords -> stage-local (unscaled) coords
function stageLocal(clientX, clientY) {
  const r = stage.getBoundingClientRect();
  return { x: (clientX - r.left) / zoom.s, y: (clientY - r.top) / zoom.s };
}

function selectImage(item) {
  const probe = new Image();
  probe.onload = () => {
    imgW = probe.naturalWidth;
    imgH = probe.naturalHeight;
    currentUrl = item.url;
    currentName = item.name;
    baseImg.src = item.url;
    stage.classList.add("has-image");
    clearSpots();                    // fresh start per image
    layoutStage();
    updateThumbSelection();
    setTray(false);
  };
  probe.onerror = () => alert("Could not load " + item.name);
  probe.src = item.url;
}

// ---------- image list ----------
async function fetchServerList() {
  const res = await fetch("/api/images", { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return data.images.map(name => ({
    name,
    url: "images/" + encodeURIComponent(name),
  }));
}

function buildThumbs() {
  thumbStrip.innerHTML = "";
  if (!images.length) {
    const p = document.createElement("p");
    p.id = "trayMsg";
    p.textContent = "No images found. Drop photos into the images/ folder " +
                    "and tap Refresh — or use “Choose folder…”.";
    thumbStrip.appendChild(p);
    return;
  }
  for (const item of images) {
    const t = document.createElement("div");
    t.className = "thumb";
    t.style.backgroundImage = `url("${item.url}")`;
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = item.name;
    t.appendChild(label);
    t.addEventListener("click", () => selectImage(item));
    t.dataset.name = item.name;
    thumbStrip.appendChild(t);
  }
  updateThumbSelection();
}

function updateThumbSelection() {
  for (const t of thumbStrip.querySelectorAll(".thumb")) {
    t.classList.toggle("selected", t.dataset.name === currentName);
  }
}

async function refreshList() {
  try {
    images = await fetchServerList();
    buildThumbs();
  } catch (err) {
    thumbStrip.innerHTML = "";
    const p = document.createElement("p");
    p.id = "trayMsg";
    p.textContent = "Couldn’t reach the server list. If you’re running " +
                    "without the Mac, use “Choose folder…” instead.";
    thumbStrip.appendChild(p);
  }
}

// Plan B: run with no server listing — pick a local folder (ChromeOS Files app)
async function chooseFolder() {
  if (!window.showDirectoryPicker) {
    alert("This browser doesn’t support folder picking. Use the server list instead.");
    return;
  }
  try {
    const dir = await window.showDirectoryPicker();
    const found = [];
    for await (const entry of dir.values()) {
      if (entry.kind === "file" && /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(entry.name)) {
        const file = await entry.getFile();
        found.push({ name: entry.name, url: URL.createObjectURL(file) });
      }
    }
    found.sort((a, b) => a.name.localeCompare(b.name));
    if (!found.length) { alert("No images found in that folder."); return; }
    images = found;
    buildThumbs();
  } catch (err) {
    /* user cancelled — ignore */
  }
}

// ---------- blur & cover ----------
// Slider 0–100 maps quadratically to 0–150px: fine control at the low end,
// total obliteration (no guessable outlines) at full blast.
const MAX_BLUR_PX = 150;
function setBlur(v) {
  const px = MAX_BLUR_PX * Math.pow(v / 100, 2);
  cover.style.backdropFilter = `blur(${px}px)`;
  cover.style.webkitBackdropFilter = `blur(${px}px)`;
  try { localStorage.setItem("slowreveal-blur2", v); } catch (e) {}
}

function setCover(on) {
  coverOn = on;
  cover.classList.toggle("hidden", !on);
  stage.classList.toggle("cover-off", !on);
  coverBtn.setAttribute("aria-pressed", String(on));
  coverBtn.innerHTML = on ? "Cover&nbsp;ON" : "Cover&nbsp;OFF";
}

// ---------- spotlights ----------
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function renderSpot(s) {
  const x = s.x * stageW, y = s.y * stageH;
  const w = s.w * stageW, h = s.h * stageH;
  s.el.style.left = x + "px";
  s.el.style.top = y + "px";
  s.el.style.width = w + "px";
  s.el.style.height = h + "px";
  // paint the aligned sharp copy (offset by the spot's own position,
  // minus the border — which is 2/zoom local px so it stays 2px on screen)
  const bw = 2 / zoom.s;
  s.el.style.backgroundImage = `url("${currentUrl}")`;
  s.el.style.backgroundSize = `${stageW}px ${stageH}px`;
  s.el.style.backgroundPosition = `${-x - bw}px ${-y - bw}px`;
}

function clampSpot(s) {
  const minW = MIN_SPOT_PX / stageW, minH = MIN_SPOT_PX / stageH;
  s.w = clamp(s.w, minW, 1);
  s.h = clamp(s.h, minH, 1);
  s.x = clamp(s.x, 0, 1 - s.w);
  s.y = clamp(s.y, 0, 1 - s.h);
}

function removeSpot(s) {
  s.el.remove();
  spots = spots.filter(o => o !== s);
}

function clearSpots() {
  spots.forEach(s => s.el.remove());
  spots = [];
}

function createSpot(px, py) {
  // px, py: stage-local pixels (tap point = center); default size is
  // relative to what's on screen, so it feels the same at any zoom
  const side = Math.max(MIN_SPOT_PX, Math.min(stageW, stageH) * 0.30 / zoom.s);
  const s = {
    x: (px - side / 2) / stageW,
    y: (py - side / 2) / stageH,
    w: side / stageW,
    h: side / stageH,
    el: document.createElement("div"),
  };
  s.el.className = "spot";
  const close = document.createElement("div");
  close.className = "close";
  const handle = document.createElement("div");
  handle.className = "handle";
  s.el.appendChild(close);
  s.el.appendChild(handle);
  spotLayer.appendChild(s.el);
  clampSpot(s);
  renderSpot(s);
  attachSpotEvents(s, close, handle);
  spots.push(s);
  return s;
}

// ---------- pointer interactions ----------

// On the stage background / frosted cover:
//   one finger or mouse: tap → default spotlight; press-and-drag → draw one
//   two fingers: pinch-zoom the whole image (spotlights ride along)
//   mousewheel: zoom in/out anchored at the cursor
(function stageGestures() {
  const pts = new Map();  // pointerId -> {x, y} (only pointers we accepted)
  let tapStart = null;    // { id, x, y } client coords
  let draft = null;       // spotlight being drawn, or null
  let pinch = null;       // pinch-zoom state, or null
  let pan = null;         // { id, x, y } pan-drag state, or null
  let lpTimer = null;     // touch long-press timer

  function clearLongPress() {
    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
  }

  function startPan(id, x, y) {
    pan = { id, x, y };
    tapStart = null;
    clearLongPress();
    stage.style.cursor = "grabbing";
  }

  stage.addEventListener("pointerdown", e => {
    // middle mouse button (wheel press) pans, wherever it lands on the stage
    if (e.button === 1) {
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      startPan(e.pointerId, e.clientX, e.clientY);
      return;
    }
    // ignore pointers that began on a spotlight (they handle themselves)
    if (e.target !== cover && e.target !== stage) return;
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      tapStart = { id: e.pointerId, x: e.clientX, y: e.clientY };
      pinch = null;
      // touch: hold still ~0.5s, then move to pan (no new spotlight)
      if (e.pointerType !== "mouse") {
        clearLongPress();
        const id = e.pointerId;
        lpTimer = setTimeout(() => {
          lpTimer = null;
          if (tapStart && tapStart.id === id && !draft && pts.has(id)) {
            const p = pts.get(id);
            startPan(id, p.x, p.y);
            try { navigator.vibrate && navigator.vibrate(15); } catch (err) {}
          }
        }, 500);
      }
    } else if (pts.size === 2) {
      clearLongPress();
      if (draft) { removeSpot(draft); draft = null; }   // pinch wins
      tapStart = null;
      const [a, b] = [...pts.values()];
      const rect = stage.getBoundingClientRect();
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      pinch = {
        dist0: Math.hypot(a.x - b.x, a.y - b.y),
        s0: zoom.s,
        Lx: (cx - rect.left) / zoom.s,   // image point under the centroid
        Ly: (cy - rect.top) / zoom.s,
        baseL: rect.left - zoom.tx,
        baseT: rect.top - zoom.ty,
      };
    }
  });

  stage.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pan && e.pointerId === pan.id) {
      zoom.tx += e.clientX - pan.x;
      zoom.ty += e.clientY - pan.y;
      pan.x = e.clientX; pan.y = e.clientY;
      clampZoomPan();
      applyZoom();
      return;
    }

    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      zoom.s = clamp(pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist0,
                     1, MAX_ZOOM);
      zoom.tx = cx - pinch.Lx * zoom.s - pinch.baseL;  // centroid stays anchored
      zoom.ty = cy - pinch.Ly * zoom.s - pinch.baseT;
      clampZoomPan();
      applyZoom();
      return;
    }

    if (!tapStart || e.pointerId !== tapStart.id || !coverOn) return;
    const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
    if (!draft && moved > TAP_SLOP) draft = createSpot(0, 0); // sized below
    if (draft) {
      const a = stageLocal(tapStart.x, tapStart.y);   // anchor corner
      const p = stageLocal(e.clientX, e.clientY);
      draft.x = Math.min(a.x, p.x) / stageW;
      draft.y = Math.min(a.y, p.y) / stageH;
      draft.w = Math.abs(p.x - a.x) / stageW;
      draft.h = Math.abs(p.y - a.y) / stageH;
      clampSpot(draft);
      renderSpot(draft);
    }
  });

  function endP(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pan && e.pointerId === pan.id) { pan = null; stage.style.cursor = ""; }
    if (pinch && pts.size < 2) pinch = null;
    if (tapStart && e.pointerId === tapStart.id) clearLongPress();
    if (tapStart && e.pointerId === tapStart.id) {
      if (!draft && e.type === "pointerup" && coverOn) {
        const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
        if (moved <= TAP_SLOP) {
          const p = stageLocal(e.clientX, e.clientY);
          createSpot(p.x, p.y);                 // plain tap → default square
        }
      }
      tapStart = null;
      draft = null;
    }
  }
  stage.addEventListener("pointerup", endP);
  stage.addEventListener("pointercancel", endP);

  // keep Chrome's middle-click autoscroll / aux menu out of the way
  stageWrap.addEventListener("mousedown", e => { if (e.button === 1) e.preventDefault(); });
  stageWrap.addEventListener("auxclick", e => e.preventDefault());

  // mousewheel zoom, anchored at the cursor (Mac trackpad pinch also
  // arrives as a wheel event, so it works there too)
  stageWrap.addEventListener("wheel", e => {
    if (!imgW) return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, zoom.s * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
})();

function attachSpotEvents(s, closeBtn, handle) {
  // -- close button --
  closeBtn.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;      // middle button bubbles up = pan
    e.stopPropagation();
  });
  closeBtn.addEventListener("pointerup", e => {
    e.stopPropagation();
    removeSpot(s);
  });

  // -- corner resize handle --
  let rs = null;
  handle.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;      // middle button bubbles up = pan
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    rs = { id: e.pointerId, x0: e.clientX, y0: e.clientY, w0: s.w, h0: s.h };
  });
  handle.addEventListener("pointermove", e => {
    if (!rs || e.pointerId !== rs.id) return;
    s.w = rs.w0 + (e.clientX - rs.x0) / (stageW * zoom.s);
    s.h = rs.h0 + (e.clientY - rs.y0) / (stageH * zoom.s);
    clampSpot(s);
    renderSpot(s);
  });
  const endResize = e => { if (rs && e.pointerId === rs.id) rs = null; };
  handle.addEventListener("pointerup", endResize);
  handle.addEventListener("pointercancel", endResize);

  // -- body: drag to move, two fingers to pinch-resize, double-tap to close --
  const active = new Map();   // pointerId -> {x, y}
  let moveStart = null;       // single-pointer drag origin
  let pinchStart = null;      // two-pointer origin
  let lastTap = 0;

  s.el.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;      // middle button bubbles up = pan
    s.el.setPointerCapture(e.pointerId);
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size === 1) {
      moveStart = { x: e.clientX, y: e.clientY, sx: s.x, sy: s.y, moved: 0 };
      pinchStart = null;
    } else if (active.size === 2) {
      const [a, b] = [...active.values()];
      pinchStart = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
        x: s.x, y: s.y, w: s.w, h: s.h,
      };
      moveStart = null;
    }
  });

  s.el.addEventListener("pointermove", e => {
    if (!active.has(e.pointerId)) return;
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchStart && active.size >= 2) {
      const [a, b] = [...active.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const k = clamp(dist / pinchStart.dist, 0.2, 8);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const nw = pinchStart.w * k, nh = pinchStart.h * k;
      // keep the pinch centroid anchored, and follow it as it moves
      s.x = pinchStart.x - (nw - pinchStart.w) / 2 + (cx - pinchStart.cx) / (stageW * zoom.s);
      s.y = pinchStart.y - (nh - pinchStart.h) / 2 + (cy - pinchStart.cy) / (stageH * zoom.s);
      s.w = nw; s.h = nh;
      clampSpot(s);
      renderSpot(s);
    } else if (moveStart) {
      const dx = e.clientX - moveStart.x, dy = e.clientY - moveStart.y;
      moveStart.moved = Math.max(moveStart.moved, Math.hypot(dx, dy));
      s.x = moveStart.sx + dx / (stageW * zoom.s);
      s.y = moveStart.sy + dy / (stageH * zoom.s);
      clampSpot(s);
      renderSpot(s);
    }
  });

  const endBody = e => {
    if (!active.has(e.pointerId)) return;
    active.delete(e.pointerId);
    if (pinchStart && active.size < 2) pinchStart = null;
    if (active.size === 0) {
      // double-tap (two quick taps with almost no movement) closes
      if (moveStart && moveStart.moved <= TAP_SLOP && e.type === "pointerup") {
        const now = performance.now();
        if (now - lastTap < 350) { removeSpot(s); lastTap = 0; return; }
        lastTap = now;
      }
      moveStart = null;
    } else if (active.size === 1) {
      // dropped from pinch to one finger: restart a clean drag
      const [p] = [...active.values()];
      moveStart = { x: p.x, y: p.y, sx: s.x, sy: s.y, moved: TAP_SLOP + 1 };
    }
  };
  s.el.addEventListener("pointerup", endBody);
  s.el.addEventListener("pointercancel", endBody);
}

// ---------- tray ----------
function setTray(open) {
  imageTray.classList.toggle("closed", !open);
  imageTray.setAttribute("aria-hidden", String(!open));
}

// ---------- wiring ----------
blurSlider.addEventListener("input", () => setBlur(blurSlider.value));
coverBtn.addEventListener("click", () => setCover(!coverOn));
clearBtn.addEventListener("click", clearSpots);
zoomResetBtn.addEventListener("click", resetZoom);
imagesBtn.addEventListener("click", () =>
  setTray(imageTray.classList.contains("closed")));
refreshBtn.addEventListener("click", () => refreshList());
folderBtn.addEventListener("click", chooseFolder);
window.addEventListener("resize", layoutStage);
stage.addEventListener("contextmenu", e => e.preventDefault());

// ---------- init ----------
(function init() {
  let saved = null;
  try { saved = localStorage.getItem("slowreveal-blur2"); } catch (e) {}
  if (saved !== null) blurSlider.value = saved;
  setBlur(blurSlider.value);
  setCover(true);
  refreshList().then(() => {
    if (images.length === 1) selectImage(images[0]);
    else setTray(true);               // let the teacher pick right away
  });
})();
