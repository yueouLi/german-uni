import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'de-DE' });
const page = await ctx.newPage();

// TUM Studies overview
const url = 'https://www.tum.de/studium/studienangebot';
console.log('Opening', url);
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);
console.log('Title:', await page.title());
console.log('Final URL:', page.url());

// XHR watch
const apis = [];
page.on('response', r => {
    const u = r.url();
    if (/\.(json|xml)$|api|search|studieng|degree/i.test(u) && !u.includes('.css')) apis.push({ status: r.status(), url: u });
});

// Look for the actual list link
const relevantLinks = await page.evaluate(() => {
    return [...document.querySelectorAll('a')].map(a => ({
        href: a.href,
        text: (a.textContent||'').trim().slice(0, 100),
    })).filter(l =>
        l.href && l.text.length > 3 && l.text.length < 120 &&
        /studieng|alle|a-z|liste|angebot/i.test(l.text + ' ' + l.href)
    );
});

const seen = new Set();
console.log('\n=== Candidate links ===');
for (const l of relevantLinks) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    console.log('  ', l.href);
    console.log('     →', l.text);
    if (seen.size > 25) break;
}

console.log('\n=== API calls seen ===');
for (const a of apis) console.log(' ', a.status, a.url);

await browser.close();
