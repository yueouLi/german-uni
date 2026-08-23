import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'de-DE' });
const page = await ctx.newPage();

// Log all XHR/fetch requests
const apis = [];
page.on('response', r => {
    const u = r.url();
    if (/\.(json|xml)|api|search|fach|studieng/i.test(u) && !u.includes('.css') && !u.includes('.js?')) {
        apis.push({ status: r.status(), url: u });
    }
});

await page.goto('https://www.lmu.de/de/studium/studienangebot/alle-studienfaecher-und-studiengaenge/', {
    waitUntil: 'networkidle',
    timeout: 60000,
});
await page.waitForTimeout(5000);

console.log('API/data requests:');
for (const a of apis) console.log(' ', a.status, a.url);

// Check for iframes
const frames = page.frames();
console.log(`\nFrames: ${frames.length}`);
for (const f of frames) console.log(' ', f.url());

// Check main region for text
const mainText = await page.evaluate(() => document.querySelector('main')?.textContent?.slice(0, 2000));
console.log('\n--- main text sample ---');
console.log(mainText);

await browser.close();
