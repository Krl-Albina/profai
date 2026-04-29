/*
 * AI helpers — uses Google Gemini REST API (v1beta).
 */

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export type ResumeTone = 'neutral' | 'polite' | 'bold';

export interface StructuredResume {
  fullName: string;
  title: string;
  city: string;
  email: string;
  phone: string;
  summary: string;
  skills: string[];
  strengths: string[];
  achievements: string[];
  tools: string[];
  experience: string;
  education: string;
  languages: string[];
  projects: string[];
}

export interface TargetJobContext {
  title: string;
  company: string;
  requirements: string[];
  skills: string[];
  description?: string;
}

type RawAnswer = Record<string, unknown>;

function getGeminiConfig() {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
  const apiKey = (env.VITE_GEMINI_API_KEY || '').trim();
  const model = (env.VITE_GEMINI_MODEL || 'gemini-1.5-flash').trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return { apiKey, model, endpoint };
}

function sanitizeInterviewText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function callGemini(prompt: string, systemPrompt?: string, maxOutputTokens = 2048): Promise<string> {
  try {
    const { apiKey, endpoint } = getGeminiConfig();

    if (!apiKey) {
      console.warn('VITE_GEMINI_API_KEY not set, using fallback');
      return getFallbackResponse(prompt);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const requestBody: {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      systemInstruction?: { parts: Array<{ text: string }> };
      generationConfig: { temperature: number; maxOutputTokens: number };
    } = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens },
    };

    if (systemPrompt) {
      requestBody.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'no body');
      console.error('Gemini API Error:', response.status, errorText);
      throw new Error(`Gemini HTTP ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return content || getFallbackResponse(prompt);
  } catch (error) {
    console.error('Gemini call failed:', error instanceof Error ? error.message : 'Unknown error');
    return getFallbackResponse(prompt);
  }
}

export async function matchJobsWithProfile(
  profile: Record<string, unknown>,
  jobsList: Array<Record<string, unknown>>
): Promise<Array<{ jobId: string; matchPercent: number; explanation: string }>> {
  const systemPrompt = `Ты — AI-система для сопоставления кандидатов с вакансиями на платформе Prof.ai.
Твоя задача — проанализировать профиль кандидата и список вакансий, и для каждой вакансии определить процент совпадения.
Отвечай СТРОГО в формате JSON массива: [{"jobId": "1", "matchPercent": 85, "explanation": "Краткое объяснение на русском"}]
Процент от 0 до 100. Учитывай навыки, опыт, интересы, образование.`;

  const prompt = `Профиль кандидата: ${JSON.stringify(profile)}

Вакансии: ${JSON.stringify(jobsList.map(j => ({ id: j.id, title: j.title, skills: j.skills, requirements: j.requirements, experience: j.experience })))}

Верни JSON массив с matchPercent и explanation для каждой вакансии. Только JSON, без markdown.`;

  const result = await callGemini(prompt, systemPrompt);

  try {
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as Array<{ jobId: string; matchPercent: number; explanation: string }>;

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return buildLocalMatches(profile, jobsList);
    }

    return parsed;
  } catch {
    return buildLocalMatches(profile, jobsList);
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function buildLocalMatches(
  profile: Record<string, unknown>,
  jobsList: Array<Record<string, unknown>>
): Array<{ jobId: string; matchPercent: number; explanation: string }> {
  const profileSkills = toStringArray(profile.skills).map((s) => s.toLowerCase());
  const profileInterests = toStringArray(profile.interests).map((s) => s.toLowerCase());
  const desiredRole = String(profile.desiredRole ?? '').toLowerCase();

  return jobsList.map((job) => {
    const jobSkills = toStringArray(job.skills).map((s) => s.toLowerCase());
    const jobTitle = String(job.title ?? '').toLowerCase();
    const jobCategory = String(job.category ?? '').toLowerCase();

    const skillMatchCount = jobSkills.filter((skill) =>
      profileSkills.some((owned) => owned.includes(skill) || skill.includes(owned))
    ).length;

    const skillRatio = jobSkills.length > 0 ? skillMatchCount / jobSkills.length : 0;
    const titleBonus = desiredRole && jobTitle.includes(desiredRole) ? 0.2 : 0;
    const interestBonus = profileInterests.some((interest) => jobCategory.includes(interest) || jobTitle.includes(interest)) ? 0.1 : 0;

    const rawScore = skillRatio * 0.7 + titleBonus + interestBonus;
    const matchPercent = Math.max(35, Math.min(95, Math.round(rawScore * 100)));

    return {
      jobId: String(job.id),
      matchPercent,
      explanation: skillMatchCount > 0
        ? `Совпадение по ключевым навыкам: ${skillMatchCount} из ${jobSkills.length || 1}.`
        : 'Базовая рекомендация на основе интересов и цели кандидата.',
    };
  });
}

export async function generateResume(profile: Record<string, unknown>, answers: Array<Record<string, string>>): Promise<string> {
  const systemPrompt = `Ты — профессиональный составитель резюме. Создай красивое, структурированное резюме на русском языке в формате Markdown.
Используй данные из профиля и ответов на вопросы онбординга. Резюме должно быть готово к отправке работодателю.
Структура: ФИО, Контакты, О себе, Навыки, Опыт работы, Образование, Языки, Проекты.`;

  const prompt = `Данные профиля: ${JSON.stringify(profile)}
Ответы на вопросы: ${JSON.stringify(answers)}

Создай профессиональное резюме в формате Markdown.`;

  return callGemini(prompt, systemPrompt);
}

function cleanJsonResponse(raw: string): string {
  return raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function extractAnswers(answers: RawAnswer[]): string[] {
  return answers
    .map((entry) => {
      if (typeof entry.answer === 'string') return entry.answer.trim();

      return Object.values(entry)
        .filter((value) => typeof value === 'string')
        .map((value) => String(value).trim())
        .join(' ')
        .trim();
    })
    .filter(Boolean);
}

function inferLanguages(profile: Record<string, unknown>, answers: RawAnswer[], lang: 'ru' | 'kk'): string[] {
  const direct = toStringArray(profile.languages);
  if (direct.length) return direct;

  const text = extractAnswers(answers).join(' ').toLowerCase();
  const pool = lang === 'kk'
    ? ['Қазақ', 'Орыс', 'Ағылшын']
    : ['Русский', 'Казахский', 'Английский'];

  const inferred = pool.filter((item) => text.includes(item.toLowerCase()));
  return inferred.length ? inferred : [lang === 'kk' ? 'Қазақ, Орыс (жұмыс деңгейі)' : 'Русский, Казахский (рабочий уровень)'];
}

function inferSkills(profile: Record<string, unknown>, answers: RawAnswer[], lang: 'ru' | 'kk'): string[] {
  const direct = toStringArray(profile.skills);
  if (direct.length) return direct;

  const text = extractAnswers(answers).join(' ').toLowerCase();
  const candidates = lang === 'kk'
    ? ['Коммуникация', 'Клиенттік сервис', 'Ұйымдастыру', 'Командалық жұмыс', 'Аналитика']
    : ['Коммуникация', 'Клиентский сервис', 'Организация процессов', 'Командная работа', 'Аналитика'];

  const inferred = candidates.filter((item) => text.includes(item.toLowerCase()));
  return inferred.length ? inferred : candidates.slice(0, 3);
}

function buildSummary(
  profile: Record<string, unknown>,
  tone: ResumeTone,
  lang: 'ru' | 'kk',
  skills: string[]
): string {
  const customAbout = normalizeText(profile.about);
  if (customAbout.length >= 40) return customAbout;

  const role = normalizeText(profile.desiredRole) || normalizeText(profile.currentRole) || (lang === 'kk' ? 'маман' : 'специалист');
  const exp = normalizeText(profile.experience);
  const coreSkills = skills.slice(0, 3).join(', ');

  if (lang === 'kk') {
    if (tone === 'bold') {
      return `${role} бағыты бойынша нәтижеге жұмыс істейтін маманмын. ${exp ? `${exp} тәжірибемді` : 'тәжірибемді'} пайдаланып, ${coreSkills} арқылы процестерді жылдамдатып, команда нәтижесін күшейтуге фокус жасаймын.`;
    }
    if (tone === 'polite') {
      return `${role} саласында ұқыпты әрі сенімді жұмыс атқарамын. ${exp ? `${exp} тәжірибемде` : 'жұмыс тәжірибемде'} ${coreSkills} дағдыларын қолданып, әріптестермен тиімді байланыс пен тұрақты нәтиже қалыптастыруға мән беремін.`;
    }
    return `${role} ретінде кәсіби дамуға бағытталған маманмын. ${exp ? `${exp} тәжірибемде` : 'тәжірибемде'} ${coreSkills} дағдыларын күнделікті міндеттерде қолданып, сапалы нәтиже беруге тырысамын.`;
  }

  if (tone === 'bold') {
    return `${role} с фокусом на результат и скорость выполнения задач. ${exp ? `За ${exp} практики` : 'В работе'} уверенно применяю ${coreSkills}, выстраиваю процессы и довожу задачи до измеримого результата.`;
  }
  if (tone === 'polite') {
    return `${role}, ориентированный на качественную и аккуратную работу. ${exp ? `В рамках ${exp} опыта` : 'В профессиональной практике'} применяю ${coreSkills}, поддерживаю эффективную коммуникацию и стабильное выполнение задач.`;
  }
  return `${role}, нацеленный на стабильный профессиональный рост. ${exp ? `Имею ${exp} опыта` : 'Имею практический опыт'}, в работе использую ${coreSkills} и поддерживаю высокий стандарт качества.`;
}

function buildExperience(
  profile: Record<string, unknown>,
  lang: 'ru' | 'kk',
  skills: string[]
): string {
  const role = normalizeText(profile.currentRole) || normalizeText(profile.desiredRole);
  const exp = normalizeText(profile.experience);

  if (lang === 'kk') {
    return [
      role ? `${role}${exp ? `, ${exp}` : ''}.` : `${exp ? `${exp} тәжірибесі бар маман.` : 'Кәсіби тәжірибесі бар маман.'}`,
      `Күнделікті жұмыста ${skills.slice(0, 3).join(', ')} дағдыларын қолданамын және процестердің орындалуын бақылап отырамын.`,
      'Тапсырмаларды басымдыққа бөліп, командамен өзара үйлесімді әрекет етіп, сапалы нәтиже қамтамасыз етемін.',
    ].join(' ');
  }

  return [
    role ? `${role}${exp ? `, ${exp}.` : '.'}` : `${exp ? `${exp} опыта в профессиональной среде.` : 'Опыт работы в профессиональной среде.'}`,
    `В ежедневной работе применяю ${skills.slice(0, 3).join(', ')}, поддерживаю порядок в процессах и соблюдение сроков.`,
    'Регулярно взаимодействую с командой и клиентами, быстро адаптируюсь к новым задачам и инструментам.',
  ].join(' ');
}

function buildEducation(profile: Record<string, unknown>, answers: RawAnswer[], lang: 'ru' | 'kk'): string {
  const direct = normalizeText(profile.education);
  if (direct) return direct;

  const answerLine = extractAnswers(answers).find((item) => /образ|универ|колледж|бакалавр|магистр|оқу|университет|колледж/i.test(item));
  if (answerLine) return answerLine;

  return lang === 'kk'
    ? 'Негізгі білім бар, кәсіби бағыт бойынша тұрақты түрде өздігінен дамып, қысқа курстар арқылы біліктілігін арттырады.'
    : 'Имеется базовое профильное образование, дополнительно проходит практические курсы и самостоятельно повышает квалификацию.';
}

function buildProjects(profile: Record<string, unknown>, answers: RawAnswer[], lang: 'ru' | 'kk'): string[] {
  const directProjects = toStringArray(profile.projects ? String(profile.projects).split(/[,\n]/) : []);
  if (directProjects.length) {
    return directProjects.map((project) =>
      lang === 'kk'
        ? `${project}: жоспарлау, орындау және нәтижені бақылау бойынша тәжірибе.`
        : `${project}: участие в планировании, реализации и контроле результата.`
    );
  }

  const answerHint = extractAnswers(answers).find((item) => /проект|жоба/i.test(item));
  if (answerHint) {
    return [
      lang === 'kk'
        ? `Жоба тәжірибесі: ${answerHint}`
        : `Проектная практика: ${answerHint}`,
    ];
  }

  return [
    lang === 'kk'
      ? 'Ішкі жұмыс процестерін жақсарту бойынша командалық бастамаларға қатысу.'
      : 'Участие в командных инициативах по улучшению внутренних рабочих процессов.',
  ];
}

function inferStrengths(skills: string[], lang: 'ru' | 'kk'): string[] {
  const base = lang === 'kk'
    ? ['Жауапкершілік', 'Жылдам үйрену', 'Нәтижеге бағытталу']
    : ['Ответственность', 'Быстрое обучение', 'Ориентация на результат'];

  return [...skills.slice(0, 2), ...base].slice(0, 4);
}

function inferTools(skills: string[], answers: RawAnswer[], lang: 'ru' | 'kk'): string[] {
  const answerText = extractAnswers(answers).join(' ').toLowerCase();
  const toolPool = [
    'Excel',
    'Google Sheets',
    'CRM',
    'Notion',
    'Trello',
    '1C',
    'Canva',
    'Figma',
  ];

  const fromSkills = skills.filter((skill) => /excel|crm|notion|trello|1c|canva|figma|google/i.test(skill));
  const fromAnswers = toolPool.filter((tool) => answerText.includes(tool.toLowerCase()));
  const combined = Array.from(new Set([...fromSkills, ...fromAnswers])).slice(0, 5);

  if (combined.length) return combined;

  return lang === 'kk'
    ? ['Excel', 'Google Sheets', 'CRM']
    : ['Excel', 'Google Sheets', 'CRM'];
}

function buildAchievements(
  profile: Record<string, unknown>,
  lang: 'ru' | 'kk',
  tone: ResumeTone
): string[] {
  const role = normalizeText(profile.currentRole) || normalizeText(profile.desiredRole) || (lang === 'kk' ? 'маман' : 'специалист');

  if (lang === 'kk') {
    if (tone === 'bold') {
      return [
        `${role} ретінде күнделікті процестерді жүйелеп, тапсырмаларды орындау уақытын қысқартты.`,
        'Клиент/әріптес сұраныстарын өңдеу сапасын тұрақты деңгейде ұстап, қайталама қателерді азайтты.',
        'Командалық коммуникацияны жақсартып, міндеттерді приоритизациялау арқылы нәтижені күшейтті.',
      ];
    }

    return [
      `${role} рөлінде жұмыс ағынын құрылымдап, тапсырмалардың орындалуын тұрақтандырды.`,
      'Ішкі құжат айналымын және есептілік тәртібін жақсартуға үлес қосты.',
      'Командамен бірлесе отырып, клиентке бағытталған сервистік сапаны нығайтты.',
    ];
  }

  if (tone === 'bold') {
    return [
      `В роли «${role}» систематизировал(а) рабочие процессы и ускорил(а) выполнение операционных задач.`,
      'Повысил(а) стабильность качества сервиса за счёт структурирования входящих запросов и контроля сроков.',
      'Усилил(а) командное взаимодействие и предсказуемость результата по ежедневным задачам.',
    ];
  }

  return [
    `В роли «${role}» поддерживал(а) стабильную операционную работу и своевременное выполнение задач.`,
    'Улучшил(а) порядок в документации и внутренних процессах взаимодействия команды.',
    'Сформировал(а) более качественную коммуникацию с коллегами и клиентами.',
  ];
}

function mergeUnique(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function tailorSummaryToJob(
  baseSummary: string,
  targetJob: TargetJobContext | undefined,
  lang: 'ru' | 'kk'
): string {
  if (!targetJob) return baseSummary;

  const mustHave = mergeUnique([...targetJob.skills, ...targetJob.requirements])
    .slice(0, 3)
    .join(', ');

  if (lang === 'kk') {
    return `${baseSummary} Мақсатты рөл: ${targetJob.title} (${targetJob.company}). Вакансия талаптарына сәйкес ${mustHave} бағытында құндылық беруге дайын.`;
  }

  return `${baseSummary} Целевая роль: ${targetJob.title} (${targetJob.company}). Готов(а) усиливать бизнес-результат по направлениям: ${mustHave}.`;
}

function tailorAchievementsToJob(
  achievements: string[],
  targetJob: TargetJobContext | undefined,
  lang: 'ru' | 'kk'
): string[] {
  if (!targetJob) return achievements;

  const reqPreview = targetJob.requirements.slice(0, 2).join('; ');
  const targeted = lang === 'kk'
    ? `Мақсатты вакансия талаптарына (${reqPreview}) сәйкес келетін практикалық үлгілермен жұмыс нәтижесін дәлелдей алады.`
    : `Подтверждает релевантность целевой вакансии через практические кейсы по требованиям: ${reqPreview}.`;

  return mergeUnique([targeted, ...achievements]).slice(0, 5);
}

function tailorSkillsToJob(skills: string[], targetJob: TargetJobContext | undefined): string[] {
  if (!targetJob) return skills;
  return mergeUnique([...targetJob.skills, ...skills]).slice(0, 8);
}

function tailorToolsToJob(tools: string[], targetJob: TargetJobContext | undefined): string[] {
  if (!targetJob) return tools;

  const inferredTools = targetJob.requirements
    .filter((item) => /excel|crm|1c|sap|jira|postman|git|typescript|react|python|sql|power bi|figma/i.test(item));

  return mergeUnique([...tools, ...inferredTools]).slice(0, 6);
}

function buildResumeFallback(
  profile: Record<string, unknown>,
  answers: RawAnswer[],
  tone: ResumeTone,
  lang: 'ru' | 'kk',
  targetJob?: TargetJobContext
): StructuredResume {
  const skills = tailorSkillsToJob(inferSkills(profile, answers, lang), targetJob);
  const languages = inferLanguages(profile, answers, lang);
  const strengths = inferStrengths(skills, lang);
  const tools = tailorToolsToJob(inferTools(skills, answers, lang), targetJob);
  const achievements = tailorAchievementsToJob(buildAchievements(profile, lang, tone), targetJob, lang);
  const summary = tailorSummaryToJob(buildSummary(profile, tone, lang, skills), targetJob, lang);

  return {
    fullName: normalizeText(profile.name) || (lang === 'kk' ? 'Кандидат' : 'Кандидат'),
    title:
      normalizeText(profile.desiredRole) ||
      normalizeText(profile.currentRole) ||
      (lang === 'kk' ? 'Маман' : 'Специалист'),
    city: normalizeText(profile.city),
    email: normalizeText(profile.email),
    phone: normalizeText(profile.phone),
    summary,
    skills,
    strengths,
    achievements,
    tools,
    experience: buildExperience(profile, lang, skills),
    education: buildEducation(profile, answers, lang),
    languages,
    projects: buildProjects(profile, answers, lang),
  };
}

export async function generateStructuredResume(
  profile: Record<string, unknown>,
  answers: RawAnswer[],
  tone: ResumeTone,
  lang: 'ru' | 'kk',
  targetJob?: TargetJobContext
): Promise<StructuredResume> {
  const toneInstructionByLang: Record<'ru' | 'kk', Record<ResumeTone, string>> = {
    ru: {
      neutral: 'Тон: нейтральный и профессиональный.',
      polite: 'Тон: очень вежливый, дипломатичный и уважительный.',
      bold: 'Тон: уверенный, энергичный и проактивный, но без агрессии.',
    },
    kk: {
      neutral: 'Тон: бейтарап және кәсіби.',
      polite: 'Тон: өте сыпайы, дипломатиялық және құрметті.',
      bold: 'Тон: сенімді, жігерлі және бастамашыл, бірақ тым қатал емес.',
    },
  };

  const systemPrompt =
    lang === 'kk'
      ? `Сен кәсіби түйіндеме құрастырушысың. Тек таза JSON қайтар. Markdown, жұлдызша, тырнақша, код блоктары БОЛМАСЫН.
JSON форматы:
{
  "fullName": "string",
  "title": "string",
  "city": "string",
  "email": "string",
  "phone": "string",
  "summary": "кемінде 360 таңба, кәсіби және сенімді",
  "skills": ["string"],
  "strengths": ["string"],
  "achievements": ["string"],
  "tools": ["string"],
  "experience": "string",
  "education": "string",
  "languages": ["string"],
  "projects": ["string"]
}`
      : `Ты профессиональный составитель резюме. Верни только чистый JSON. Без markdown, без звёздочек, без кавычек-украшений, без код-блоков.
Формат JSON:
{
  "fullName": "string",
  "title": "string",
  "city": "string",
  "email": "string",
  "phone": "string",
  "summary": "минимум 360 символов, сильно и убедительно",
  "skills": ["string"],
  "strengths": ["string"],
  "achievements": ["string"],
  "tools": ["string"],
  "experience": "string",
  "education": "string",
  "languages": ["string"],
  "projects": ["string"]
}`;

  const prompt =
    lang === 'kk'
      ? `Профиль деректері: ${JSON.stringify(profile)}
Онбординг жауаптары: ${JSON.stringify(answers)}
${toneInstructionByLang.kk[tone]}
3-4 нақты жетістік жаз. Қысқа әрі әсерлі болсын.
${targetJob ? `Мақсатты вакансия: ${targetJob.title} (${targetJob.company}).\nТалаптар: ${targetJob.requirements.join(', ')}\nДағдылар: ${targetJob.skills.join(', ')}` : ''}
Тек JSON қайтар.`
      : `Данные профиля: ${JSON.stringify(profile)}
Ответы онбординга: ${JSON.stringify(answers)}
${toneInstructionByLang.ru[tone]}
Добавь 3-4 сильных достижения и 3-5 инструментов. Текст должен звучать как резюме сильного кандидата.
${targetJob ? `Целевая вакансия: ${targetJob.title} (${targetJob.company}).\nТребования: ${targetJob.requirements.join(', ')}\nКлючевые навыки: ${targetJob.skills.join(', ')}` : ''}
Верни только JSON.`;

  try {
    const response = await callGemini(prompt, systemPrompt);
    const parsed = JSON.parse(cleanJsonResponse(response)) as Partial<StructuredResume>;
    const fallback = buildResumeFallback(profile, answers, tone, lang, targetJob);

    return {
      fullName: parsed.fullName?.trim() || fallback.fullName,
      title: parsed.title?.trim() || fallback.title,
      city: parsed.city?.trim() || fallback.city,
      email: parsed.email?.trim() || fallback.email,
      phone: parsed.phone?.trim() || fallback.phone,
      summary: parsed.summary?.trim() && parsed.summary.trim().length >= 140 ? parsed.summary.trim() : fallback.summary,
      skills: Array.isArray(parsed.skills) && parsed.skills.length > 0 ? parsed.skills.map((s) => String(s).trim()).filter(Boolean) : fallback.skills,
      strengths: Array.isArray(parsed.strengths) && parsed.strengths.length > 0 ? parsed.strengths.map((s) => String(s).trim()).filter(Boolean) : fallback.strengths,
      achievements: Array.isArray(parsed.achievements) && parsed.achievements.length > 0 ? parsed.achievements.map((s) => String(s).trim()).filter(Boolean) : fallback.achievements,
      tools: Array.isArray(parsed.tools) && parsed.tools.length > 0 ? parsed.tools.map((s) => String(s).trim()).filter(Boolean) : fallback.tools,
      experience: parsed.experience?.trim() || fallback.experience,
      education: parsed.education?.trim() || fallback.education,
      languages: Array.isArray(parsed.languages) ? parsed.languages.map((s) => String(s).trim()).filter(Boolean) : fallback.languages,
      projects: Array.isArray(parsed.projects) ? parsed.projects.map((s) => String(s).trim()).filter(Boolean) : fallback.projects,
    };
  } catch {
    return buildResumeFallback(profile, answers, tone, lang, targetJob);
  }
}

export async function conductInterview(
  jobTitle: string,
  jobRequirements: string[],
  conversationHistory: Array<{ role: string; content: string }>,
  isFirstMessage: boolean
): Promise<string> {
  const systemPrompt = `Ты — дружелюбный, профессиональный HR-интервьюер платформы BilimMatch/Prof.ai. Ты проводишь собеседование на позицию "${jobTitle}".
Требования к позиции: ${jobRequirements.join(', ')}.

Правила:
1. Задавай по одному вопросу за раз
2. Вопросы должны быть релевантны позиции
3. Начни с одной короткой фразы приветствия и простого вопроса
4. Постепенно усложняй вопросы
5. Задай 5-7 вопросов, затем заверши собеседование
6. Будь профессиональным, но дружелюбным
7. Отвечай на русском языке
8. Не используй markdown, списки и спецсимволы форматирования`;

  let prompt: string;
  if (isFirstMessage) {
    prompt = 'Начни собеседование. Представься и задай первый вопрос.';
  } else {
    const history = conversationHistory.map(m => `${m.role === 'user' ? 'Кандидат' : 'Интервьюер'}: ${m.content}`).join('\n');
    prompt = `История разговора:\n${history}\n\nПродолжи собеседование. Если было задано уже 5+ вопросов, заверши собеседование и скажи, что анализ будет готов.`;
  }

  const raw = await callGemini(prompt, systemPrompt);
  return sanitizeInterviewText(raw);
}

export async function analyzeInterview(
  messages: Array<{ role: string; content: string; timestamp: number }>,
  jobTitle: string
): Promise<string> {
  const systemPrompt = `Ты — AI-аналитик собеседований на платформе Prof.ai. Проанализируй собеседование и выдай детальную аналитику.

Формат ответа — СТРОГО JSON:
{
  "confidenceScore": число от 0 до 100,
  "anxietyLevel": "низкий" | "средний" | "высокий",
  "responseQuality": число от 0 до 100,
  "strengths": ["сильная сторона 1", "сильная сторона 2"],
  "weaknesses": ["слабая сторона 1"],
  "opportunities": ["точка роста 1", "шаг для усиления 2"],
  "threats": ["риск на интервью 1", "фактор, который может снизить оценку"],
  "overallFeedback": "Общий фидбек в 2-3 предложениях",
  "detailedAnalysis": "Подробный анализ в формате Markdown с рекомендациями"
}

Анализируй:
- Паттерны ответов (длина, детальность)
- Паузы между сообщениями (timestamps)
- Уверенность формулировок
- Релевантность ответов вопросам
- Профессиональную лексику`;

  const history = messages.map(m => ({
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
  }));

  const prompt = `Позиция: ${jobTitle}
Собеседование: ${JSON.stringify(history)}

Проанализируй и верни JSON. Только JSON, без markdown-обёрток.`;

  return callGemini(prompt, systemPrompt);
}

function getFallbackResponse(prompt: string): string {
  if (prompt.includes('Начни собеседование')) {
    return `Здравствуйте! 👋

Меня зовут AI-интервьюер Prof.ai. Рад приветствовать вас на нашем собеседовании.

Давайте начнём с простого вопроса: **Расскажите немного о себе и вашем профессиональном опыте.**`;
  }

  if (prompt.includes('Профиль кандидата')) {
    return '[]';
  }

  if (prompt.includes('резюме')) {
    return `# Резюме

## Контактная информация
- Имя: Кандидат
- Город: Алматы

## О себе
Мотивированный специалист, ищущий возможности для профессионального роста.

## Навыки
- Коммуникация
- Работа в команде
- Организованность

*Для полноценной генерации резюме проверьте подключение backend AI endpoint.*`;
  }

  return 'AI временно недоступен. Проверьте VITE_AI_API_URL или VITE_AI_BASE_URL, VITE_AI_MODEL и API ключ.';
}
