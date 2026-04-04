require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const app = express();
app.use(cors());
app.use(express.json());

// ─── CLAUDE API ───────────────────────────────────────────────────────────────
app.post('/api/v1/messages', async (req, res) => {
  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', req.body, {
      httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      }
    });
    res.json(response.data);
  } catch (err) {
    console.error('>>> Erreur Claude API:', err.message, err.response?.data);
    res.status(500).json({ error: err.message });
  }
});

// ─── FRANCE TRAVAIL TOKEN ─────────────────────────────────────────────────────
let ftToken = null;
let ftTokenExpiry = 0;

async function getFTToken() {
  if (ftToken && Date.now() < ftTokenExpiry) return ftToken;
  console.log('>>> Récupération token France Travail...');
const response = await axios.post(
  'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire',
  `grant_type=client_credentials&client_id=${process.env.FT_CLIENT_ID}&client_secret=${process.env.FT_CLIENT_SECRET}&scope=api_offresdemploiv2%20o2dsoffre`,
  { httpsAgent, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
);
  ftToken = response.data.access_token;
  ftTokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
  console.log('>>> Token OK');
  return ftToken;
}

// ─── FRANCE TRAVAIL OFFRES ────────────────────────────────────────────────────
const FT_KEYWORDS = [
  "Data Scientist", "Data Analyst", "Géomatique", "Machine Learning",
  "Data Engineer", "GIS", "SIG", "Data Manager", "Energie géospatiale",
  "Télédétection", "Remote Sensing", "IA géospatiale"
];

app.get('/api/ft/offres', async (req, res) => {
  try {
    console.log('>>> Scraping France Travail...');
    const token = await getFTToken();
    const allOffres = [];
    const seen = new Set();

    for (const keyword of FT_KEYWORDS) {
      try {
          const response = await axios.get(
            `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search`,
            {
              httpsAgent,
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
              },
              params: {
                motsCles: keyword,
                range: '0-9'
              }
            }
          );
        const offres = response.data?.resultats || [];
        console.log(`>>> ${keyword}: ${offres.length} offres`);

        for (const offre of offres) {
          if (seen.has(offre.id)) continue;
          seen.add(offre.id);

          allOffres.push({
            id: offre.id,
            title: offre.intitule || "Poste non précisé",
            company: offre.entreprise?.nom || "Entreprise confidentielle",
            location: offre.lieuTravail?.libelle || "France",
            source: "France Travail",
            url: offre.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/emploi/detail/${offre.id}`,
            date: offre.dateCreation || new Date().toISOString(),
            contract: offre.typeContratLibelle || "CDI",
            secteur: detectSecteur(offre.intitule + " " + (offre.description || "")),
            description: (offre.description || "").slice(0, 500),
            tags: extractTags(offre.intitule + " " + (offre.description || ""))
          });
        }
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.log(`>>> Erreur "${keyword}":`, e.response?.status, e.message);
      }
    }

    console.log(`>>> Total: ${allOffres.length} offres uniques`);
    res.json({ offres: allOffres, total: allOffres.length });
  } catch (err) {
    console.error('>>> Erreur France Travail:', err.message);
    res.status(500).json({ error: err.message, offres: [] });
  }
});

function detectSecteur(text) {
  const t = text.toLowerCase();
  if (t.includes('énergi') || t.includes('pétrole') || t.includes('gaz') || t.includes('renouvelable')) return 'Énergie';
  if (t.includes('santé') || t.includes('médical') || t.includes('pharma') || t.includes('clinique')) return 'Médecine/Santé';
  if (t.includes('climat') || t.includes('environnement') || t.includes('écologi')) return 'Environnement';
  if (t.includes('financ') || t.includes('banque') || t.includes('assurance')) return 'Finance';
  if (t.includes('défense') || t.includes('aéro') || t.includes('spatial')) return 'Défense';
  if (t.includes('urban') || t.includes('ville') || t.includes('territoire')) return 'Urbanisme';
  if (t.includes('agricol') || t.includes('agri')) return 'Agriculture';
  if (t.includes('transport') || t.includes('logistique')) return 'Transport';
  if (t.includes('recherche') || t.includes('ign') || t.includes('brgm')) return 'Recherche';
  return 'Autre';
}

function extractTags(text) {
  const keywords = [
    'Python', 'SQL', 'Machine Learning', 'Deep Learning', 'GIS', 'QGIS',
    'ArcGIS', 'PostGIS', 'TensorFlow', 'PyTorch', 'Pandas', 'Docker',
    'AWS', 'Azure', 'Spark', 'Géomatique', 'Télédétection', 'SIG',
    'Data Science', 'ETL', 'PowerBI', 'Git', 'Linux', 'CDMP'
  ];
  const t = text.toLowerCase();
  return keywords.filter(kw => t.includes(kw.toLowerCase())).slice(0, 6);
}

// ─── WELCOME TO THE JUNGLE ────────────────────────────────────────────────────
app.get('/api/wttj/offres', async (req, res) => {
  let browser;
  try {
    console.log('>>> Scraping WTTJ...');
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
    });

    const allOffres = [];
    const seen = new Set();
    const keywords = ['data scientist', 'data analyst', 'géomatique', 'machine learning', 'data engineer', 'GIS SIG', 'télédétection', 'energie data'];

    for (const keyword of keywords) {
      try {
        const page = await browser.newPage();
        await page.goto(
          `https://www.welcometothejungle.com/fr/jobs?query=${encodeURIComponent(keyword)}&page=1`,
          { waitUntil: 'networkidle2', timeout: 30000 }
        );
        await new Promise(r => setTimeout(r, 3000));

        const jobs = await page.evaluate(() => {
          const results = [];
          const links = Array.from(document.querySelectorAll('a[href*="/jobs/"]'));
          links.forEach(a => {
            const title = a.textContent?.trim();
            if (title && title.length > 5) {
              const card = a.closest('li, article, [class*="card"], [class*="Card"]') || a.parentElement;
              const company = card?.querySelector('[class*="company"], [class*="Company"], [class*="organization"]')?.textContent?.trim();
              const location = card?.querySelector('[class*="location"], [class*="city"]')?.textContent?.trim();
              results.push({ title, url: a.href, company: company || '', location: location || 'France' });
            }
          });
          return results.filter((j, i, arr) => arr.findIndex(x => x.url === j.url) === i).slice(0, 15);
        });

        console.log(`>>> WTTJ "${keyword}": ${jobs.length} offres`);

        for (const job of jobs) {
          if (seen.has(job.url)) continue;
          seen.add(job.url);
          allOffres.push({
            id: `wttj_${Buffer.from(job.url).toString('base64').slice(0, 20)}`,
            title: job.title,
            company: job.company || "Entreprise",
            location: job.location || "France",
            source: "Welcome to the Jungle",
            url: job.url,
            date: new Date().toISOString(),
            contract: "CDI",
            secteur: detectSecteur(job.title),
            description: job.title,
            tags: extractTags(job.title)
          });
        }
        await page.close();
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.log(`>>> Erreur WTTJ "${keyword}":`, e.message);
      }
    }

    console.log(`>>> Total WTTJ: ${allOffres.length} offres`);
    res.json({ offres: allOffres, total: allOffres.length });
  } catch (err) {
    res.status(500).json({ error: err.message, offres: [] });
  } finally {
    if (browser) await browser.close();
  }
});

// ─── JOBTEASER ────────────────────────────────────────────────────────────────
app.get('/api/jobteaser/offres', async (req, res) => {
  const { email, password, school } = req.query;
  if (!email || !password) return res.status(400).json({ error: "email et password requis", offres: [] });

  let browser;
  try {
    console.log(`>>> Scraping JobTeaser ${school}...`);
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const capturedJobs = [];
    await page.setRequestInterception(true);
    page.on('request', req => req.continue());
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('/api/') && url.includes('job') && response.status() === 200) {
        try {
          const data = await response.json();
          const jobs = data?.jobs || data?.results || data?.data || [];
          if (Array.isArray(jobs) && jobs.length > 0) capturedJobs.push(...jobs);
        } catch {}
      }
    });

    const loginUrl = school === 'ensg'
      ? 'https://ensg.jobteaser.com/fr/users/sign_in'
      : 'https://ifp-school.jobteaser.com/fr/users/sign_in';

    const jobsUrl = school === 'ensg'
      ? 'https://ensg.jobteaser.com/fr/job-offers?page=1'
      : 'https://ifp-school.jobteaser.com/fr/job-offers?page=1';

    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).map(i => ({type: i.type, name: i.name, id: i.id, placeholder: i.placeholder}));
    });
    console.log('>>> Inputs trouvés:', JSON.stringify(inputs));

    const emailInput = await page.$('input[type="email"], input[name*="email"], input[id*="email"], input[placeholder*="mail"]');
    const passInput = await page.$('input[type="password"]');

    if (!emailInput) throw new Error('Champ email introuvable');
    await emailInput.type(email, { delay: 50 });
    await passInput.type(password, { delay: 50 });

    const submitBtn = await page.$('input[type="submit"], button[type="submit"]');
    if (submitBtn) await submitBtn.click();
  await new Promise(r => setTimeout(r, 4000));
  console.log('>>> URL après login ENSG:', page.url());

    await page.goto(jobsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // Fermer popups cookies/CGU
    try {
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent?.trim(), btn);
        if (text && (
          text.includes('Good for me') || 
          text.includes('Continue without') || 
          text.includes('Accepter') ||
          text.includes('accepter') ||
          text.includes('J\'accepte') ||
          text.includes('Continuer')
        )) {
          await btn.click();
          console.log('>>> Popup fermée:', text);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    } catch(e) { console.log('>>> Pas de popup:', e.message); }

    await new Promise(r => setTimeout(r, 3000));

    console.log('>>> URL page offres:', page.url());
    const pageTitle = await page.title();
    console.log('>>> Titre page:', pageTitle);
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500));
    console.log('>>> Body text:', bodyText);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 2000));

    domJobs = await page.evaluate(() => {
    const results = [];
    // Essayer plusieurs sélecteurs
    const allLinks = Array.from(document.querySelectorAll('a'));
    allLinks.forEach(el => {
      const href = el.href || '';
      const title = el.textContent?.trim();
      if (
        title && title.length > 10 && title.length < 200 &&
        (href.includes('job-offer') || href.includes('job_offer') || href.includes('/jobs/') || href.includes('offre'))
      ) {
        results.push({ title, url: href, company: 'Entreprise' });
      }
    });
    return results.slice(0, 50);
  });
    console.log(`>>> DOM jobs: ${domJobs.length}`, JSON.stringify(domJobs.slice(0,3)));

    const jobsToProcess = capturedJobs.length > 0
      ? capturedJobs.slice(0, 30).map((job, i) => ({
          id: `jt_${i}_${Date.now()}`,
          title: job.title || job.name || "Poste",
          company: job.organization?.name || job.company?.name || "Entreprise",
          location: job.office?.city || job.location?.city || "France",
          source: school === 'ensg' ? 'JobTeaser ENSG' : 'JobTeaser IFP',
          url: job.url || "",
          date: job.published_at || new Date().toISOString(),
          contract: job.contract_type?.name || "Stage",
          secteur: detectSecteur((job.title || job.name || "") + " " + (job.description || "")),
          description: (job.description || job.title || "").slice(0, 500),
          tags: extractTags((job.title || job.name || "") + " " + (job.description || ""))
        }))
      : domJobs.filter(j =>
          j.title && j.title.length > 10 &&
          !['Mes offres sauvegardées', 'Offres', 'Entreprises', 'Événements', 'Accueil'].includes(j.title)
        ).map((job, i) => ({
          id: `jt_dom_${i}_${Date.now()}`,
          title: job.title,
          company: job.company || "Entreprise",
          location: "France",
          source: school === 'ensg' ? 'JobTeaser ENSG' : 'JobTeaser IFP',
          url: job.url || "",
          date: new Date().toISOString(),
          contract: "Stage",
          secteur: detectSecteur(job.title),
          description: job.title,
          tags: extractTags(job.title)
        }));

    console.log(`>>> JobTeaser ${school}: ${jobsToProcess.length} offres`);
    res.json({ offres: jobsToProcess, total: jobsToProcess.length });

  } catch (err) {
    console.error('>>> Erreur JobTeaser:', err.message);
    res.status(500).json({ error: err.message, offres: [] });
  } finally {
    if (browser) await browser.close();
  }
});

