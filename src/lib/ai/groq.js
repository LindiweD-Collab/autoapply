import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: import.meta.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

// Parse raw CV text → structured profile fields
export async function parseCVWithAI(cvText) {
  const chat = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: `You are a CV parser. Extract structured data from the CV text provided. 
Return ONLY valid JSON, no markdown, no explanation. Schema:
{
  "full_name": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "years_experience": number,
  "current_title": "string",
  "skills": ["string"],
  "job_titles_sought": ["string"],
  "work_type_preference": "remote|hybrid|on-site|any",
  "salary_min": number or null,
  "salary_max": number or null,
  "summary": "2-sentence professional summary"
}`
      },
      { role: 'user', content: `Parse this CV:\n\n${cvText.slice(0, 6000)}` }
    ]
  });

  const raw = chat.choices[0].message.content.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Groq returned invalid JSON for CV parse');
  }
}

// Score a job description against a candidate profile (0-100)
export async function scoreJobMatch(profile, jobDescription) {
  const chat = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: `You are a recruitment AI. Score how well a candidate matches a job.
Return ONLY valid JSON: { "score": number (0-100), "reasons": ["string"], "missing": ["string"] }`
      },
      {
        role: 'user',
        content: `Candidate skills: ${profile.skills?.join(', ')}
Experience: ${profile.years_experience} years
Current title: ${profile.current_title}
Location: ${profile.location}
Work type: ${profile.work_type_preference}

Job description:
${jobDescription.slice(0, 3000)}`
      }
    ]
  });

  const raw = chat.choices[0].message.content.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { score: 0, reasons: [], missing: [] };
  }
}

// Generate a tailored cover letter
export async function generateCoverLetter(profile, job) {
  const chat = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: `Write a concise, professional cover letter for a South African job applicant. 
3 paragraphs max. No "Dear Sir/Madam". Start with the candidate's value proposition. 
No clichés. Sound human and direct.`
      },
      {
        role: 'user',
        content: `Candidate: ${profile.full_name}
Title: ${profile.current_title}
Skills: ${profile.skills?.join(', ')}
Experience: ${profile.years_experience} years

Applying for: ${job.title} at ${job.company}
Job description: ${job.description?.slice(0, 2000)}`
      }
    ]
  });

  return chat.choices[0].message.content.trim();
}

// Generate answers to common application screening questions
export async function generateScreeningAnswers(profile, questions) {
  const chat = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content: `You are helping a job applicant answer screening questions. 
Return ONLY valid JSON: { "answers": { "question": "answer" } }
Answers should be honest, concise, and professional. Max 2 sentences each.`
      },
      {
        role: 'user',
        content: `Candidate profile:
${JSON.stringify(profile, null, 2)}

Questions to answer:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
      }
    ]
  });

  const raw = chat.choices[0].message.content.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { answers: {} };
  }
}
