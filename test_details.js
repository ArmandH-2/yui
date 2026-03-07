const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Catch all console logs and errors
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error(`Browser ERROR: ${msg.text()}`);
        }
    });

    page.on('pageerror', error => {
        console.error(`Browser PageError: ${error.message}`);
    });

    await page.goto('http://localhost:3000/#tracker');

    await page.waitForSelector('.roster-row', { timeout: 10000 });

    try {
        console.log('Clicking the first Details button...');
        await page.click('.roster-row button:has-text("Details")');

        await page.waitForTimeout(1500);

        // Click the first graph to test expansion
        console.log('Clicking the first graph to expand it...');
        await page.evaluate(() => {
            const firstGraph = document.querySelector('[onclick="TrackerPage.expandGraph(this)"]');
            if (firstGraph) firstGraph.click();
        });

        await page.waitForTimeout(1500);

        await page.screenshot({ path: 'c:\\Users\\B2\\.gemini\\antigravity\\brain\\e83651f5-8882-424d-818b-62ae4939144c\\expanded_graph.png' });
        console.log('Screenshot saved.');

    } catch (err) {
        console.error('Test script error:', err);
    }

    await browser.close();
})();
