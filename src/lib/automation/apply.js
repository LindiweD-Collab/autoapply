import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { generateCoverLetter, generateScreeningAnswers } from '../ai/groq.js';
import 'dotenv/config';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Human-like helpers ───────────────────────────────────────────────────────
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

async function humanDelay(min = 800, max = 2500) {
  await new Promise(r => setTimeout(r, randomBetween(min, max)));
}

async function humanType(page, selector, text) {
  await page.click(selector);
  await humanDelay(300, 700);
  for (const char of text) {
    await page.keyboard.type(char, { delay: randomBetween(40, 120) });
  }
}

async function humanScroll(page) {
  await page.mouse.move(randomBetween(100, 600), randomBetween(200, 500));
  await page.evaluate(() => {
    window.scrollBy(0, Math.random() * 300 + 100);
  });
  await humanDelay(500, 1200);
}

// ─── Save screenshot to Supabase Storage ─────────────────────────────────────
async function saveScreenshot(page, applicationId) {
  try {
    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    const filename = `screenshots/${applicationId}_${Date.now()}.png`;

    const { data, error } = await supabase.storage
      .from('application-proofs')
      .upload(filename, screenshot, { contentType: 'image/png' });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('application-proofs')
      .getPublicUrl(filename);

    return urlData.publicUrl;
  } catch (err) {
    console.error('[Screenshot] Failed to save:', err.message);
    return null;
  }
}

