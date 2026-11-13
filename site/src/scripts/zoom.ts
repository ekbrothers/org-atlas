// Zoom and pan for diagrams.
//
//   <div data-zoom="svg">   ... <svg data-viewbox="0 0 W H" viewBox="0 0 W H"> ...   zooms by changing the viewBox (stays crisp)
//   <div data-zoom="html">  ... <div data-zoom-viewport> <div data-zoom-content> ...
//                           scales the content with a CSS transform, keeping scrollbars right
//
// Controls (any element inside the root): [data-zoom-in] [data-zoom-out] [data-zoom-fit]
// [data-zoom-full] [data-zoom-level]. Ctrl/Cmd + wheel (and trackpad pinch) zooms at the
// pointer, dragging pans, double-click zooms in, two-finger pinch works on touch screens.

const STEP = 1.25;
const isInteractive = (el: EventTarget | null) => el instanceof Element && !!el.closest('a, button, input, select, textarea, label');

function controls(root: HTMLElement, api: { zoomBy: (f: number) => void; fit: () => void; level: () => number }) {
  const level = root.querySelector<HTMLElement>('[data-zoom-level]');
  const show = () => level && (level.textContent = `${Math.round(api.level() * 100)}%`);
  root.querySelector('[data-zoom-in]')?.addEventListener('click', () => (api.zoomBy(STEP), show()));
  root.querySelector('[data-zoom-out]')?.addEventListener('click', () => (api.zoomBy(1 / STEP), show()));
  root.querySelector('[data-zoom-fit]')?.addEventListener('click', () => (api.fit(), show()));
  root.querySelector('[data-zoom-full]')?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen?.().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => setTimeout(() => (api.fit(), show()), 50));
  return show;
}

// Shared pointer handling: drag to pan, two pointers to pinch.
function pointers(target: HTMLElement, onPan: (dx: number, dy: number) => void, onPinch: (f: number, x: number, y: number) => void) {
  const active = new Map<number, { x: number; y: number }>();
  let lastDist = 0;
  target.addEventListener('pointerdown', (e) => {
    if (isInteractive(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    target.setPointerCapture(e.pointerId);
    target.classList.add('is-panning');
  });
  target.addEventListener('pointermove', (e) => {
    const prev = active.get(e.pointerId);
    if (!prev) return;
    if (active.size === 1) {
      onPan(e.clientX - prev.x, e.clientY - prev.y);
    } else if (active.size === 2) {
      const [a, b] = [...active.values()];
      const other = a === prev ? b : a;
      const dist = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (lastDist) onPinch(dist / lastDist, (e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
      lastDist = dist;
    }
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const end = (e: PointerEvent) => {
    active.delete(e.pointerId);
    if (active.size < 2) lastDist = 0;
    if (!active.size) target.classList.remove('is-panning');
  };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}

function initSvg(root: HTMLElement) {
  // The diagram, not an icon in the toolbar: mark it with data-viewbox (its full view).
  const svg = root.querySelector<SVGSVGElement>('svg[data-viewbox]');
  if (!svg) return;
  const [bx, by, W, H] = (svg.dataset.viewbox ?? svg.getAttribute('viewBox') ?? '0 0 100 100').split(/\s+/).map(Number);
  let s = 1, vx = bx, vy = by;
  const MIN = 1, MAX = 8;
  const apply = () => {
    const vw = W / s, vh = H / s;
    vx = Math.min(Math.max(vx, bx), bx + W - vw);
    vy = Math.min(Math.max(vy, by), by + H - vh);
    svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    root.classList.toggle('is-zoomed', s > 1.001);
  };
  const zoomAt = (f: number, cx?: number, cy?: number) => {
    const r = svg.getBoundingClientRect();
    const fx = cx === undefined ? 0.5 : (cx - r.left) / r.width;
    const fy = cy === undefined ? 0.5 : (cy - r.top) / r.height;
    const px = vx + fx * (W / s), py = vy + fy * (H / s);
    s = Math.min(MAX, Math.max(MIN, s * f));
    vx = px - fx * (W / s);
    vy = py - fy * (H / s);
    apply();
    show();
  };
  const show = controls(root, { zoomBy: (f) => zoomAt(f), fit: () => ((s = 1), (vx = bx), (vy = by), apply()), level: () => s });
  svg.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
  }, { passive: false });
  svg.addEventListener('dblclick', (e) => zoomAt(STEP * STEP, e.clientX, e.clientY));
  pointers(svg as unknown as HTMLElement, (dx, dy) => {
    if (s <= 1.001) return;
    const r = svg.getBoundingClientRect();
    vx -= (dx * (W / s)) / r.width;
    vy -= (dy * (H / s)) / r.height;
    apply();
  }, (f, x, y) => zoomAt(f, x, y));
  svg.style.touchAction = 'pan-y';
  show();
}

function initHtml(root: HTMLElement) {
  const viewport = root.querySelector<HTMLElement>('[data-zoom-viewport]');
  const content = root.querySelector<HTMLElement>('[data-zoom-content]');
  if (!viewport || !content) return;
  // Wrap the content in a sizer so the scroll area matches the scaled size.
  const sizer = document.createElement('div');
  sizer.className = 'zoom-sizer';
  content.parentElement!.insertBefore(sizer, content);
  sizer.appendChild(content);
  content.style.transformOrigin = '0 0';
  let s = 1;
  const MIN = 0.2, MAX = 3;
  let natural = { w: content.offsetWidth, h: content.offsetHeight };
  const apply = () => {
    content.style.transform = s === 1 ? '' : `scale(${s})`;
    sizer.style.width = s === 1 ? '' : `${natural.w * s}px`;
    sizer.style.height = s === 1 ? '' : `${natural.h * s}px`;
    root.classList.toggle('is-zoomed', s !== 1);
  };
  new ResizeObserver(() => {
    natural = { w: content.offsetWidth, h: content.offsetHeight };
    apply();
  }).observe(content);
  const zoomAt = (f: number, cx?: number, cy?: number) => {
    const r = viewport.getBoundingClientRect();
    const ox = cx === undefined ? r.width / 2 : cx - r.left;
    const oy = cy === undefined ? r.height / 2 : cy - r.top;
    const ux = (viewport.scrollLeft + ox) / s, uy = (viewport.scrollTop + oy) / s;
    s = Math.min(MAX, Math.max(MIN, s * f));
    apply();
    viewport.scrollLeft = ux * s - ox;
    viewport.scrollTop = uy * s - oy;
    show();
  };
  const fit = () => {
    s = Math.min(1, viewport.clientWidth / Math.max(1, natural.w));
    apply();
    viewport.scrollLeft = 0;
  };
  const show = controls(root, { zoomBy: (f) => zoomAt(f), fit, level: () => s });
  viewport.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
  }, { passive: false });
  pointers(viewport, (dx, dy) => {
    viewport.scrollLeft -= dx;
    viewport.scrollTop -= dy;
  }, (f, x, y) => zoomAt(f, x, y));
  show();
}

export function initAllZoom() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-zoom]')) {
    if (el.dataset.zoomReady) continue;
    el.dataset.zoomReady = '1';
    if (el.dataset.zoom === 'svg') initSvg(el);
    else initHtml(el);
  }
}