// ─── INDEED ───────────────────────────────────────────────────────────────────
const INDEED_KEYWORDS = [
  "Data Scientist", "Data Analyst", "Géomatique", "Machine Learning",
  "Data Engineer", "GIS", "SIG", "Télédétection"
];

app.get('/api/indeed/offres', async (req, res) => {
  let browser;
  try {
    console.log('>>> Scraping Indeed...');
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
    });

    const allOffres = [];
    const seen = new Set();

    for (const keyword of INDEED_KEYWORDS) {
      try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        const url = `https://fr.indeed.com/jobs?q=${encodeURIComponent(keyword)}&l=France&sort=date`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        const jobs = await page.evaluate(() => {
          const cards = document.querySelectorAll('[class*="job_seen_beacon"], [class*="jobCard"], .result, [data-jk]');
          return Array.from(cards).slice(0, 10).map(card => ({
            title: card.querySelector('[class*="jobTitle"], h2')?.textContent?.trim(),
            company: card.querySelector('[class*="companyName"], [data-testid="company-name"]')?.textContent?.trim(),
            location: card.querySelector('[class*="companyLocation"], [data-testid="text-location"]')?.textContent?.trim(),
            id: card.getAttribute('data-jk') || Math.random().toString(36).slice(2),
            url: card.querySelector('a')?.href
          })).filter(j => j.title);
        });

        console.log(`>>> Indeed "${keyword}": ${jobs.length} offres`);

        for (const job of jobs) {
          if (seen.has(job.id)) continue;
          seen.add(job.id);
          allOffres.push({
            id: `indeed_${job.id}`,
            title: job.title || "Poste",
            company: job.company || "Entreprise",
            location: job.location || "France",
            source: "Indeed",
            url: job.url || `https://fr.indeed.com`,
            date: new Date().toISOString(),
            contract: "CDI",
            secteur: detectSecteur(job.title || ""),
            description: job.title || "",
            tags: extractTags(job.title || "")
          });
        }
        await page.close();
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.log(`>>> Erreur Indeed "${keyword}":`, e.message);
      }
    }

    console.log(`>>> Total Indeed: ${allOffres.length} offres`);
    res.json({ offres: allOffres, total: allOffres.length });
  } catch (err) {
    console.error('>>> Erreur Indeed:', err.message);
    res.status(500).json({ error: err.message, offres: [] });
  } finally {
    if (browser) await browser.close();
  }
});

