// Sample a TUM detail page and dump all structured info
import { chromium } from 'playwright';

const SAMPLES = [
    'https://www.tum.de/studium/studienangebot/detail/informatik-master-of-science-msc',
    'https://www.tum.de/studium/studienangebot/detail/informatik-bachelor-of-science-bsc',
    'https://www.tum.de/studium/studienangebot/detail/ai-in-society',
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'de-DE' });
const page = await ctx.newPage();

for (const url of SAMPLES) {
    console.log('\n======================================================');
    console.log('URL:', url);
    console.log('======================================================');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);

    // Get metadata: dt/dd pairs, definition lists are common on TUM pages
    const data = await page.evaluate(() => {
        const out = { keyFacts: [], sections: [], applyLinks: [] };

        // 1. dt/dd (definition list)
        const dts = document.querySelectorAll('dt');
        for (const dt of dts) {
            const dd = dt.nextElementSibling;
            if (dd && dd.tagName === 'DD') {
                out.keyFacts.push({
                    label: (dt.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
                    value: (dd.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 300),
                });
            }
        }

        // 2. section headings + first paragraph
        const heads = document.querySelectorAll('h2, h3');
        for (const h of heads) {
            const label = (h.textContent || '').trim();
            if (label.length < 3 || label.length > 100) continue;
            let sib = h.nextElementSibling;
            let content = '';
            while (sib && !/^H[123]$/.test(sib.tagName) && content.length < 500) {
                content += ' ' + (sib.textContent || '');
                sib = sib.nextElementSibling;
            }
            out.sections.push({
                heading: label,
                sample: content.trim().replace(/\s+/g, ' ').slice(0, 400),
            });
        }

        // 3. Application / apply links
        const applyKW = /bewerb|apply|antrag|zulassung/i;
        const links = document.querySelectorAll('a[href]');
        for (const a of links) {
            const t = (a.textContent || '').trim();
            const h = a.href;
            if (applyKW.test(t) || applyKW.test(h)) {
                out.applyLinks.push({ text: t.slice(0, 80), href: h });
            }
        }

        return out;
    });

    console.log('\n--- Key Facts (dt/dd) ---');
    for (const kf of data.keyFacts.slice(0, 20)) {
        console.log(`  ${kf.label.padEnd(35)} | ${kf.value.slice(0, 100)}`);
    }

    console.log('\n--- Sections (h2/h3) ---');
    for (const s of data.sections.slice(0, 15)) {
        console.log(`  [${s.heading}]`);
        console.log(`    ${s.sample.slice(0, 200)}`);
    }

    console.log('\n--- Apply-related links ---');
    const seen = new Set();
    for (const l of data.applyLinks) {
        if (seen.has(l.href)) continue;
        seen.add(l.href);
        console.log(`  ${l.text.padEnd(40)} → ${l.href.slice(0, 100)}`);
    }
}

await browser.close();
