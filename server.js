const express = require('express');
const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');
 
const app = express();
const PORT = process.env.PORT || 3000;
 
function findChrome() {
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
  for (const path of candidates) {
    try { execSync(`test -f ${path}`); return path; } catch(e) {}
  }
  try { return execSync('which chromium-browser 2>/dev/null || which chromium 2>/dev/null || which google-chrome 2>/dev/null').toString().trim(); } catch(e) {}
  return null;
}
 
app.get('/screenshot', async (req, res) => {
  const { url, variant } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
 
  const chromePath = findChrome();
  if (!chromePath) return res.status(500).json({ error: 'Chrome not found on system' });
 
  console.log('Using Chrome at:', chromePath);
 
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    });
 
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
 
    const storeUrl = new URL(url);
    const base = storeUrl.origin;
 
    await page.goto(base, { waitUntil: 'networkidle2', timeout: 30000 });
 
    // Dismiss popups
    await page.evaluate(() => {
      ['[aria-label="Close"]', '.modal__close', '.popup__close', '.klaviyo-close-form'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) el.click();
      });
    });
    await new Promise(r => setTimeout(r, 800));
 
    // Add product to cart
    if (variant) {
      await page.evaluate(async (variantId) => {
        try {
          await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [{ id: parseInt(variantId), quantity: 1 }] }),
          });
        } catch(e) {}
      }, variant);
      await new Promise(r => setTimeout(r, 1500));
    }
 
    // Open slide cart
    const triggered = await page.evaluate(() => {
      const triggers = [
        '[data-cart-toggle]', '[data-drawer-toggle="cart-drawer"]',
        '[data-cart-drawer-toggle]', '.cart-drawer-toggle',
        '.js-cart-trigger', '.header__icon--cart',
        '.cart-icon-bubble', '[aria-controls="cart-drawer"]',
        '[aria-controls="CartDrawer"]', '.icon-cart',
        '.js-mini-cart-trigger', '[data-open-cart]',
        '.cart__toggle', '.site-header__cart',
        '[class*="CartToggle"]', '[class*="cart-toggle"]',
        'a[href="/cart"]',
      ];
      for (const sel of triggers) {
        const el = document.querySelector(sel);
        if (el) { el.click(); return sel; }
      }
      document.dispatchEvent(new CustomEvent('cart:open'));
      window.dispatchEvent(new CustomEvent('cart-open'));
      return 'events';
    });
 
    console.log('Cart triggered via:', triggered);
    await new Promise(r => setTimeout(r, 3000));
 
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 85 });
 
    res.set({ 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
    res.send(screenshot);
 
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});
 
app.get('/health', (req, res) => res.json({ status: 'ok' }));
 
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
