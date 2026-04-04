const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('https://www.welcometothejungle.com/fr/jobs?query=data+scientist&page=1', {waitUntil: 'networkidle2', timeout: 30000});
  await new Promise(r => setTimeout(r, 3000));
  console.log('URL:', page.url());
  console.log('Titre:', await page.title());
  const jobs = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/jobs/"]'));
    return links.slice(0,5).map(a => ({title: a.textContent.trim().slice(0,80), url: a.href}));
  });
  console.log('Jobs:', JSON.stringify(jobs));
  await browser.close();
})();