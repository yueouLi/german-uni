// Probe: browse LMU studies page with Playwright to see what's actually there
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log('Navigating...');
await page.goto('https://www.lmu.de/de/studium/studienangebot/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);

const title = await page.title();
console.log('Title:', title);

// Search all links whose text contains "Studien" or "Fach"
const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({
        href: a.href,
        text: (a.textContent || '').trim().slice(0, 80),
    })).filter(l => /studien|f[aä]cher|a-z/i.test(l.text) && l.href && !l.href.startsWith('mailto'));
});

console.log(`\nFound ${links.length} candidate links:`);
const seen = new Set();
for (const l of links) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    console.log(`  ${l.href}`);
    console.log(`    → ${l.text}`);
}

await browser.close();
