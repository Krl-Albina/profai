import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { callGemini } from '@/lib/ai';

import { jobs } from '@/data/jobs';
import { useStore } from '@/store/useStore';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Sparkles, Wand2, Plus, X, RefreshCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useI18n } from '@/contexts/I18nContext';

type Stage = 'role' | 'details' | 'identity' | 'paths';

interface PathItem {
  id: string;
  title: string;
  score: number;
  x: number;
  y: number;
}

interface AnimatedPathItem extends PathItem {
  driftX: number;
  driftY: number;
  duration: number;
  delay: number;
  rank: number;
  variant: 'db' | 'ai';
}

const seedSkills = ['Коммуникация', 'Аналитика'];
const experiencePresetsRu = ['Без опыта', '1-2 года', '3-5 лет', '5+ лет'];
const experiencePresetsKk = ['Тәжірибесіз', '1-2 жыл', '3-5 жыл', '5+ жыл'];
const workFormatPresetsRu = ['Удалённо', 'Гибрид', 'Офис', 'Проектная работа'];
const workFormatPresetsKk = ['Қашықтан', 'Гибрид', 'Кеңсе', 'Жобалық жұмыс'];
const skillPresetsRu = ['Коммуникация', 'Организация', 'Работа с данными', 'Командная работа', 'Клиентский сервис', 'Критическое мышление'];
const skillPresetsKk = ['Коммуникация', 'Ұйымдастыру', 'Дерекпен жұмыс', 'Командалық жұмыс', 'Клиенттік сервис', 'Сыни ойлау'];

const staggerContainer: any = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const revealItem: any = {
  hidden: { opacity: 0, y: 14, filter: 'blur(8px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.48,
      ease: 'easeOut',
    },
  },
};

function layoutByRelevance(index: number, total: number, score: number, maxScore: number, minScore: number) {
  const angle = (Math.PI * 2 * index) / Math.max(total, 1) + ((index % 2 === 0 ? 1 : -1) * Math.PI) / 42;
  const spread = Math.max(1, maxScore - minScore);
  const relevance = (score - minScore) / spread;
  const minRadius = 28;
  const maxRadius = 46;
  const jitter = ((index % 5) - 2) * 1.4;
  const radius = Math.max(minRadius, Math.min(maxRadius, maxRadius - (maxRadius - minRadius) * relevance + jitter));
  const rawX = 50 + Math.cos(angle) * radius;
  const safeBand = 17;
  let adjustedX = rawX;
  if (Math.abs(rawX - 50) < safeBand) {
    adjustedX = rawX < 50 ? 50 - safeBand : 50 + safeBand;
  }

  const x = adjustedX < 50
    ? Math.max(20, Math.min(46, adjustedX))
    : Math.max(54, Math.min(80, adjustedX));
  const y = Math.max(11, Math.min(89, 50 + Math.sin(angle) * radius));
  return { x, y };
}

