import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

// Use dotenv when running as a standalone script
import 'dotenv/config';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-ZA,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay(min = 2000, max = 5000) {
  return sleep(Math.floor(Math.random() * (max - min) + min));
}

// ─── Careers24 Scraper ────────────────────────────────────────────────────────
async function scrapeCareers24(keywords = ['developer', 'engineer', 'cloud'], location = 'Gauteng') {
  const jobs = [];
  console.log('[Careers24] Starting scrape...');

  for (const keyword of keywords) {
    try {
      await randomDelay(3000, 7000);

      const url = `https://www.careers24.com/jobs/k-${encodeURIComponent(keyword)}/l-${encodeURIComponent(location)}/`;
      const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const $ = cheerio.load(res.data);

      $('article.job-card, .listing-item, [data-job-id]').each((_, el) => {
        const $el = $(el);
        const title = $el.find('.job-title, h2, .position').first().text().trim();
        const company = $el.find('.company-name, .company').first().text().trim();
        const loc = $el.find('.location, .job-location').first().text().trim();
        const url = $el.find('a').first().attr('href');
        const jobId = $el.attr('data-job-id') || url;
        const salary = $el.find('.salary, .remuneration').first().text().trim();

        if (title && company) {
          jobs.push({
            external_job_id: `careers24_${jobId || title.replace(/\s/g, '_')}`,
            source: 'careers24',
            title,
            company,
            location: loc || location,
            salary: salary || null,
            url: url?.startsWith('http') ? url : `https://www.careers24.com${url}`,
            description: null,
            posted_at: new Date().toISOString(),
          });
        }
      });

      console.log(`[Careers24] "${keyword}" → ${jobs.length} jobs so far`);
    } catch (err) {
      console.error(`[Careers24] Error for "${keyword}":`, err.message);
    }
  }

  return jobs;
}

// ─── PNet Scraper ─────────────────────────────────────────────────────────────
async function scrapePNet(keywords = ['developer', 'cloud', 'engineer']) {
  const jobs = [];
  console.log('[PNet] Starting scrape...');

  for (const keyword of keywords) {
    try {
      await randomDelay(3000, 6000);

      const url = `https://www.pnet.co.za/jobs/${encodeURIComponent(keyword)}/`;
      const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const $ = cheerio.load(res.data);

      $('.job-item, article[data-id], .search-result-item').each((_, el) => {
        const $el = $(el);
        const title = $el.find('.title, h2, .job-title').first().text().trim();
        const company = $el.find('.company, .employer').first().text().trim();
        const loc = $el.find('.location, .city').first().text().trim();
        const href = $el.find('a').first().attr('href');
        const jobId = $el.attr('data-id') || href;
        const salary = $el.find('.salary').first().text().trim();

        if (title && company) {
          jobs.push({
            external_job_id: `pnet_${jobId || title.replace(/\s/g, '_')}`,
            source: 'pnet',
            title,
            company,
            location: loc || 'South Africa',
            salary: salary || null,
            url: href?.startsWith('http') ? href : `https://www.pnet.co.za${href}`,
            description: null,
            posted_at: new Date().toISOString(),
          });
        }
      });

      console.log(`[PNet] "${keyword}" → ${jobs.length} jobs so far`);
    } catch (err) {
      console.error(`[PNet] Error for "${keyword}":`, err.message);
    }
  }

  return jobs;
}

// ─── LinkedIn Jobs API via public feed ────────────────────────────────────────
// Uses LinkedIn's public job search (no auth needed for basic listings)
async function scrapeLinkedIn(keywords = ['software developer', 'cloud engineer'], location = 'South Africa') {
  const jobs = [];
  console.log('[LinkedIn] Starting scrape...');

  for (const keyword of keywords) {
    try {
      await randomDelay(5000, 10000); // LinkedIn needs longer delays

      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&start=0`;
      const res = await axios.get(url, {
        headers: {
          ...HEADERS,
          'Referer': 'https://www.linkedin.com/jobs/',
        },
        timeout: 20000
      });

      const $ = cheerio.load(res.data);

      $('li').each((_, el) => {
        const $el = $(el);
        const title = $el.find('.base-search-card__title').text().trim();
        const company = $el.find('.base-search-card__subtitle').text().trim();
        const loc = $el.find('.job-search-card__location').text().trim();
        const href = $el.find('a.base-card__full-link').attr('href');
        const jobId = href?.match(/(\d+)\/?$/)?.[1];
        const postedAt = $el.find('time').attr('datetime');

        if (title && company) {
          jobs.push({
            external_job_id: `linkedin_${jobId || title.replace(/\s/g, '_')}`,
            source: 'linkedin',
            title,
            company,
            location: loc || location,
            salary: null,
            url: href || '',
            description: null,
            posted_at: postedAt ? new Date(postedAt).toISOString() : new Date().toISOString(),
          });
        }
      });

      console.log(`[LinkedIn] "${keyword}" → ${jobs.length} jobs so far`);
    } catch (err) {
      console.error(`[LinkedIn] Error for "${keyword}":`, err.message);
    }
  }

  return jobs;
}

// ─── Fetch job description for a specific job URL ─────────────────────────────
export async function fetchJobDescription(url, source) {
  try {
    await randomDelay(2000, 4000);
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(res.data);

    if (source === 'linkedin') {
      return $('.show-more-less-html__markup, .description__text').text().trim().slice(0, 5000);
    }
    if (source === 'careers24') {
      return $('.job-description, .description, [itemprop="description"]').text().trim().slice(0, 5000);
    }
    if (source === 'pnet') {
      return $('.job-description, .content, .description').text().trim().slice(0, 5000);
    }
    return $('main, article, .content').first().text().trim().slice(0, 5000);
  } catch {
    return null;
  }
}

// ─── Save jobs to Supabase (upsert, skip duplicates) ─────────────────────────
async function saveJobs(jobs) {
  if (!jobs.length) return 0;

  const { data, error } = await supabase
    .from('jobs')
    .upsert(jobs, { onConflict: 'external_job_id', ignoreDuplicates: true })
    .select('id');

  if (error) {
    console.error('[DB] Save error:', error.message);
    return 0;
  }

  return data?.length || 0;
}

// ─── Main scraper entrypoint ──────────────────────────────────────────────────
export async function runScraper(options = {}) {
  const {
    keywords = ['software developer', 'cloud engineer', 'full stack', 'backend', 'devops'],
    location = 'South Africa',
    sources = ['careers24', 'pnet', 'linkedin'],
  } = options;

  console.log(`\n🔍 TechBridge AutoApply — Scraper starting`);
  console.log(`Keywords: ${keywords.join(', ')}`);
  console.log(`Sources: ${sources.join(', ')}\n`);

  const allJobs = [];

  if (sources.includes('careers24')) {
    const jobs = await scrapeCareers24(keywords, location);
    allJobs.push(...jobs);
  }

  if (sources.includes('pnet')) {
    const jobs = await scrapePNet(keywords);
    allJobs.push(...jobs);
  }

  if (sources.includes('linkedin')) {
    const jobs = await scrapeLinkedIn(keywords, location);
    allJobs.push(...jobs);
  }

  console.log(`\n📦 Total scraped: ${allJobs.length} jobs`);

  const saved = await saveJobs(allJobs);
  console.log(`✅ Saved to Supabase: ${saved} new jobs\n`);

  return { scraped: allJobs.length, saved };
}

// Run directly: node scripts/scraper.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  runScraper().then(r => {
    console.log('Scrape complete:', r);
    process.exit(0);
  }).catch(err => {
    console.error('Scrape failed:', err);
    process.exit(1);
  });
}