// ─── APEC ─────────────────────────────────────────────────────────────────────
app.get('/api/apec/offres', async (req, res) => {
  let browser;
  try {
    console.log('>>> Scraping APEC...');
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
    });

    const allOffres = [];
    const seen = new Set();
    const keywords = ['data scientist', 'géomatique', 'machine learning', 'data engineer', 'GIS', 'télédétection', 'data analyst', 'SIG energie'];

    for (const keyword of keywords) {
      try {
        const page = await browser.newPage();
        await page.goto(
          `https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=${encodeURIComponent(keyword)}&typesContrat=102088,102091`,
          { waitUntil: 'networkidle2', timeout: 30000 }
        );
        await new Promise(r => setTimeout(r, 3000));

        const jobs = await page.evaluate(() => {
          const results = [];
          const cards = document.querySelectorAll('[class*="card"], article, [class*="offer"], li[class*="item"]');
          cards.forEach(card => {
            const title = card.querySelector('h2, h3, [class*="title"]')?.textContent?.trim();
            const company = card.querySelector('[class*="company"], [class*="employer"]')?.textContent?.trim();
            const location = card.querySelector('[class*="location"], [class*="lieu"]')?.textContent?.trim();
            const link = card.querySelector('a')?.href;
            if (title && title.length > 5) results.push({ title, company: company || '', location: location || 'France', url: link || '' });
          });
          return results.slice(0, 15);
        });

        console.log(`>>> APEC "${keyword}": ${jobs.length} offres`);

        for (const job of jobs) {
          if (seen.has(job.url)) continue;
          seen.add(job.url);
          allOffres.push({
            id: `apec_${Buffer.from(job.url || job.title).toString('base64').slice(0, 20)}`,
            title: job.title,
            company: job.company || "Entreprise",
            location: job.location || "France",
            source: "APEC",
            url: job.url,
            date: new Date().toISOString(),
            contract: "CDI",
            secteur: detectSecteur(job.title),
            description: job.title,
            tags: extractTags(job.title)
          });
        }
        await page.close();
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.log(`>>> Erreur APEC "${keyword}":`, e.message);
      }
    }

    console.log(`>>> Total APEC: ${allOffres.length} offres`);
    res.json({ offres: allOffres, total: allOffres.length });
  } catch (err) {
    res.status(500).json({ error: err.message, offres: [] });
  } finally {
    if (browser) await browser.close();
  }
});


