const express = require('express');
const puppeteer = require('puppeteer-core');
const { execSync, spawnSync } = require('child_process');
 
const app = express();
const PORT = process.env.PORT || 3000;
 
function findChrome() {
  // 1. Environment variable
  if (process.env.CHROMIUM_PATH) {
    console.log('Chrome from env:', process.env.CHROMIUM_PATH);
    return process.env.CHROMIUM_PATH;
  }
 
  // 2. Known paths
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/nix/var/nix/profiles/default/bin/chromium',
    '/nix/store/*/bin/chromium',
  ];
  for (const p of candidates) {
    try {
      execSync(`ls ${p} 2>/dev/null`);
      console.log('Chrome found at:', p);
      return p;
    } catch(e) {}
  }
 
  // 3. Search system
  try {
    const result = execSync('find /usr /nix -name "chromium" -o -name "chromium-browser" -o -name "google-chrome" 2>/dev/null | head -1').toString().trim();
    if (result) { console.log('Chrome found via find:', result); return result; }
  } catch(e) {}
 
  // 4. which
  try {
    const result = execSync('which chromium chromium-browser google-chrome 2>/dev/null | head -1').toString().trim();
    if (result) { console.log('Chrome found via which:', result); return result; }
  } catch(e) {}
 
  return null;
}
 
// Log Chrome path at startup
const chromePath = findChrome();
console.log('Chrome at startup:', chromePath || 'NOT FOUND');
 
// Also log all binaries available
try {
  const bins = execSync('ls /usr/bin/ | grep -i chrom 2>/dev/null').toString().trim();
  console.log('Chrom* binaries in /usr/bin:', bins || 'none');
} catch(e) {}
 
app.get('/screenshot', async (req, res) => {
  const { url, variant } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
 
  const chrome = findChrome();
  if (!chrome) {
    // Return diagnostic info
    let diag = '';
    try { diag = execSync('ls /usr/bin/ 2>/dev/null').toString().slice(0, 500); } catch(e) {}
    return res.status(500).json({ error: 'Chrome not found', diagnostics: diag });
  }
 
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-zygote','--single-process'],
    });
 
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
 
    const base = new URL(url).origin;
    await page.goto(base, { waitUntil: 'networkidle2', timeout: 30000 });
 
    await page.evaluate(() => {
      ['[aria-label="Close"]','.modal__close','.popup__close','.klaviyo-close-form'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) el.click();
      });
    });
    await new Promise(r => setTimeout(r, 800));
 
    if (variant) {
      await page.evaluate(async (v) => {
        try { await fetch('/cart/add.js', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({items:[{id:parseInt(v),quantity:1}]})}); } catch(e) {}
      }, variant);
      await new Promise(r => setTimeout(r, 1500));
    }
 
    await page.evaluate(() => {
      const triggers = ['[data-cart-toggle]','[data-drawer-toggle="cart-drawer"]','.cart-drawer-toggle','.js-cart-trigger','.header__icon--cart','.cart-icon-bubble','[aria-controls="cart-drawer"]','[aria-controls="CartDrawer"]','.icon-cart','.js-mini-cart-trigger','[data-open-cart]','.cart__toggle','[class*="CartToggle"]','[class*="cart-toggle"]'];
      for (const sel of triggers) {
        const el = document.querySelector(sel);
        if (el) { el.click(); return; }
      }
      document.dispatchEvent(new CustomEvent('cart:open'));
      window.dispatchEvent(new CustomEvent('cart-open'));
    });
 
    await new Promise(r => setTimeout(r, 3000));
 
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 85 });
    res.set({'Content-Type':'image/jpeg','Access-Control-Allow-Origin':'*','Cache-Control':'no-cache'});
    res.send(screenshot);
 
  } catch(err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});
 
app.get('/health', (req, res) => res.json({ status: 'ok', chrome: findChrome() || 'not found' }));
app.get('/diag', (req, res) => {
  let info = {};
  try { info.usr_bin = execSync('ls /usr/bin/ | grep -i chrom').toString().trim(); } catch(e) { info.usr_bin = 'none'; }
  try { info.which = execSync('which chromium chromium-browser google-chrome 2>/dev/null').toString().trim(); } catch(e) { info.which = 'none'; }
  try { info.find = execSync('find /usr /nix -name "chromium*" 2>/dev/null | head -5').toString().trim(); } catch(e) { info.find = 'none'; }
  try { info.env = process.env.CHROMIUM_PATH || 'not set'; } catch(e) {}
  res.json(info);
});
 
app.listen(PORT, () => console.log(`Server on port ${PORT}, Chrome: ${findChrome() || 'NOT FOUND'}`));