function withAnimation(item: PathItem, index: number): AnimatedPathItem {
  const seed = (index + 1) * 37;
  const driftX = ((seed % 7) + 1) * (index % 2 === 0 ? 1 : -1) * 0.9;
  const driftY = (((seed + 3) % 9) + 1) * (index % 3 === 0 ? -1 : 1) * 0.8;
  const duration = 2.2 + (index % 5) * 0.28;
  const delay = (index % 6) * 0.18;

  return {
    ...item,
    driftX,
    driftY,
    duration,
    delay,
    rank: index + 1,
    variant: index % 3 === 0 ? 'ai' : 'db',
  };
}

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { t, lang } = useI18n();
  const {
    userProfile,
    setUserProfile,
    setOnboardingComplete,
    addOnboardingAnswer,
    setUserRole,
  } = useStore();

  const [stage, setStage] = useState<Stage>('role');
  const [activeTab, setActiveTab] = useState<'identity' | 'paths'>('identity');

  const [roleInput, setRoleInput] = useState(userProfile.currentRole || '');
  const [experienceInput, setExperienceInput] = useState('');
  const [educationInput, setEducationInput] = useState(userProfile.education || '');
  const [skillInput, setSkillInput] = useState('');
  const [interestInput, setInterestInput] = useState('');

  const [experiences, setExperiences] = useState<string[]>(
    userProfile.currentRole ? [userProfile.currentRole] : []
  );
  const [education, setEducation] = useState<string[]>(
    userProfile.education ? [userProfile.education] : []
  );
  const [skills, setSkills] = useState<string[]>(userProfile.skills.length ? userProfile.skills : seedSkills);
  const [interests, setInterests] = useState<string[]>(userProfile.interests);

  const [identityStatement, setIdentityStatement] = useState(
    userProfile.about || t('onboarding.identityStatement')
  );
  const [loadingIdentity, setLoadingIdentity] = useState(false);
  const [loadingPaths, setLoadingPaths] = useState(false);

  const [paths, setPaths] = useState<AnimatedPathItem[]>([]);
  const [hoveredPathId, setHoveredPathId] = useState<string | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const [selectedExperiencePreset, setSelectedExperiencePreset] = useState('');
  const [selectedWorkFormatPreset, setSelectedWorkFormatPreset] = useState('');
  const experiencePresets = lang === 'kk' ? experiencePresetsKk : experiencePresetsRu;
  const workFormatPresets = lang === 'kk' ? workFormatPresetsKk : workFormatPresetsRu;
  const skillPresets = lang === 'kk' ? skillPresetsKk : skillPresetsRu;

  const roleCatalog = useMemo(() => {
    const unique = new Map<string, string>();
    jobs.forEach((job) => {
      if (!unique.has(job.title)) {
        unique.set(job.title, job.category);
      }
    });
    return Array.from(unique.entries()).map(([title, category]) => ({ title, category }));
  }, []);

  const quickRoleOptions = useMemo(() => roleCatalog.slice(0, 10).map((item) => item.title), [roleCatalog]);
  const roleTitleText = t('onboarding.titleStart');
  const roleSubtitleText = t('onboarding.subtitleStart');

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const hoveredPath = useMemo(() => {
    if (!hoveredPathId) return null;
    return paths.find((item) => item.id === hoveredPathId) ?? null;
  }, [hoveredPathId, paths]);

  const getMatchHint = (item: AnimatedPathItem) => {
    if (item.score >= 86) return t('onboarding.veryHighMatch');
    if (item.score >= 74) return t('onboarding.goodMatch');
    return t('onboarding.growthOption');
  };

  const openHoveredPath = (pathId: string) => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      setHoveredPathId(pathId);
    }, 130);
  };

  const closeHoveredPath = () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredPathId(null);
  };

  const addChip = (value: string, target: 'experience' | 'education' | 'skills' | 'interests') => {
    const normalized = value.trim();
    if (!normalized) return;

    if (target === 'experience' && !experiences.includes(normalized)) {
      setExperiences((prev) => [...prev, normalized]);
      setExperienceInput('');
    }
    if (target === 'education' && !education.includes(normalized)) {
      setEducation((prev) => [...prev, normalized]);
      setEducationInput('');
    }
    if (target === 'skills' && !skills.includes(normalized)) {
      setSkills((prev) => [...prev, normalized]);
      setSkillInput('');
    }
    if (target === 'interests' && !interests.includes(normalized)) {
      setInterests((prev) => [...prev, normalized]);
      setInterestInput('');
    }
  };

  const removeChip = (value: string, target: 'experience' | 'education' | 'skills' | 'interests') => {
    if (target === 'experience') setExperiences((prev) => prev.filter((item) => item !== value));
    if (target === 'education') setEducation((prev) => prev.filter((item) => item !== value));
    if (target === 'skills') setSkills((prev) => prev.filter((item) => item !== value));
    if (target === 'interests') setInterests((prev) => prev.filter((item) => item !== value));
  };

  const toggleQuickChip = (value: string, target: 'experience' | 'skills' | 'interests') => {
    if (target === 'experience') {
      setExperiences((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
    }
    if (target === 'skills') {
      setSkills((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
    }
    if (target === 'interests') {
      setInterests((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
    }
  };

  const goFromDetailsToIdentity = () => {
    const normalizedRole = roleInput.trim();
    if (!normalizedRole) return;

    setUserRole('seeker');
    setExperiences((prev) => {
      const next = prev.filter((item) => item !== normalizedRole);
      return [normalizedRole, ...next];
    });

    if (selectedExperiencePreset) {
      setExperiences((prev) => (prev.includes(selectedExperiencePreset) ? prev : [...prev, selectedExperiencePreset]));
    }

    if (selectedWorkFormatPreset) {
      setInterests((prev) => (prev.includes(selectedWorkFormatPreset) ? prev : [...prev, selectedWorkFormatPreset]));
    }

    setStage('identity');
    setActiveTab('identity');
  };

  const saveIdentityToStore = () => {
    const currentRole = roleInput.trim() || experiences[0] || '';
    setUserRole('seeker');
    setUserProfile({
      currentRole,
      desiredRole: currentRole,
      experience: experiences.join(', '),
      education: education.join(', '),
      skills,
      interests,
      about: identityStatement,
    });
  };

  const generateIdentity = async () => {
    setLoadingIdentity(true);
    try {
      const prompt = `${lang === 'kk' ? 'Қазақ тілінде қысқа мансаптық identity statement жаса (2-3 сөйлем).' : 'Сформируй короткий карьерный identity statement на русском языке (2-3 предложения).'}
    ${t('onboarding.roleExp')}: ${experiences.join(', ') || roleInput}
    ${t('dashboard.education')}: ${education.join(', ') || t('onboarding.noData')}
    ${t('onboarding.skills')}: ${skills.join(', ') || t('onboarding.notSpecifiedPlural')}
    ${t('onboarding.interests')}: ${interests.join(', ') || t('onboarding.notSpecifiedPlural')}
    ${lang === 'kk' ? 'Стиль: сенімді, нақты, кәсіби.' : 'Тон: уверенный, конкретный, профессиональный.'}`;

      const text = await callGemini(prompt);
      setIdentityStatement(text);
    } catch {
      setIdentityStatement(lang === 'kk'
        ? 'Мен маман ретінде дамып келемін, практикалық дағдыларымды күшейтіп, мансапта түсінікті өсімі бар тұрақты рөлге шығуды қалаймын.'
        : 'Я развиваюсь как специалист, усиливаю практические навыки и хочу выйти на стабильную роль с понятным ростом в карьере.');
    } finally {
      setLoadingIdentity(false);
    }
  };

  const explorePaths = async () => {
    saveIdentityToStore();
    setLoadingPaths(true);

    try {
      const prompt = `${lang === 'kk' ? 'Үміткерге 10 мансаптық рөл ұсын.' : 'Подбери 10 карьерных ролей для соискателя.'}
    ${t('onboarding.roleExp')}: ${experiences.join(', ') || roleInput}
    ${t('onboarding.skills')}: ${skills.join(', ')}
    ${t('onboarding.interests')}: ${interests.join(', ')}
    ${lang === 'kk' ? 'Қатаң форматтағы JSON-массив қайтар:' : 'Верни JSON-массив строго формата:'}
    [{"title":"${lang === 'kk' ? 'Рөл атауы' : 'Название роли'}","score":84}]`;

      const raw = await callGemini(prompt);
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned) as Array<{ title: string; score: number }>;

      if (Array.isArray(parsed) && parsed.length > 0) {
        const sorted = parsed
          .map((item) => ({ title: item.title, score: Math.max(45, Math.min(98, Number(item.score) || 60)) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 24);
        const maxScore = sorted[0]?.score ?? 90;
        const minScore = sorted[sorted.length - 1]?.score ?? 55;

        const mapped = sorted.map((item, index, array) => {
          const point = layoutByRelevance(index, array.length, item.score, maxScore, minScore);
          return withAnimation({
            id: `${item.title}-${index}`,
            title: item.title,
            score: item.score,
            ...point,
          }, index);
        });
        setPaths(mapped);
        setHoveredPathId(null);
      } else {
        throw new Error('empty');
      }
    } catch {
      const fallback = roleCatalog
        .slice(0, 24)
        .map((role, index) => ({ ...role, score: Math.max(50, 85 - index * 2) }))
        .sort((a, b) => b.score - a.score)
        .map((role, index, array) => {
        const maxScore = array[0]?.score ?? 85;
        const minScore = array[array.length - 1]?.score ?? 50;
        const point = layoutByRelevance(index, array.length, role.score, maxScore, minScore);
        const score = role.score;
        return withAnimation({
          id: `${role.title}-${index}`,
          title: role.title,
          score,
          ...point,
        }, index);
      });
      setPaths(fallback);
      setHoveredPathId(null);
    } finally {
      setLoadingPaths(false);
      setStage('paths');
      setActiveTab('paths');
    }
  };

  const finishOnboarding = async () => {
    saveIdentityToStore();

    addOnboardingAnswer({ question: t('dashboard.experience'), answer: experiences.join(', ') });
    addOnboardingAnswer({ question: t('dashboard.education'), answer: education.join(', ') });
    addOnboardingAnswer({ question: t('onboarding.skills'), answer: skills.join(', ') });
    addOnboardingAnswer({ question: t('onboarding.interests'), answer: interests.join(', ') });
    addOnboardingAnswer({ question: t('onboarding.careerIdentityQuestion'), answer: identityStatement });

    setOnboardingComplete(true);

    navigate('/dashboard');
  };

  if (stage === 'role') {
    return (
      <div className="min-h-screen pt-16 bg-[#dfe4ec]">
        <div className="container py-8">
          <button
            onClick={() => navigate('/')}
            className="mb-8 flex items-center gap-2 text-sm text-[#4b5668]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common.cancel')}
          </button>

          <motion.div
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="mx-auto mt-16 max-w-4xl"
          >
            <motion.h1 variants={revealItem} className="mb-4 min-h-[76px] font-display text-6xl font-semibold text-[#4a5568]">
              {roleTitleText}
            </motion.h1>
            <motion.p variants={revealItem} className="mb-8 min-h-[36px] text-[40px] text-lg text-[#5f6d80]">{roleSubtitleText}</motion.p>

            <motion.div variants={revealItem}>
              <Input
                value={roleInput}
                onChange={(event) => setRoleInput(event.target.value)}
                placeholder={t('onboarding.rolePlaceholder')}
                className="h-20 rounded-2xl border-2 border-[#82a8df] bg-white/70 px-8 text-2xl font-light text-[#4a5568] placeholder:text-[#a6b1c2]"
              />
            </motion.div>

            <motion.div variants={revealItem} className="mt-5">
              <p className="mb-3 text-sm font-semibold text-[#6b7890]">{t('onboarding.readyRoles')}</p>
              <div className="flex flex-wrap gap-2">
                {quickRoleOptions.map((role) => (
                  <button
                    key={role}
                    onClick={() => setRoleInput(role)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${roleInput === role ? 'bg-[#73a0dc] text-white' : 'bg-white/85 text-[#4f5e72] hover:bg-white'}`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.div variants={revealItem}>
              <Button
                className="mt-8 h-12 min-w-[180px] rounded-xl"
                disabled={!roleInput.trim()}
                onClick={() => {
                  setUserRole('seeker');
                  setExperiences((prev) => (prev.length ? prev : [roleInput.trim()]));
                  setStage('details');
                }}
              >
                {t('common.next')}
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (stage === 'details') {
    return (
      <div className="min-h-screen pt-16 bg-[#dfe4ec]">
        <div className="container py-8">
          <button
            onClick={() => setStage('role')}
            className="mb-8 flex items-center gap-2 text-sm text-[#4b5668]"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад
          </button>

          <motion.div
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="mx-auto max-w-4xl rounded-3xl bg-white/70 p-7"
          >
            <motion.h2 variants={revealItem} className="text-3xl font-semibold text-[#45536a]">{t('onboarding.detailsTitle')}</motion.h2>
            <motion.p variants={revealItem} className="mt-2 text-[#647287]">{t('onboarding.detailsSubtitle')}</motion.p>

            <motion.div variants={revealItem} className="mt-7 space-y-6">
              <motion.div variants={revealItem}>
                <p className="mb-3 text-sm font-semibold text-[#5b6980]">{t('dashboard.experience')}</p>
                <div className="flex flex-wrap gap-2">
                  {experiencePresets.map((item) => (
                    <button
                      key={item}
                      onClick={() => setSelectedExperiencePreset(item)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selectedExperiencePreset === item ? 'bg-[#78a7e6] text-white' : 'bg-[#edf2f9] text-[#55647a] hover:bg-[#e4ebf6]'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </motion.div>

              <motion.div variants={revealItem}>
                <p className="mb-3 text-sm font-semibold text-[#5b6980]">{t('onboarding.workFormat')}</p>
                <div className="flex flex-wrap gap-2">
                  {workFormatPresets.map((item) => (
                    <button
                      key={item}
                      onClick={() => setSelectedWorkFormatPreset(item)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selectedWorkFormatPreset === item ? 'bg-[#78a7e6] text-white' : 'bg-[#edf2f9] text-[#55647a] hover:bg-[#e4ebf6]'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </motion.div>

              <motion.div variants={revealItem}>
                <p className="mb-3 text-sm font-semibold text-[#5b6980]">{t('onboarding.quickSkills')}</p>
                <div className="flex flex-wrap gap-2">
                  {skillPresets.map((item) => {
                    const active = skills.includes(item);
                    return (
                      <button
                        key={item}
                        onClick={() => toggleQuickChip(item, 'skills')}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${active ? 'bg-[#9fdc72] text-[#304a2f]' : 'bg-[#eef5e8] text-[#4f6b4f] hover:bg-[#e3efd8]'}`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </motion.div>

            <motion.div variants={revealItem} className="mt-8 flex flex-wrap justify-end gap-3">
              <Button variant="outline" className="rounded-xl" onClick={() => setStage('role')}>
                {t('common.back')}
              </Button>
              <Button className="rounded-xl" onClick={goFromDetailsToIdentity} disabled={!roleInput.trim()}>
                {t('common.next')}
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-16 bg-[#dfe4ec]">
      <div className="container py-6">
        <div className="mb-6 grid grid-cols-2 gap-3 rounded-2xl bg-white/55 p-2">
          <button
            onClick={() => setActiveTab('identity')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeTab === 'identity' ? 'bg-white text-[#425067]' : 'text-[#8a95a8]'}`}
          >
            {t('onboarding.tabIdentity')}
          </button>
          <button
            onClick={() => setActiveTab('paths')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeTab === 'paths' ? 'bg-white text-[#425067]' : 'text-[#8a95a8]'}`}
          >
            {t('onboarding.tabPaths')}
          </button>
        </div>

        {activeTab === 'identity' ? (
          <motion.div
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="grid gap-6 lg:grid-cols-[1.1fr_1fr]"
          >
            <motion.div variants={revealItem} className="space-y-6 rounded-3xl bg-white/55 p-6">
              <div>
                <h2 className="mb-3 font-display text-3xl text-[#39465a]">🌱 {t('dashboard.experience')}</h2>
                <div className="mb-3 flex flex-wrap gap-2">
                  {experiences.map((item) => (
                    <button key={item} onClick={() => removeChip(item, 'experience')} className="rounded-full bg-[#9ec1f6] px-4 py-2 text-lg text-[#33455f]">
                      {item} <X className="ml-1 inline h-4 w-4" />
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={experienceInput} onChange={(e) => setExperienceInput(e.target.value)} placeholder={lang === 'kk' ? 'Тәжірибе қосу' : 'Добавить опыт'} className="bg-white" />
                  <Button variant="outline" onClick={() => addChip(experienceInput, 'experience')}><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {experiencePresets.map((item) => (
                    <button
                      key={item}
                      onClick={() => toggleQuickChip(item, 'experience')}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${experiences.includes(item) ? 'bg-[#78a7e6] text-white' : 'bg-[#edf2f9] text-[#55647a] hover:bg-[#e4ebf6]'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="mb-3 font-display text-3xl text-[#39465a]">🎓 {t('dashboard.education')}</h2>
                <div className="mb-3 flex flex-wrap gap-2">
                  {education.map((item) => (
                    <button key={item} onClick={() => removeChip(item, 'education')} className="rounded-full bg-[#d5dbe6] px-4 py-2 text-lg text-[#33455f]">
                      {item} <X className="ml-1 inline h-4 w-4" />
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={educationInput} onChange={(e) => setEducationInput(e.target.value)} placeholder={lang === 'kk' ? 'Білім қосу' : 'Добавить образование'} className="bg-white" />
                  <Button variant="outline" onClick={() => addChip(educationInput, 'education')}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>

              <div>
                <h2 className="mb-3 font-display text-3xl text-[#39465a]">💪 {t('onboarding.skills')}</h2>
                <div className="mb-3 flex flex-wrap gap-2">
                  {skills.map((item) => (
                    <button key={item} onClick={() => removeChip(item, 'skills')} className="rounded-full bg-[#acef55] px-4 py-2 text-lg text-[#33455f]">
                      {item} <X className="ml-1 inline h-4 w-4" />
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} placeholder={lang === 'kk' ? 'Дағды қосу' : 'Добавить навык'} className="bg-white" />
                  <Button variant="outline" onClick={() => addChip(skillInput, 'skills')}><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {skillPresets.map((item) => (
                    <button
                      key={item}
                      onClick={() => toggleQuickChip(item, 'skills')}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${skills.includes(item) ? 'bg-[#9fdc72] text-[#304a2f]' : 'bg-[#eef5e8] text-[#4f6b4f] hover:bg-[#e3efd8]'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="mb-3 font-display text-3xl text-[#39465a]">💕 {t('onboarding.interests')}</h2>
                <div className="mb-3 flex flex-wrap gap-2">
                  {interests.map((item) => (
                    <button key={item} onClick={() => removeChip(item, 'interests')} className="rounded-full bg-[#ffd4eb] px-4 py-2 text-lg text-[#33455f]">
                      {item} <X className="ml-1 inline h-4 w-4" />
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={interestInput} onChange={(e) => setInterestInput(e.target.value)} placeholder={lang === 'kk' ? 'Қызығушылық қосу' : 'Добавить интерес'} className="bg-white" />
                  <Button variant="outline" onClick={() => addChip(interestInput, 'interests')}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            </motion.div>

            <motion.div variants={revealItem}>
              <Card className="rounded-3xl border-0 bg-white/75">
              <CardContent className="flex h-full flex-col p-8">
                <div className="mb-4 inline-flex items-center gap-2 text-[#4f6d90]">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm font-semibold">{t('onboarding.identityStatement')}</span>
                </div>

                <Textarea
                  value={identityStatement}
                  onChange={(event) => setIdentityStatement(event.target.value)}
                  className="min-h-[260px] resize-none border-0 bg-transparent p-0 text-3xl font-light leading-relaxed text-[#435065]"
                />

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <Button variant="outline" className="rounded-xl" onClick={generateIdentity} disabled={loadingIdentity}>
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      {loadingIdentity ? t('onboarding.generating') : t('onboarding.regenerate')}
                    </Button>
                  </div>

                  <Button className="rounded-xl" onClick={explorePaths} disabled={loadingPaths}>
                    <Wand2 className="mr-2 h-4 w-4" />
                    {loadingPaths ? t('onboarding.exploring') : t('onboarding.explorePaths')}
                  </Button>
                </div>
              </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="rounded-3xl bg-white/55 p-6"
          >
            <div
              className="career-map-grid relative h-[66vh] overflow-hidden rounded-3xl bg-[#dfe4ec]"
              onMouseLeave={closeHoveredPath}
            >
              <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle,_rgba(124,133,149,0.18)_1.7px,_transparent_1.7px)] [background-size:42px_42px]" />

              <div className="center-core absolute left-1/2 top-1/2 z-10 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full" />

              <div className="absolute left-1/2 top-1/2 z-20 flex h-52 w-52 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-center shadow-xl">
                <div>
                  <p className="text-2xl font-semibold text-[#6f7c90]">{t('onboarding.pathsForYou')}</p>
                  <p className="mt-2 text-sm text-[#7c889a]">{t('onboarding.basedOnProfile')}</p>
                </div>
              </div>

              {paths.map((item) => (
                <div
                  key={item.id}
                  className="path-drift absolute"
                  style={{ left: `${item.x}%`, top: `${item.y}%` }}
                >
                  <button
                    onMouseEnter={() => openHoveredPath(item.id)}
                    onFocus={() => openHoveredPath(item.id)}
                    onBlur={closeHoveredPath}
                    className={`path-node group flex items-center gap-2 rounded-2xl px-2 py-1 ${item.x < 50 ? '-translate-x-full -translate-y-1/2 flex-row-reverse text-right' : '-translate-y-1/2 text-left'}`}
                    style={{
                      ['--drift-x' as string]: `${item.driftX}px`,
                      ['--drift-y' as string]: `${item.driftY}px`,
                      ['--drift-duration' as string]: `${item.duration}s`,
                      ['--drift-delay' as string]: `${item.delay}s`,
                    }}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        item.variant === 'ai' ? 'bg-[#58d24b]' : 'bg-[#37aaf4]'
                      }`}
                    />
                    <div className="max-w-[180px] md:max-w-[210px]">
                      <span className="line-fade-2 block text-[16px] font-semibold leading-snug text-[#4f5e72] transition-colors duration-300 group-hover:text-[#35465f] md:text-[20px]">
                        {item.title}
                      </span>
                      <span className="mt-0.5 inline-flex rounded-full bg-white/72 px-2 py-0.5 text-xs font-semibold text-[#5f6d83] shadow-sm">
                        {item.score}% match
                      </span>
                    </div>
                  </button>
                </div>
              ))}

              <AnimatePresence>
                {hoveredPath && (
                  <motion.div
                    key={hoveredPath.id}
                    initial={{
                      opacity: 0,
                      y: 8,
                      x: hoveredPath.x < 50 ? -10 : 10,
                      scale: 0.97,
                      filter: 'blur(5px)',
                    }}
                    animate={{ opacity: 1, y: 0, x: 0, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: 6, x: hoveredPath.x < 50 ? -8 : 8, scale: 0.98, filter: 'blur(4px)' }}
                    transition={{ type: 'spring', stiffness: 260, damping: 24, mass: 0.75 }}
                    className="pointer-events-none absolute z-40 w-[300px] rounded-3xl bg-white/88 p-5 shadow-xl ring-1 ring-white/70 backdrop-blur"
                    style={{
                      left: hoveredPath.x < 50
                        ? `clamp(12px, calc(${hoveredPath.x}% + 36px), calc(100% - 312px))`
                        : `clamp(12px, calc(${hoveredPath.x}% - 312px), calc(100% - 312px))`,
                      top: `clamp(12px, calc(${hoveredPath.y}% - 106px), calc(100% - 252px))`,
                    }}
                  >
                    <motion.span
                      initial={{ opacity: 0, scaleX: 0.35 }}
                      animate={{ opacity: 0.85, scaleX: 1 }}
                      exit={{ opacity: 0, scaleX: 0.55 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className={`absolute top-[46px] h-[2px] w-8 bg-gradient-to-r from-[#6ecbff]/85 to-transparent ${hoveredPath.x < 50 ? '-left-10 origin-right' : '-right-10 origin-left rotate-180'}`}
                    />
                    <span
                      className={`absolute top-10 h-4 w-4 rotate-45 bg-white/88 ring-1 ring-white/70 ${hoveredPath.x < 50 ? '-left-2' : '-right-2'}`}
                    />
                    <div className="mb-3 inline-flex items-center rounded-full bg-[#e9f6ff] px-3 py-1 text-xs font-semibold text-[#3f668a]">
                      {hoveredPath.variant === 'ai' ? t('onboarding.aiResult') : t('onboarding.dbResult')}
                    </div>
                    <h3 className="text-2xl font-semibold leading-tight text-[#3f4d63]">{hoveredPath.title}</h3>
                    <p className="mt-2 text-sm text-[#5f6f84]">{getMatchHint(hoveredPath)}</p>

                    <div className="mt-4 rounded-2xl bg-[#f3f6fb] p-3">
                      <div className="mb-2 flex items-center justify-between text-sm font-semibold text-[#46586f]">
                        <span>{t('onboarding.match')}</span>
                        <span>{hoveredPath.score}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#d7e1ef]">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#3ea8ff] to-[#44d67f]"
                          initial={{ width: 0 }}
                          animate={{ width: `${hoveredPath.score}%` }}
                          transition={{ duration: 0.55, ease: 'easeOut' }}
                        />
                      </div>
                    </div>

                    <p className="mt-4 text-xs text-[#7c889a]">{t('onboarding.rankInList')}: #{hoveredPath.rank}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="absolute bottom-6 left-6 z-30 flex gap-3">
                <div className="rounded-full bg-white px-4 py-2 text-sm text-[#5c6b80] shadow-sm">
                  <span className="mr-2 inline-block h-3 w-3 rounded-full bg-[#37aaf4]" />
                  {t('onboarding.dbResult')}
                </div>
                <div className="rounded-full bg-white px-4 py-2 text-sm text-[#5c6b80] shadow-sm">
                  <span className="mr-2 inline-block h-3 w-3 rounded-full bg-[#58d24b]" />
                  {t('onboarding.aiResult')}
                </div>
              </div>

              <div className="absolute bottom-6 right-6 z-30 flex items-center gap-3">
                <button className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#2f6ce6] shadow-sm">
                  {t('onboarding.whySee')}
                </button>
                <button className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2f6ce6] text-white shadow-sm">
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <Button variant="outline" className="rounded-xl" onClick={() => setActiveTab('identity')}>
                {t('onboarding.toProfile')}
              </Button>
              <Button className="rounded-xl" onClick={finishOnboarding}>
                {t('onboarding.goToJobs')}
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
