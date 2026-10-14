// Photo capture, downscaling and simple red-pen markup.
// Photos are re-encoded to JPEG at a capped size so hundreds fit on the phone.

const THUMB_PX = 480;

// One persistent hidden input per mode. iOS sometimes drops the change event
// for inputs that are created and removed on the fly.
const inputs = {};
function getInput(camera) {
  const key = camera ? 'cam' : 'lib';
  if (inputs[key]) return inputs[key];
  const el = document.createElement('input');
  el.type = 'file';
  el.accept = 'image/*';
  if (camera) el.setAttribute('capture', 'environment');
  else el.multiple = true;
  el.style.cssText = 'position:fixed;left:-1000px;top:0;width:1px;height:1px;opacity:0';
  el.setAttribute('aria-hidden', 'true');
  el.tabIndex = -1;
  document.body.appendChild(el);
  inputs[key] = el;
  return el;
}

// Must be called synchronously from a tap handler (iOS needs the user gesture).
// onFiles receives an array of File objects; never called if the user cancels.
export function pickPhotos(camera, onFiles) {
  const el = getInput(camera);
  el.value = '';
  el.onchange = () => {
    const files = [...(el.files || [])];
    el.value = '';
    if (files.length) onFiles(files);
  };
  el.click();
}

function blobToAB(blob) {
  if (blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsArrayBuffer(blob);
  });
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image format cannot be read. Try taking the photo with the camera button.'));
    img.src = src;
  });
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo (low memory?)'))), 'image/jpeg', quality);
  });
}

// Draw a source onto a canvas of w x h and encode. The canvas is shrunk to 0
// afterwards: iOS caps total canvas memory and does not free it promptly.
async function encode(src, w, h, quality) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  try {
    return await canvasToJpeg(c, quality);
  } finally {
    c.width = 0;
    c.height = 0;
  }
}

function fit(w0, h0, max) {
  const s = Math.min(1, max / Math.max(w0, h0));
  return [Math.max(1, Math.round(w0 * s)), Math.max(1, Math.round(h0 * s))];
}

// File -> {data, thumb (ArrayBuffers, JPEG), w, h, type}
export async function processImage(file, { maxPx = 1600, quality = 0.72 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    // Browsers apply EXIF orientation to <img> and drawImage, so natural size is upright.
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    const [w, h] = fit(w0, h0, maxPx);
    const full = await encode(img, w, h, quality);
    const [tw, th] = fit(w0, h0, THUMB_PX);
    const thumb = await encode(img, tw, th, 0.7);
    return { data: await blobToAB(full), thumb: await blobToAB(thumb), w, h, type: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- object URL cache for <img> tags -------------------------------------
// key: photo id + size + revision (markup bumps rev so stale images are not reused)
const urlCache = new Map();
export function cachedURL(id, which, rev) {
  return urlCache.get(`${id}:${which}:${rev || 0}`);
}
export function makeURL(id, which, rev, buf) {
  const k = `${id}:${which}:${rev || 0}`;
  if (!urlCache.has(k)) urlCache.set(k, URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' })));
  return urlCache.get(k);
}
export function forgetURL(id) {
  for (const [k, u] of urlCache) {
    if (k.startsWith(`${id}:`)) {
      URL.revokeObjectURL(u);
      urlCache.delete(k);
    }
  }
}

// ---- markup editor --------------------------------------------------------
// Full-screen freehand pen over the photo. `data` is the JPEG ArrayBuffer.
// Resolves with the new {data, thumb, w, h} or null if cancelled.
// mount(el, cancel) lets the caller own the overlay (e.g. so Back cancels it);
// it returns {release()} which is called when the editor closes.
export function markup(data, { quality = 0.8, mount = null } = {}) {
  return new Promise(async (resolve) => {
    const src = URL.createObjectURL(new Blob([data], { type: 'image/jpeg' }));
    let img;
    try {
      img = await loadImg(src);
    } catch {
      URL.revokeObjectURL(src);
      resolve(null);
      return;
    }
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const ov = document.createElement('div');
    ov.className = 'markup';
    ov.innerHTML = `
      <div class="markup-stage"><canvas></canvas></div>
      <div class="markup-bar">
        <button type="button" data-m="cancel" class="btn">Cancel</button>
        <button type="button" data-m="undo" class="btn">Undo</button>
        <button type="button" data-m="color" class="btn swatch" aria-label="Pen colour"><span></span></button>
        <button type="button" data-m="save" class="btn primary">Save</button>
      </div>`;
    let handle = null;
    const canvas = ov.querySelector('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const colors = ['#ff1f1f', '#ffd400', '#ffffff'];
    let ci = 0;
    const sw = ov.querySelector('.swatch span');
    sw.style.background = colors[ci];
    const lw = Math.max(4, Math.round(Math.max(W, H) / 160));
    const strokes = [];
    let cur = null;

    const redraw = () => {
      ctx.drawImage(img, 0, 0, W, H);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const s of strokes) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.w;
        ctx.beginPath();
        s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
        ctx.stroke();
      }
    };
    redraw();

    const pos = (ev) => {
      const r = canvas.getBoundingClientRect();
      return [((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H];
    };
    canvas.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      canvas.setPointerCapture(ev.pointerId);
      cur = { color: colors[ci], w: lw, pts: [pos(ev)] };
      strokes.push(cur);
      redraw();
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (!cur) return;
      ev.preventDefault();
      cur.pts.push(pos(ev));
      redraw();
    });
    const end = () => (cur = null);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    let closed = false;
    const close = (val) => {
      if (closed) return;
      closed = true;
      URL.revokeObjectURL(src);
      canvas.width = 0;
      canvas.height = 0;
      ov.remove();
      if (handle) handle.release();
      resolve(val);
    };
    if (mount) handle = mount(ov, () => close(null));
    else document.body.appendChild(ov);
    ov.querySelector('.markup-bar').addEventListener('click', async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const m = b.dataset.m;
      if (m === 'cancel') close(null);
      else if (m === 'undo') {
        strokes.pop();
        redraw();
      } else if (m === 'color') {
        ci = (ci + 1) % colors.length;
        sw.style.background = colors[ci];
      } else if (m === 'save') {
        if (!strokes.length) return close(null);
        b.disabled = true;
        try {
          const full = await canvasToJpeg(canvas, quality);
          const [tw, th] = fit(W, H, THUMB_PX);
          const thumb = await encode(canvas, tw, th, 0.7);
          close({ data: await blobToAB(full), thumb: await blobToAB(thumb), w: W, h: H });
        } catch {
          b.textContent = 'Failed – retry';
          b.disabled = false;
        }
      }
    });
  });
}
