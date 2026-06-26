import { createClient } from '@supabase/supabase-js';
import { scoreJobMatch } from '../ai/groq.js';
import 'dotenv/config';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MATCH_THRESHOLD = 80; // Only create applications for jobs above this score

export async function matchJobsForUser(userId) {
  // Fetch user profile
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (profileErr || !profile) throw new Error(`Profile not found for user ${userId}`);

  // Check subscription is active
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (!sub) throw new Error('No active subscription');

  const remainingApplies = sub.applies_limit - sub.applies_used;
  if (remainingApplies <= 0) throw new Error('Monthly apply limit reached');

  // Fetch jobs not yet applied to by this user
  const { data: existingApps } = await supabase
    .from('applications')
    .select('job_id')
    .eq('user_id', userId);

  const appliedJobIds = new Set((existingApps || []).map(a => a.job_id));

  // Get recent jobs (last 7 days)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: jobs, error: jobsErr } = await supabase
    .from('jobs')
    .select('*')
    .gte('scraped_at', since)
    .not('id', 'in', `(${[...appliedJobIds].join(',') || 'null'})`);

  if (jobsErr) throw new Error(jobsErr.message);
  if (!jobs?.length) return { matched: 0, created: 0 };

  console.log(`[Matching] Scoring ${jobs.length} jobs for ${profile.full_name}...`);

  let created = 0;
  const toCreate = [];

  for (const job of jobs) {
    try {
      const result = await scoreJobMatch(profile, job.description || `${job.title} at ${job.company} in ${job.location}`);

      if (result.score >= MATCH_THRESHOLD) {
        toCreate.push({
          user_id: userId,
          job_id: job.id,
          match_score: result.score,
          match_reasons: result.reasons,
          match_missing: result.missing,
          status: profile.auto_apply_enabled ? 'pending' : 'matched',
        });
      }
    } catch (err) {
      console.error(`[Matching] Score error for job ${job.id}:`, err.message);
    }
  }

  if (toCreate.length) {
    // Only create up to remaining applies limit
    const batch = toCreate.slice(0, remainingApplies);
    const { error } = await supabase.from('applications').insert(batch);
    if (!error) created = batch.length;
  }

  console.log(`[Matching] Created ${created} new applications for ${profile.full_name}`);
  return { matched: toCreate.length, created };
}

// Run matching for ALL active subscribers
export async function matchJobsForAllUsers() {
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('status', 'active');

  if (!subs?.length) return;

  for (const sub of subs) {
    try {
      const result = await matchJobsForUser(sub.user_id);
      console.log(`[Matching] ${sub.user_id}: ${result.created} new matches`);
    } catch (err) {
      console.error(`[Matching] Error for ${sub.user_id}:`, err.message);
    }
  }
}
