import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useStore } from '@/store/useStore';
import { jobs, jobCategories } from '@/data/jobs';
import { matchJobsWithProfile } from '../lib/ai';
import { motion } from 'framer-motion';
import {
  Search, MapPin, Building2, Briefcase, Clock, ArrowRight, Filter, X, Sparkles
} from 'lucide-react';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/I18nContext';

interface MatchResult {
  jobId: string;
  matchPercent: number;
  explanation: string;
}

export default function Jobs() {
  const [, navigate] = useLocation();
  const { t, lang } = useI18n();
  const { userProfile, onboardingComplete, applications, addApplication } = useStore();
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [hasTriedMatching, setHasTriedMatching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const allCategory = t('jobs.all');
  const [selectedCategory, setSelectedCategory] = useState(allCategory);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [coverLetter, setCoverLetter] = useState('');

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
    return `ai-match-jobs:${JSON.stringify(profileSnapshot)}`;
  }, [userProfile]);

  const runMatching = useCallback(async (force = false) => {
    if (!onboardingComplete || matchingLoading) return;

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

    setMatchingLoading(true);
    try {
      const results = await matchJobsWithProfile(
        userProfile as unknown as Record<string, unknown>,
        jobs as unknown as Array<Record<string, unknown>>
      );
      setMatches(results);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(cacheKey, JSON.stringify(results));
      }
    } catch {
      const fallback = jobs.map((j) => {
        const skillMatch = j.skills.filter((s) =>
          userProfile.skills.some((us) => us.toLowerCase().includes(s.toLowerCase()))
        ).length;
        const percent = Math.min(95, Math.floor((skillMatch / Math.max(j.skills.length, 1)) * 80 + Math.random() * 20));
        return { jobId: j.id, matchPercent: percent, explanation: '' };
      });
      setMatches(fallback);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(cacheKey, JSON.stringify(fallback));
      }
    }
    setHasTriedMatching(true);
    setMatchingLoading(false);
  }, [cacheKey, matchingLoading, onboardingComplete, userProfile]);

  useEffect(() => {
    setSelectedCategory((prev) => {
      if (jobCategories.includes(prev)) return prev;
      return allCategory;
    });
  }, [allCategory]);

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

  const filteredJobs = useMemo(() => {
    let result = jobs;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          j.skills.some((s) => s.toLowerCase().includes(q))
      );
    }

    if (selectedCategory !== allCategory) {
      result = result.filter((j) => j.category === selectedCategory);
    }

    if (matches.length > 0) {
      result = [...result].sort((a, b) => {
        const matchA = matches.find((m) => m.jobId === a.id)?.matchPercent || 0;
        const matchB = matches.find((m) => m.jobId === b.id)?.matchPercent || 0;
        return matchB - matchA;
      });
    }

    return result;
  }, [searchQuery, selectedCategory, matches, allCategory]);

  const getMatch = (jobId: string) => matches.find((m) => m.jobId === jobId);
  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;

  const isApplied = useCallback(
    (jobId: string) => applications.some((application) => application.jobId === jobId),
    [applications]
  );

  const openApplyPopup = (jobId: string) => {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;

    const generatedName = userProfile.name || (lang === 'kk' ? 'Әлібек Нұрланұлы' : 'Айбек Нурланов');
    const generatedPhone = userProfile.phone || '+7 777 123 45 67';
    const generatedTelegram = userProfile.name
      ? `@${userProfile.name.toLowerCase().replace(/\s+/g, '_')}`
      : '@candidate_profile';

    setSelectedJobId(jobId);
    setCandidateName(generatedName);
    setPhone(generatedPhone);
    setTelegram(generatedTelegram);
    setCoverLetter(lang === 'kk'
      ? `Сәлеметсіз бе! Маған "${job.title}" вакансиясы қызық. Сұхбаттан өтуге және тест тапсырмасын орындауға дайынмын.`
      : `Здравствуйте! Меня заинтересовала вакансия "${job.title}". Готов пройти интервью и выполнить тестовое задание.`);
  };

  const closeApplyPopup = () => {
    setSelectedJobId(null);
  };

  const submitApplication = () => {
    if (!selectedJob) return;
    if (!candidateName.trim() || !phone.trim()) {
      toast.error(t('jobs.fillNamePhone'));
      return;
    }

    addApplication({
      id: `${Date.now()}`,
      jobId: selectedJob.id,
      jobTitle: selectedJob.title,
      company: selectedJob.company,
      candidateName: candidateName.trim(),
      phone: phone.trim(),
      telegram: telegram.trim(),
      coverLetter: coverLetter.trim(),
      createdAt: Date.now(),
      status: 'submitted',
    });

    toast.success(t('jobs.sentTest'));
    closeApplyPopup();
  };

  const getMatchColor = (percent: number) => {
    if (percent >= 75) return 'text-green-600 bg-green-50 border-green-100';
    if (percent >= 50) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-muted-foreground bg-muted/50 border-border';
  };

  return (
    <div className="min-h-screen pt-16 bg-white">
      <div className="container py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight mb-2">
            {t('jobs.title')}
          </h1>
          <p className="text-muted-foreground">
            {filteredJobs.length} {t('jobs.found')}
            {onboardingComplete && ` • ${t('jobs.sortedByMatch')}`}
          </p>
          {onboardingComplete && (
            <div className="mt-4">
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg gap-1 bg-transparent"
                onClick={() => runMatching(true)}
                disabled={matchingLoading}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {matchingLoading ? t('jobs.matching') : hasTriedMatching ? t('jobs.refreshAi') : t('jobs.runAi')}
              </Button>
            </div>
          )}
        </motion.div>

        <div className="mb-8 space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('jobs.searchPlaceholder')}
                className="w-full pl-11 pr-4 h-12 rounded-xl border border-border bg-white text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
              />
            </div>
            <Button
              variant="outline"
              className="h-12 px-4 rounded-xl gap-2 bg-transparent lg:hidden"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4" />
            </Button>
          </div>

          <div className={`flex flex-wrap gap-2 ${showFilters ? '' : 'hidden lg:flex'}`}>
            {jobCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-primary text-white'
                    : 'bg-white border border-border text-foreground hover:border-primary/30'
                }`}
              >
                {cat}
              </button>
            ))}
            {selectedCategory !== allCategory && (
              <button
                onClick={() => setSelectedCategory(allCategory)}
                className="px-3 py-2 rounded-full text-sm text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                {t('jobs.reset')}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {filteredJobs.map((job, i) => {
            const match = getMatch(job.id);
            return (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-2xl border border-border bg-white p-6 hover:shadow-lg hover:border-primary/20 transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <h3 className="font-display text-lg font-bold mb-1">{job.title}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Building2 className="w-3.5 h-3.5" />
                          {job.company}
                        </div>
                      </div>
                      {match && onboardingComplete && (
                        <div className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-bold border ${getMatchColor(match.matchPercent)}`}>
                          {match.matchPercent}%
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {job.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-4">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {job.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {job.experience}
                      </span>
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        {job.format}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {job.skills.map((skill) => (
                        <span
                          key={skill}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            onboardingComplete && userProfile.skills.some(
                              (us) => us.toLowerCase().includes(skill.toLowerCase()) || skill.toLowerCase().includes(us.toLowerCase())
                            )
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-display text-base font-bold text-foreground">
                        {job.salary}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={isApplied(job.id) ? 'outline' : 'default'}
                          className="rounded-lg"
                          onClick={() => openApplyPopup(job.id)}
                          disabled={isApplied(job.id)}
                        >
                          {isApplied(job.id) ? t('jobs.applied') : t('jobs.apply')}
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-lg gap-1"
                          onClick={() => navigate(`/interview?jobId=${job.id}`)}
                        >
                          {t('jobs.mockInterview')}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {filteredJobs.length === 0 && (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-lg">{t('jobs.empty')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('jobs.tryFilters')}</p>
            </div>
          )}
        </div>

        <Dialog open={!!selectedJob} onOpenChange={(open) => { if (!open) closeApplyPopup(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('jobs.applyTitle')}</DialogTitle>
              <DialogDescription>
                {selectedJob ? `${selectedJob.title} • ${selectedJob.company}` : t('jobs.fillCandidate')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Input
                value={candidateName}
                onChange={(event) => setCandidateName(event.target.value)}
                placeholder={t('jobs.namePlaceholder')}
              />
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={t('jobs.phonePlaceholder')}
              />
              <Input
                value={telegram}
                onChange={(event) => setTelegram(event.target.value)}
                placeholder={t('jobs.tgOptional')}
              />
              <Textarea
                value={coverLetter}
                onChange={(event) => setCoverLetter(event.target.value)}
                placeholder={t('jobs.coverPlaceholder')}
                rows={4}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeApplyPopup}>{t('common.cancel')}</Button>
              <Button onClick={submitApplication}>{t('jobs.submitApplication')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
