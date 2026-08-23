import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'de-DE' });
const page = await ctx.newPage();

// Bachelor list, hopefully with results
await page.goto('https://www.tum.de/studium/studienangebot?tx_solr%5Bq%5D=&graduation=Bachelor', {
    waitUntil: 'networkidle', timeout: 60000
});
await page.waitForTimeout(3000);

// count text
const count = await page.evaluate(() => {
    const bodyText = document.body.textContent;
    const m = bodyText.match(/(\d+)\s+(Ergebnisse|Studieng)/i);
    return m ? m[0] : 'not found';
});
console.log('Count hint:', count);

// look for the result item pattern
const analysis = await page.evaluate(() => {
    // Find list containers
    const lists = document.querySelectorAll('ul, ol, .results, [class*="result"]');
    let biggest = null;
    for (const el of lists) {
        if (el.children.length > 5) {
            if (!biggest || el.children.length > biggest.children.length) biggest = el;
        }
    }
    if (!biggest) return { none: true };
    // Get first 3 children as sample
    return {
        cls: biggest.className,
        tag: biggest.tagName,
        count: biggest.children.length,
        sample: [...biggest.children].slice(0, 3).map(c => c.outerHTML.slice(0, 500)),
    };
});
console.log('Biggest list:', analysis);

// Also try to find studiengang links
const links = await page.evaluate(() => {
    return [...document.querySelectorAll('main a')].map(a => ({
        href: a.href, text: (a.textContent||'').trim().slice(0,100),
    })).filter(l => l.href && l.text && l.text.length > 5 && l.text.length < 150);
});
console.log('\nMain links (first 20):');
const seen = new Set();
for (const l of links) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    console.log(' ', l.text.padEnd(60), l.href.slice(-80));
    if (seen.size > 25) break;
}

await browser.close();
