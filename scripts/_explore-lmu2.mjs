import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ locale: 'de-DE' }).then(c => c.newPage());

await page.goto('https://www.lmu.de/de/studium/studienangebot/alle-studienfaecher-und-studiengaenge/', {
    waitUntil: 'networkidle',
    timeout: 60000,
});
await page.waitForTimeout(3000);

// Dump structure of main content area
const structure = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    // Find any list containing many similar items
    const lists = [...main.querySelectorAll('ul, ol, div[class*="list"], div[class*="grid"]')];
    return lists.map(el => ({
        tag: el.tagName,
        cls: el.className.slice(0, 100),
        childCount: el.children.length,
        firstChildTag: el.children[0]?.tagName,
        sample: el.children[0]?.textContent?.trim().slice(0, 80) || '',
    })).filter(l => l.childCount > 10);
});

console.log('Large lists found:', structure.length);
for (const s of structure.slice(0, 10)) console.log(s);

// Also count all links in main
const linkCount = await page.evaluate(() => {
    const m = document.querySelector('main') || document.body;
    return m.querySelectorAll('a').length;
});
console.log('\nTotal <a> in main:', linkCount);

// Get all links with text length between 5-80 and href to studienfach
const specific = await page.evaluate(() => {
    return [...document.querySelectorAll('a')].map(a => ({
        href: a.href,
        text: (a.textContent||'').trim(),
        parent: a.parentElement?.tagName,
        cls: a.className.slice(0, 60),
    })).filter(l => l.href.includes('/studium/studienangebot/') && l.text.length > 3 && l.text.length < 100);
});
console.log('\nAll studienangebot links:', specific.length);
console.log('Sample:');
for (const l of specific.slice(0, 30)) {
    console.log(' ', l.text.padEnd(50), '::', l.parent, '::', l.href.slice(60));
}

await browser.close();
