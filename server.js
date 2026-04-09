const express = require('express');
const puppeteer = require('puppeteer');
 
const app = express();
const PORT = process.env.PORT || 3000;
 
app.get('/screenshot', async (req, res) => {
  const { url, variant } = req.query;
 
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
 
  let browser;
  try {
    browser = await puppeteer.launch({
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
 
    // Parse the store base URL
    const storeUrl = new URL(url);
    const base = storeUrl.origin;
 
    // Navigate to homepage
    await page.goto(base, { waitUntil: 'networkidle2', timeout: 30000 });
 
    // Dismiss any popups/modals
    await page.evaluate(() => {
      const closeSelectors = [
        '[data-rewardful-close]',
        '.modal__close',
        '.popup__close',
        '[aria-label="Close"]',
        '.klaviyo-close-form',
        '#closeBtn',
        '.js-popup-close',
      ];
      closeSelectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) el.click();
      });
    });
 
    await new Promise(r => setTimeout(r, 1000));
 
    // Add product to cart if variant provided
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
 
    // Try to open the slide cart drawer
    const cartOpened = await page.evaluate(() => {
      const triggers = [
        '[data-cart-toggle]',
        '[data-drawer-toggle="cart-drawer"]',
        '[data-cart-drawer-toggle]',
        '.cart-drawer-toggle',
        '.js-cart-trigger',
        '.header__icon--cart',
        '.cart-icon-bubble',
        '[aria-controls="cart-drawer"]',
        '[aria-controls="CartDrawer"]',
        '.icon-cart',
        '.js-mini-cart-trigger',
        '[data-open-cart]',
        '.cart__toggle',
        '.site-header__cart',
        '[class*="CartToggle"]',
        '[class*="cart-toggle"]',
        '[class*="CartIcon"]',
        'a[href="/cart"]',
      ];
 
      for (const sel of triggers) {
        const el = document.querySelector(sel);
        if (el) {
          el.click();
          return sel;
        }
      }
 
      // Fire custom events as fallback
      document.dispatchEvent(new CustomEvent('cart:open'));
      document.dispatchEvent(new CustomEvent('theme:cart:open'));
      window.dispatchEvent(new CustomEvent('cart-open'));
      window.dispatchEvent(new CustomEvent('openCart'));
      return 'events';
    });
 
    console.log('Cart trigger used:', cartOpened);
 
    // Wait for drawer animation
    await new Promise(r => setTimeout(r, 3000));
 
    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 85,
      clip: { x: 0, y: 0, width: 1280, height: 900 },
    });
 
    res.set({
      'Content-Type': 'image/jpeg',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.send(screenshot);
 
  } catch (err) {
    console.error('Screenshot error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});
 
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
 
app.listen(PORT, () => {
  console.log(`Screenshot server running on port ${PORT}`);
});
