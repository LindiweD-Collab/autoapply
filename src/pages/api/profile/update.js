import { requireAuth, getAdminClient } from '../../../lib/supabase.js';

export async function POST({ request }) {
  let user;
  try {
    user = await requireAuth(request);
  } catch {
    return new Response(null, { status: 302, headers: { Location: '/auth/login' } });
  }

  const form = await request.formData();

  const skillsRaw = form.get('skills')?.toString() || '';
  const titlesRaw = form.get('job_titles')?.toString() || '';
  const boards = form.getAll('boards').map(b => b.toString());

  const profileData = {
    user_id: user.id,
    full_name: form.get('full_name')?.toString().trim(),
    phone: form.get('phone')?.toString().trim() || null,
    location: form.get('location')?.toString().trim(),
    current_title: form.get('current_title')?.toString().trim() || null,
    years_experience: parseInt(form.get('years_experience')?.toString() || '0') || null,
    work_type: form.get('work_type')?.toString(),
    salary_min: parseInt(form.get('salary_min')?.toString() || '0') || null,
    salary_max: parseInt(form.get('salary_max')?.toString() || '0') || null,
    skills_array: skillsRaw ? skillsRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
    job_titles_sought: titlesRaw ? titlesRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
    job_boards: boards.length ? boards : ['careers24', 'pnet', 'linkedin'],
    auto_apply_enabled: form.get('auto_apply_enabled') === 'true',
  };

  const admin = getAdminClient();
  const { error } = await admin.from('profiles').upsert(profileData, { onConflict: 'user_id' });

  if (error) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/dashboard/profile?error=${encodeURIComponent(error.message)}` },
    });
  }

  return new Response(null, { status: 302, headers: { Location: '/dashboard/profile?success=1' } });
}
