import { requireAuth, getAdminClient } from '../../../lib/supabase.js';
import { parseCVWithAI } from '../../../lib/ai/groq.js';
import pdfParse from 'pdf-parse';

export async function POST({ request }) {
  let user;
  try {
    user = await requireAuth(request);
  } catch {
    return new Response(null, { status: 302, headers: { Location: '/auth/login' } });
  }

  const form = await request.formData();
  const file = form.get('cv');

  if (!file || !(file instanceof File)) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard/profile?error=No+file+uploaded' } });
  }

  if (file.size > 5 * 1024 * 1024) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard/profile?error=File+too+large+(max+5MB)' } });
  }

  try {
    // Extract text from PDF
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const cvText = parsed.text;

    if (!cvText || cvText.trim().length < 100) {
      throw new Error('Could not extract text from PDF. Make sure it is not scanned/image-only.');
    }

    // Parse with Groq AI
    const aiProfile = await parseCVWithAI(cvText);

    // Upload PDF to Supabase Storage
    const admin = getAdminClient();
    const filename = `cvs/${user.id}_${Date.now()}.pdf`;
    const { data: uploadData } = await admin.storage
      .from('cv-uploads')
      .upload(filename, buffer, { contentType: 'application/pdf', upsert: true });

    const { data: urlData } = admin.storage.from('cv-uploads').getPublicUrl(filename);

    // Upsert profile
    const { error } = await admin.from('profiles').upsert({
      user_id: user.id,
      full_name: aiProfile.full_name,
      phone: aiProfile.phone,
      location: aiProfile.location,
      current_title: aiProfile.current_title,
      years_experience: aiProfile.years_experience,
      work_type: aiProfile.work_type_preference,
      salary_min: aiProfile.salary_min,
      salary_max: aiProfile.salary_max,
      skills_array: aiProfile.skills,
      job_titles_sought: aiProfile.job_titles_sought,
      cv_text: cvText.slice(0, 10000),
      cv_url: urlData.publicUrl,
    }, { onConflict: 'user_id' });

    if (error) throw error;

    return new Response(null, { status: 302, headers: { Location: '/dashboard/profile?success=1' } });
  } catch (err) {
    console.error('[CV Upload]', err.message);
    return new Response(null, {
      status: 302,
      headers: { Location: `/dashboard/profile?error=${encodeURIComponent(err.message)}` },
    });
  }
}