// ─── LATEX TO PDF ─────────────────────────────────────────────────────────────
app.post('/api/latex/compile', async (req, res) => {
  try {
    const { latex } = req.body;
    console.log('>>> Compilation LaTeX...');

    const response = await axios.post(
      'https://latex.ytotech.com/builds/sync',
      {
        compiler: "pdflatex",
        resources: [{ main: true, content: latex }]
      },
      {
        httpsAgent,
        headers: { 'Content-Type': 'application/json' },
        responseType: 'arraybuffer',
        timeout: 60000
      }
    );

    console.log('>>> PDF généré, taille:', response.data.byteLength);
    res.set('Content-Type', 'application/pdf');
    res.send(Buffer.from(response.data));
  } catch (err) {
    console.error('>>> Erreur LaTeX:', err.message, err.response?.status);
    res.status(500).json({ error: err.message });
  }
});

// ─── GEOCODE ──────────────────────────────────────────────────────────────────
app.get('/api/geocode', async (req, res) => {
  try {
    const { address } = req.query;
    const query = encodeURIComponent(address + ', France');
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      {
        httpsAgent,
        headers: { 'User-Agent': 'JobHunterAI/1.0' }
      }
    );
    const data = response.data;
    if (data[0]) {
      res.json({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
    } else {
      res.json({ lat: null, lng: null });
    }
  } catch (err) {
    console.error('>>> Erreur geocode:', err.message);
    res.json({ lat: null, lng: null });
  }
});

app.listen(3001, () => console.log('Proxy running on http://localhost:3001'));

