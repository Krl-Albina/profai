import { Button } from '@/components/ui/button';
import { AIThinking } from '@/components/LoadingSkeleton';
import { useStore } from '@/store/useStore';
import { jobs } from '@/data/jobs';
import { matchJobsWithProfile } from '../lib/ai';
import { motion } from 'framer-motion';
import {
  Sparkles, FileText, MessageSquare, MapPin, Briefcase, TrendingUp,
  ArrowRight, Building2, ChevronRight
} from 'lucide-react';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation, Link } from 'wouter';
import { useI18n } from '@/contexts/I18nContext';

interface MatchResult {
  jobId: string;
  matchPercent: number;
  explanation: string;
}

const sectionStagger: any = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const sectionReveal: any = {
  hidden: { opacity: 0, y: 18, filter: 'blur(8px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.42, ease: 'easeOut' },
  },
};

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { userProfile, onboardingComplete } = useStore();
  const { t } = useI18n();
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasTriedMatching, setHasTriedMatching] = useState(false);

  const cacheKey = useMemo(() => {
    const profileSnapshot = {
      city: userProfile.city,
      experience: userProfile.experience,
      education: userProfile.education,
      desiredRole: userProfile.desiredRole,
      skills: userProfile.skills,
      interests: userProfile.interests,
      languages: userProfile.languages,
    };
    return `ai-match-dashboard:${JSON.stringify(profileSnapshot)}`;
  }, [userProfile]);

  useEffect(() => {
    if (!onboardingComplete) {
      navigate('/onboarding');
      return;
    }
  }, [onboardingComplete, navigate]);

  const runMatching = useCallback(async (force = false) => {
    if (!onboardingComplete || loading) return;

    if (!force && typeof window !== 'undefined') {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as MatchResult[];
          setMatches(parsed);
          setHasTriedMatching(true);
          return;
        } catch {
          sessionStorage.removeItem(cacheKey);
        }
      }
    }

    setLoading(true);
    try {
      const results = await matchJobsWithProfile(
        userProfile as unknown as Record<string, unknown>,
        jobs as unknown as Array<Record<string, unknown>>
      );
      const sorted = results.sort((a, b) => b.matchPercent - a.matchPercent);
      setMatches(sorted);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(cacheKey, JSON.stringify(sorted));
      }
    } catch {
      const fallback = jobs.map((j) => {
        const skillMatch = j.skills.filter((s) =>
          userProfile.skills.some((us) => us.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(us.toLowerCase()))
        ).length;
        const percent = Math.min(95, Math.floor((skillMatch / Math.max(j.skills.length, 1)) * 80 + Math.random() * 20));
        return { jobId: j.id, matchPercent: percent, explanation: 'Совпадение на основе ваших навыков.' };
      });
      const sorted = fallback.sort((a, b) => b.matchPercent - a.matchPercent);
      setMatches(sorted);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(cacheKey, JSON.stringify(sorted));
      }
    }
    setHasTriedMatching(true);
    setLoading(false);
  }, [cacheKey, loading, onboardingComplete, userProfile]);

  useEffect(() => {
    if (!onboardingComplete || typeof window === 'undefined') return;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as MatchResult[];
        setMatches(parsed);
        setHasTriedMatching(true);
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }
  }, [cacheKey, onboardingComplete]);

  const topMatches = useMemo(() => {
    return matches.slice(0, 6).map((m) => ({
      ...m,
      job: jobs.find((j) => j.id === m.jobId),
    })).filter((m) => m.job);
  }, [matches]);

  const getMatchColor = (percent: number) => {
    if (percent >= 75) return 'text-green-600';
    if (percent >= 50) return 'text-amber-500';
    return 'text-muted-foreground';
  };

  const getMatchBg = (percent: number) => {
    if (percent >= 75) return 'bg-green-50 border-green-100';
    if (percent >= 50) return 'bg-amber-50 border-amber-100';
    return 'bg-muted/50 border-border';
  };

  if (!onboardingComplete) return null;

  return (
    <div className="min-h-screen pt-16 bg-white">
      <motion.div
        className="container py-10"
        initial="hidden"
        animate="show"
        variants={sectionStagger}
      >
        <motion.div
          variants={sectionReveal}
          className="mb-10"
        >
          <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight mb-2">
            {t('dashboard.greeting')}, {userProfile.name || t('dashboard.candidate')} 👋
          </h1>
          <p className="text-muted-foreground text-lg">
            {t('dashboard.subtitle')}
          </p>
          <div className="mt-4">
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg bg-transparent"
              onClick={() => runMatching(true)}
              disabled={loading}
            >
              {loading ? t('jobs.matching') : hasTriedMatching ? t('dashboard.refreshMatch') : t('dashboard.runMatch')}
            </Button>
          </div>
        </motion.div>

        <motion.div variants={sectionReveal} className="grid sm:grid-cols-3 gap-4 mb-10">
          <Link href="/jobs" className="no-underline">
            <motion.div
              whileHover={{ y: -3, scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="p-5 rounded-xl border border-border hover:border-primary/20 hover:shadow-md transition-all duration-300 bg-white group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-primary" />
                </div>
                <span className="font-display font-bold text-foreground">{t('dashboard.allVacancies')}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {jobs.length} вакансий с AI-матчингом
              </p>
            </motion.div>
          </Link>

          <Link href="/resume" className="no-underline">
            <motion.div
              whileHover={{ y: -3, scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="p-5 rounded-xl border border-border hover:border-primary/20 hover:shadow-md transition-all duration-300 bg-white group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <span className="font-display font-bold text-foreground">{t('dashboard.myResume')}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.generateResume')}
              </p>
            </motion.div>
          </Link>

          <Link href="/interview" className="no-underline">
            <motion.div
              whileHover={{ y: -3, scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="p-5 rounded-xl border border-border hover:border-primary/20 hover:shadow-md transition-all duration-300 bg-white group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-primary" />
                </div>
                <span className="font-display font-bold text-foreground">{t('dashboard.mockInterview')}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.interviewPrep')}
              </p>
            </motion.div>
          </Link>
        </motion.div>

        <motion.div
          variants={sectionReveal}
          className="mb-10 p-6 rounded-2xl border border-border bg-white"
        >
          <h2 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {t('dashboard.profile')}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('dashboard.city')}</div>
              <div className="text-sm font-medium flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                {userProfile.city || t('common.notSpecified')}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('dashboard.experience')}</div>
              <div className="text-sm font-medium flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                {userProfile.experience || t('common.notSpecified')}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('dashboard.education')}</div>
              <div className="text-sm font-medium">{userProfile.education || t('common.notSpecified')}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('dashboard.desiredRole')}</div>
              <div className="text-sm font-medium">{userProfile.desiredRole || t('common.notSpecified')}</div>
            </div>
          </div>
          {userProfile.skills.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-muted-foreground mb-2">{t('dashboard.skills')}</div>
              <div className="flex flex-wrap gap-1.5">
                {userProfile.skills.map((skill) => (
                  <span key={skill} className="px-2.5 py-1 rounded-full bg-primary/5 text-primary text-xs font-medium">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        <motion.div variants={sectionReveal} className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">{t('dashboard.topMatches')}</h2>
          <Link href="/jobs" className="text-sm text-primary font-medium flex items-center gap-1 no-underline">
            {t('dashboard.allJobsLink')} <ChevronRight className="w-4 h-4" />
          </Link>
        </motion.div>

        {loading ? (
          <motion.div variants={sectionReveal}>
            <AIThinking text="AI анализирует ваш профиль и подбирает вакансии..." />
          </motion.div>
        ) : !hasTriedMatching ? (
          <motion.div variants={sectionReveal} className="rounded-2xl border border-border bg-white p-8 text-center">
            <p className="text-muted-foreground mb-4">{t('dashboard.runPrompt')}</p>
          </motion.div>
        ) : (
          <motion.div variants={sectionReveal} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {topMatches.map((match, i) => (
              <motion.div
                key={match.jobId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.38, ease: 'easeOut' }}
                whileHover={{ y: -4, scale: 1.01 }}
                className="rounded-2xl border border-border bg-white p-6 hover:shadow-lg hover:border-primary/20 transition-all duration-300 group"
              >
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-4 border ${getMatchBg(match.matchPercent)}`}>
                  <span className={getMatchColor(match.matchPercent)}>
                    {match.matchPercent}% совпадение
                  </span>
                </div>

                <h3 className="font-display text-lg font-bold mb-1 group-hover:text-primary transition-colors">
                  {match.job!.title}
                </h3>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
                  <Building2 className="w-3.5 h-3.5" />
                  {match.job!.company}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {match.job!.location}
                  </span>
                </div>

                <div className="text-sm font-semibold text-foreground mb-3">
                  {match.job!.salary}
                </div>

                <p className="text-xs text-muted-foreground mb-4 line-clamp-2">
                  {match.explanation}
                </p>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {match.job!.skills.slice(0, 3).map((skill) => (
                    <span key={skill} className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">
                      {skill}
                    </span>
                  ))}
                  {match.job!.skills.length > 3 && (
                    <span className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">
                      +{match.job!.skills.length - 3}
                    </span>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-lg gap-1 bg-transparent"
                  onClick={() => navigate(`/interview?jobId=${match.jobId}`)}
                >
                  {t('dashboard.interviewButton')}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