// ─── Update application status in DB ─────────────────────────────────────────
async function updateApplication(id, updates) {
  const { error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', id);
  if (error) console.error('[DB] Update error:', error.message);
}

// ─── Source-specific apply handlers ──────────────────────────────────────────

async function applyOnCareers24(page, job, profile, coverLetter) {
  await page.goto(job.url, { waitUntil: 'networkidle', timeout: 30000 });
  await humanScroll(page);
  await humanDelay(1500, 3000);

  // Click apply button
  const applyBtn = await page.$('button:has-text("Apply"), a:has-text("Apply Now"), .apply-btn');
  if (!applyBtn) throw new Error('Apply button not found');
  await applyBtn.click();
  await humanDelay(1000, 2000);

  // Upload CV if field exists
  const fileInput = await page.$('input[type="file"]');
  if (fileInput && profile.cv_local_path) {
    await fileInput.setInputFiles(profile.cv_local_path);
    await humanDelay(1500, 3000);
  }

  // Cover letter
  const coverLetterField = await page.$('textarea[name*="cover"], textarea[placeholder*="cover"], #coverLetter');
  if (coverLetterField && coverLetter) {
    await humanType(page, 'textarea[name*="cover"], textarea[placeholder*="cover"], #coverLetter', coverLetter);
    await humanDelay(500, 1000);
  }

  // Submit
  const submitBtn = await page.$('button[type="submit"], button:has-text("Submit"), button:has-text("Send Application")');
  if (submitBtn) {
    await humanScroll(page);
    await humanDelay(800, 1500);
    await submitBtn.click();
    await humanDelay(2000, 4000);
  }
}

async function applyOnPNet(page, job, profile, coverLetter) {
  await page.goto(job.url, { waitUntil: 'networkidle', timeout: 30000 });
  await humanScroll(page);
  await humanDelay(2000, 4000);

  const applyBtn = await page.$('.apply-button, button:has-text("Apply"), a:has-text("Apply")');
  if (!applyBtn) throw new Error('Apply button not found');
  await applyBtn.click();
  await humanDelay(1000, 2500);

  const fileInput = await page.$('input[type="file"]');
  if (fileInput && profile.cv_local_path) {
    await fileInput.setInputFiles(profile.cv_local_path);
    await humanDelay(2000, 4000);
  }

  const coverField = await page.$('textarea[name*="cover"], #cover-letter, .cover-letter-input');
  if (coverField && coverLetter) {
    await humanType(page, 'textarea[name*="cover"], #cover-letter, .cover-letter-input', coverLetter);
  }

  const submitBtn = await page.$('button[type="submit"], .submit-application');
  if (submitBtn) {
    await humanDelay(1000, 2000);
    await submitBtn.click();
    await humanDelay(3000, 5000);
  }
}

async function applyOnLinkedIn(page, job, profile) {
  // LinkedIn Easy Apply flow
  await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await humanDelay(2000, 4000);
  await humanScroll(page);

  const easyApplyBtn = await page.$('.jobs-apply-button, button:has-text("Easy Apply")');
  if (!easyApplyBtn) throw new Error('Easy Apply button not found');
  await easyApplyBtn.click();
  await humanDelay(1500, 3000);

  // Handle multi-step form (up to 5 steps)
  for (let step = 0; step < 5; step++) {
    await humanDelay(1000, 2000);

    // Fill phone if asked
    const phoneInput = await page.$('input[id*="phone"], input[name*="phone"]');
    if (phoneInput) {
      const val = await phoneInput.inputValue();
      if (!val && profile.phone) await humanType(page, 'input[id*="phone"], input[name*="phone"]', profile.phone);
    }

    // Answer Yes/No questions (default to Yes for most screening)
    const radios = await page.$$('input[type="radio"][value="Yes"], input[type="radio"][value="true"]');
    for (const radio of radios.slice(0, 3)) {
      await radio.check().catch(() => {});
      await humanDelay(200, 500);
    }

    // Fill numeric inputs (years of experience etc.)
    const numberInputs = await page.$$('input[type="number"]');
    for (const input of numberInputs) {
      const label = await input.evaluate(el => {
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        return lbl?.textContent || '';
      });
      if (label.toLowerCase().includes('experience') || label.toLowerCase().includes('years')) {
        await input.fill(String(profile.years_experience || 3));
        await humanDelay(200, 400);
      }
    }

    // Next or Submit
    const nextBtn = await page.$('button:has-text("Next"), button:has-text("Continue"), button:has-text("Review")');
    const submitBtn = await page.$('button:has-text("Submit application")');

    if (submitBtn) {
      await humanDelay(1000, 2000);
      await submitBtn.click();
      await humanDelay(2000, 4000);
      break;
    } else if (nextBtn) {
      await nextBtn.click();
    } else {
      break;
    }
  }
}

// ─── Main apply function ──────────────────────────────────────────────────────
export async function applyToJob(application, job, profile) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-web-security',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-ZA',
    timezoneId: 'Africa/Johannesburg',
    // Mask automation
    extraHTTPHeaders: { 'Accept-Language': 'en-ZA,en;q=0.9' },
  });

  // Remove webdriver property (basic stealth)
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
  });

  const page = await context.newPage();
  let screenshotUrl = null;

  try {
    await updateApplication(application.id, { status: 'applying' });

    // Generate cover letter with Groq
    const coverLetter = await generateCoverLetter(profile, job).catch(() => null);

    // Run the right handler
    switch (job.source) {
      case 'careers24': await applyOnCareers24(page, job, profile, coverLetter); break;
      case 'pnet':      await applyOnPNet(page, job, profile, coverLetter); break;
      case 'linkedin':  await applyOnLinkedIn(page, job, profile); break;
      default: throw new Error(`Unsupported source: ${job.source}`);
    }

    // Take proof screenshot
    screenshotUrl = await saveScreenshot(page, application.id);

    await updateApplication(application.id, {
      status: 'applied',
      applied_at: new Date().toISOString(),
      proof_screenshot_url: screenshotUrl,
      error_message: null,
    });

    console.log(`✅ Applied: ${job.title} @ ${job.company} [${job.source}]`);
    return { success: true, screenshotUrl };

  } catch (err) {
    console.error(`❌ Failed: ${job.title} @ ${job.company}:`, err.message);

    // Screenshot the failure state
    screenshotUrl = await saveScreenshot(page, `${application.id}_error`);

    await updateApplication(application.id, {
      status: 'failed',
      error_message: err.message,
      proof_screenshot_url: screenshotUrl,
    });

    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

// ─── Batch runner — process pending applications ──────────────────────────────
export async function processPendingApplications(limit = 15) {
  console.log(`\n🤖 AutoApply engine starting (limit: ${limit}/run)`);

  const { data: applications, error } = await supabase
    .from('applications')
    .select(`
      *,
      jobs(*),
      profiles:user_id(*)
    `)
    .eq('status', 'pending')
    .limit(limit);

  if (error || !applications?.length) {
    console.log('No pending applications.');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0, failed = 0;

  for (const app of applications) {
    // Respect rate limits: random delay between each application
    await new Promise(r => setTimeout(r, randomBetween(30000, 90000))); // 30-90s between applies

    const result = await applyToJob(app, app.jobs, app.profiles);
    if (result.success) succeeded++; else failed++;
  }

  console.log(`\n📊 Run complete: ${succeeded} succeeded, ${failed} failed\n`);
  return { processed: applications.length, succeeded, failed };
}

// Run directly: node scripts/apply.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  processPendingApplications(10).then(r => {
    console.log('Apply run complete:', r);
    process.exit(0);
  }).catch(err => {
    console.error('Apply run failed:', err);
    process.exit(1);
  });
}
