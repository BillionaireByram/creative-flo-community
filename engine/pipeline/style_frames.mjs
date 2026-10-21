// Measure the sample in a headless browser. This runs only as the render user.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const project = path.resolve(process.argv[2]);
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(project, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(project + path.sep)) throw new Error('outside workspace');
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf',
      '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
// Use the same headless Chrome the renderer downloads, so the check needs no second browser install.
function renderChrome() {
  if (process.env.STYLE_FRAMES_CHROME) return process.env.STYLE_FRAMES_CHROME;
  const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/.bin/hyperframes');
  try {
    return execFileSync(bin, ['browser', 'path'], { encoding: 'utf8', timeout: 60000 }).trim().split('\n').pop() || undefined;
  } catch { return undefined; }
}
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: renderChrome() });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  // Video elements keep the network busy, so wait for load and fonts instead of network idle.
  await page.goto(origin, { waitUntil: 'load', timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => Number(document.querySelector('[data-composition-id]')?.dataset.duration));
  if (!Number.isFinite(duration) || duration < 1 || duration > 15) throw new Error('invalid sample duration');
  const records = [];
  for (let t = 0.5; t < duration; t += 0.5) {
    const record = await page.evaluate(async t => {
      const timelines = Object.values(window.__timelines || {});
      if (!timelines.length) throw new Error('no sample timeline');
      timelines.forEach(tl => tl.seek(t, false));
      document.querySelectorAll('.clip[data-start]').forEach(el => {
        const start = Number(el.dataset.start), duration = Number(el.dataset.duration);
        el.style.visibility = t >= start && t < start + duration ? 'visible' : 'hidden';
      });
      // This measuring page runs without the renderer's media clock. Seek real footage before
      // measuring text contrast, otherwise every timestamp is checked over the opening frame.
      for (const video of document.querySelectorAll('video[data-start]')) {
        const start = Number(video.dataset.start), duration = Number(video.dataset.duration);
        const active = t >= start && t < start + duration;
        video.style.visibility = active ? 'visible' : 'hidden';
        video.pause();
        if (!active) continue;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => done(new Error('sample video seek timed out')), 10000);
          const done = error => {
            clearTimeout(timer);
            video.removeEventListener('seeked', seeked);
            video.removeEventListener('error', failed);
            video.removeEventListener('loadedmetadata', seek);
            error ? reject(error) : resolve();
          };
          const failed = () => done(new Error('sample video could not be decoded'));
          const seeked = () => done();
          const seek = () => {
            const at = Math.min(Math.max(0, video.duration - 1 / 30),
              t - start + Number(video.dataset.mediaStart || 0));
            if (!Number.isFinite(at)) return failed();
            if (video.readyState >= 2 && Math.abs(video.currentTime - at) < .001) return done();
            video.currentTime = at;
          };
          video.addEventListener('seeked', seeked, { once: true });
          video.addEventListener('error', failed, { once: true });
          if (video.error) return failed();
          if (video.readyState >= 1) seek();
          else {
            video.addEventListener('loadedmetadata', seek, { once: true });
            video.preload = 'auto';
            video.load();
          }
        });
      }
      function visible(el) {
        for (let p = el; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.8) return false;
        }
        return true;
      }
      const texts = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, el = node.parentElement;
        if (!node.textContent.trim() || ['SCRIPT', 'STYLE'].includes(el.tagName) || !visible(el)) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        const s = getComputedStyle(el);
        for (const rect of range.getClientRects()) {
          if (rect.width && rect.height) texts.push({ text: node.textContent.trim(), x: rect.x, y: rect.y,
            width: rect.width, height: rect.height, color: s.color, size: parseFloat(s.fontSize),
            weight: Number(s.fontWeight) || 400, stroke: parseFloat(s.webkitTextStrokeWidth) || 0,
            strokeColor: s.webkitTextStrokeColor, shadow: s.textShadow });
        }
      }
      const logos = [...document.querySelectorAll('img[data-style-logo], .logo-wrap img')].filter(visible).map(el => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return { width: r.width, height: r.height, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight,
          fit: s.objectFit, scaleX: r.width / el.offsetWidth, scaleY: r.height / el.offsetHeight };
      });
      return { t, texts, logos };
    }, t);
    const stem = `review/frames/t${t.toFixed(2)}`;
    await page.screenshot({ path: path.join(project, stem + '.png') });
    // Hide only glyph paint to measure the actual layered background beneath it.
    const mask = await page.addStyleTag({ content: 'body * { color:transparent!important; -webkit-text-fill-color:transparent!important; text-shadow:none!important; -webkit-text-stroke:0!important; }' });
    await page.screenshot({ path: path.join(project, stem + '-background.png') });
    await mask.evaluate(el => el.remove());
    record.background = stem + '-background.png';
    records.push(record);
  }
  await writeFile(path.join(project, 'review/frame-measurements.json'), JSON.stringify(records));
} finally {
  if (browser) await browser.close();
  server.close();
}
