import { Button } from '@/components/ui/button';
import { useStore } from '@/store/useStore';
import { generateStructuredResume, type ResumeTone, type StructuredResume } from '../lib/ai';
import { jobs } from '@/data/jobs';
import { motion } from 'framer-motion';
import { FileText, Download, RefreshCw, ArrowLeft, Sparkles, FileType2, Wand2 } from 'lucide-react';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useI18n } from '@/contexts/I18nContext';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const RESUME_IMG = 'https://private-us-east-1.manuscdn.com/sessionFile/jEzBJwYrZx1oONmR73Dibg/sandbox/w9MJXfqlFpTQrySgI2073N-img-4_1772022767000_na1fn_cmVzdW1lLWlsbHVzdHJhdGlvbg.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvakV6Qkp3WXJaeDFvT05tUjczRGliZy9zYW5kYm94L3c5TUpYZnFsRnBUUXJ5U2dJMjA3M04taW1nLTRfMTc3MjAyMjc2NzAwMF9uYTFmbl9jbVZ6ZFcxbExXbHNiSFZ6ZEhKaGRHbHZiZy5wbmc~eC1vc3MtcHJvY2Vzcz1pbWFnZS9yZXNpemUsd18xOTIwLGhfMTkyMC9mb3JtYXQsd2VicC9xdWFsaXR5LHFfODAiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=VxPQ5V1tTN9yFAbe02y6Xp64jYuEnVCPFg1YZUqu0jx0-6DtQka3qaAwSG9vTU3cgzef9cKr3-1JKZTpg5cs2RoCERgqhJVtKHNelkmaaKqU5cBO2IMighWeUBFrMbgIpwg-pB42fDOY-jnOk5wrLRyYzAOrz41WAm04iQkmxYgCG0pu1pFPuA1bniYbxY8FjZQsPFdW9HK0a4sxrXTO-GM2Vw1~1kOrmtDxZsOAxv50pwXrCOu0EQ--nIxUNiQ6WL1vF~H3dtAjGyLM9PUSR4e1B0DY59qWsog26knbaMOEb623FK3e61QT-lfCCQgun7QNDU~UlgoFvtzqXhMpVA__';

interface ResumeForm {
  name: string;
  email: string;
  phone: string;
  city: string;
  currentRole: string;
  desiredRole: string;
  experience: string;
  education: string;
  about: string;
  skills: string;
  languages: string;
  projects: string;
}

interface StoredResumePayload {
  version: 2;
  tone: ResumeTone;
  lang: 'ru' | 'kk';
  data: StructuredResume;
  targetJobId?: string;
}

function fromProfileToForm(profile: ReturnType<typeof useStore.getState>['userProfile']): ResumeForm {
  return {
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    city: profile.city,
    currentRole: profile.currentRole,
    desiredRole: profile.desiredRole,
    experience: profile.experience,
    education: profile.education,
    about: profile.about,
    skills: profile.skills.join(', '),
    languages: profile.languages.join(', '),
    projects: profile.projects,
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseStoredResume(value: string | null): StoredResumePayload | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredResumePayload>;
    if (parsed.version !== 2 || !parsed.data) return null;
    return parsed as StoredResumePayload;
  } catch {
    return null;
  }
}

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export default function Resume() {
  const [, navigate] = useLocation();
  const { t, lang } = useI18n();
  const {
    userProfile,
    onboardingAnswers,
    generatedResume,
    setGeneratedResume,
    setUserProfile,
  } = useStore();

  const persistedResume = useMemo(() => parseStoredResume(generatedResume), [generatedResume]);

  const [loading, setLoading] = useState(false);
  const [tone, setTone] = useState<ResumeTone>(persistedResume?.tone || 'neutral');
  const [form, setForm] = useState<ResumeForm>(() => fromProfileToForm(userProfile));
  const [resumeData, setResumeData] = useState<StructuredResume | null>(persistedResume?.data || null);
  const [selectedTargetJobId, setSelectedTargetJobId] = useState<string>(persistedResume?.targetJobId || '');
  const [isEditing, setIsEditing] = useState<boolean>(!persistedResume?.data);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const resumeRef = useRef<HTMLDivElement | null>(null);

  const selectedTargetJob = useMemo(
    () => jobs.find((item) => item.id === selectedTargetJobId) || null,
    [selectedTargetJobId]
  );

  const loadingPhrases = useMemo(
    () => [
      t('resume.loadingProfile'),
      t('resume.loadingTone'),
      t('resume.loadingLayout'),
      t('resume.loadingFinalize'),
    ],
    [t]
  );

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => {
      setLoadingIndex((prev) => (prev + 1) % loadingPhrases.length);
    }, 1100);
    return () => window.clearInterval(timer);
  }, [loading, loadingPhrases.length]);

  const updateForm = <K extends keyof ResumeForm>(key: K, value: ResumeForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const buildProfileDraft = () => ({
    name: form.name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    city: form.city.trim(),
    currentRole: form.currentRole.trim(),
    desiredRole: form.desiredRole.trim(),
    experience: form.experience.trim(),
    education: form.education.trim(),
    about: form.about.trim(),
    skills: splitCsv(form.skills),
    languages: splitCsv(form.languages),
    projects: form.projects.trim(),
  });

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const profileDraft = buildProfileDraft();

      setUserProfile(profileDraft);

      const structured = await generateStructuredResume(
        profileDraft as unknown as Record<string, unknown>,
        onboardingAnswers as unknown as Array<Record<string, string>>
        ,
        tone,
        lang,
        selectedTargetJob
          ? {
              title: selectedTargetJob.title,
              company: selectedTargetJob.company,
              requirements: selectedTargetJob.requirements,
              skills: selectedTargetJob.skills,
              description: selectedTargetJob.description,
            }
          : undefined
      );

      setResumeData(structured);
      setGeneratedResume(
        JSON.stringify({
          version: 2,
          tone,
          lang,
          data: structured,
          targetJobId: selectedTargetJobId || undefined,
        } satisfies StoredResumePayload)
      );
      setIsEditing(false);
    } catch {
      setResumeData(null);
      setGeneratedResume(null);
    }
    setLoading(false);
  }, [onboardingAnswers, setGeneratedResume, setUserProfile, tone, lang, form, selectedTargetJob, selectedTargetJobId]);

  const handleExportDoc = () => {
    if (!resumeData) return;

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(resumeData.fullName)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 28px; color: #111827; }
            h1 { margin: 0 0 6px; font-size: 28px; }
            h2 { margin: 20px 0 8px; font-size: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
            p, li { line-height: 1.5; font-size: 14px; }
            ul { margin: 0; padding-left: 18px; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(resumeData.fullName)}</h1>
          <p>${escapeHtml(resumeData.title)}</p>
          <p>${[resumeData.city, resumeData.email, resumeData.phone].filter(Boolean).map(escapeHtml).join(' • ')}</p>
          ${selectedTargetJob ? `<h2>${escapeHtml(t('resume.targetJob'))}</h2><p>${escapeHtml(`${selectedTargetJob.title} • ${selectedTargetJob.company}`)}</p>` : ''}
          <h2>${escapeHtml(t('resume.aboutMe'))}</h2>
          <p>${escapeHtml(resumeData.summary)}</p>
          <h2>${escapeHtml(t('resume.skills'))}</h2>
          <ul>${resumeData.skills.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          <h2>${escapeHtml(t('resume.strengths'))}</h2>
          <ul>${(resumeData.strengths || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          <h2>${escapeHtml(t('resume.achievements'))}</h2>
          <ul>${(resumeData.achievements || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          <h2>${escapeHtml(t('resume.tools'))}</h2>
          <ul>${(resumeData.tools || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          <h2>${escapeHtml(t('resume.experience'))}</h2>
          <p>${escapeHtml(resumeData.experience || t('common.notSpecified'))}</p>
          <h2>${escapeHtml(t('resume.education'))}</h2>
          <p>${escapeHtml(resumeData.education || t('common.notSpecified'))}</p>
          <h2>${escapeHtml(t('resume.languages'))}</h2>
          <ul>${resumeData.languages.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          <h2>${escapeHtml(t('resume.projects'))}</h2>
          <ul>${resumeData.projects.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resume_${resumeData.fullName || 'prof-ai'}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = async () => {
    if (!resumeData || !resumeRef.current) return;

    const canvas = await html2canvas(resumeRef.current, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;
    const targetWidth = pageWidth - margin * 2;
    const targetHeight = (canvas.height * targetWidth) / canvas.width;

    let heightLeft = targetHeight;
    let position = margin;

    pdf.addImage(imgData, 'PNG', margin, position, targetWidth, targetHeight, undefined, 'FAST');
    heightLeft -= pageHeight - margin * 2;

    while (heightLeft > 0) {
      position = margin - (targetHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, position, targetWidth, targetHeight, undefined, 'FAST');
      heightLeft -= pageHeight - margin * 2;
    }

    pdf.save(`resume_${resumeData.fullName || 'prof-ai'}.pdf`);
  };

  if (isEditing && !loading) {
    return (
      <div className="min-h-screen pt-16 bg-background">
        <div className="container py-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Button
              variant="outline"
              size="sm"
              className="mb-6 gap-1 bg-transparent"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('common.back')}
            </Button>

            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 mb-4">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">{t('resume.badge')}</span>
                </div>

                <h1 className="font-display text-3xl lg:text-5xl font-bold tracking-tight mb-4">
                  {t('resume.createTitle')}
                  <br />
                  <span className="text-primary">{t('resume.createAccent')}</span> {t('resume.createTail')}
                </h1>

                <p className="text-muted-foreground text-lg mb-8 max-w-lg">
                  {t('resume.subtitle')}
                </p>

                <div className="rounded-xl border border-border bg-white p-5 mb-6 space-y-4">
                  <h3 className="text-sm font-bold">{t('resume.profileData')}</h3>

                  <div className="grid md:grid-cols-2 gap-3">
                    <Input value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder={t('resume.name')} />
                    <Input value={form.city} onChange={(e) => updateForm('city', e.target.value)} placeholder={t('resume.city')} />
                    <Input value={form.email} onChange={(e) => updateForm('email', e.target.value)} placeholder="Email" />
                    <Input value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} placeholder={t('resume.phone')} />
                    <Input value={form.currentRole} onChange={(e) => updateForm('currentRole', e.target.value)} placeholder={t('resume.currentRole')} />
                    <Input value={form.desiredRole} onChange={(e) => updateForm('desiredRole', e.target.value)} placeholder={t('resume.desiredRole')} />
                  </div>

                  <Textarea value={form.about} onChange={(e) => updateForm('about', e.target.value)} placeholder={t('resume.aboutPlaceholder')} className="min-h-24" />

                  <div className="grid md:grid-cols-2 gap-3">
                    <Input value={form.experience} onChange={(e) => updateForm('experience', e.target.value)} placeholder={t('resume.experience')} />
                    <Input value={form.education} onChange={(e) => updateForm('education', e.target.value)} placeholder={t('resume.education')} />
                    <Input value={form.skills} onChange={(e) => updateForm('skills', e.target.value)} placeholder={t('resume.skillsCsv')} />
                    <Input value={form.languages} onChange={(e) => updateForm('languages', e.target.value)} placeholder={t('resume.languagesCsv')} />
                  </div>

                  <Textarea value={form.projects} onChange={(e) => updateForm('projects', e.target.value)} placeholder={t('resume.projectsPlaceholder')} className="min-h-20" />

                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2">{t('resume.targetJob')}</p>
                    <select
                      value={selectedTargetJobId}
                      onChange={(e) => setSelectedTargetJobId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-white text-sm"
                    >
                      <option value="">{t('resume.targetJobPlaceholder')}</option>
                      {jobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.title} • {job.company}
                        </option>
                      ))}
                    </select>
                    {selectedTargetJob ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t('resume.tailoredForJob')}: {selectedTargetJob.title}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2">{t('resume.toneTitle')}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant={tone === 'neutral' ? 'default' : 'outline'} size="sm" onClick={() => setTone('neutral')}>
                        {t('resume.toneNeutral')}
                      </Button>
                      <Button type="button" variant={tone === 'polite' ? 'default' : 'outline'} size="sm" onClick={() => setTone('polite')}>
                        {t('resume.tonePolite')}
                      </Button>
                      <Button type="button" variant={tone === 'bold' ? 'default' : 'outline'} size="sm" onClick={() => setTone('bold')}>
                        {t('resume.toneBold')}
                      </Button>
                    </div>
                  </div>
                </div>

                <Button
                  size="lg"
                  onClick={handleGenerate}
                  className="h-12 px-8 rounded-xl font-semibold gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  {t('resume.generate')}
                </Button>
              </div>

              <div className="hidden lg:block">
                <img
                  src={RESUME_IMG}
                  alt={t('resume.resumeAlt')}
                  className="w-full max-w-md mx-auto rounded-2xl"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen pt-16 bg-background">
        <div className="container py-12 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-white p-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-5 h-5 text-primary animate-pulse" />
              <h1 className="text-xl font-semibold">{t('resume.generating')}</h1>
            </div>

            <p className="text-sm text-muted-foreground mb-5">{loadingPhrases[loadingIndex]}</p>

            <div className="space-y-3">
              <motion.div
                className="h-2 rounded-full bg-primary/20 overflow-hidden"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
              >
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: '10%' }}
                  animate={{ width: `${25 + (loadingIndex + 1) * 18}%` }}
                  transition={{ duration: 0.9, ease: 'easeInOut' }}
                />
              </motion.div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-14 rounded-xl bg-muted/60 animate-pulse" />
                <div className="h-14 rounded-xl bg-muted/60 animate-pulse" />
                <div className="h-14 rounded-xl bg-muted/60 animate-pulse" />
                <div className="h-14 rounded-xl bg-muted/60 animate-pulse" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-16 bg-white">
      <div className="container py-10 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">{t('resume.myResume')}</h1>
              <p className="text-sm text-muted-foreground">{t('resume.generatedByAi')}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={loading}
                className="gap-1 bg-transparent"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {t('common.refresh')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="gap-1 bg-transparent"
              >
                <FileText className="w-3.5 h-3.5" />
                {t('resume.editData')}
              </Button>
              <Button
                size="sm"
                onClick={handleExportPdf}
                disabled={loading}
                className="gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                {t('resume.downloadPdf')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleExportDoc}
                disabled={loading}
                className="gap-1"
              >
                <FileType2 className="w-3.5 h-3.5" />
                {t('resume.downloadDoc')}
              </Button>
            </div>
          </div>

          {resumeData ? (
            <div ref={resumeRef} className="rounded-2xl border border-border bg-white p-8 lg:p-12 shadow-sm">
              <div className="border-b border-border pb-4 mb-6">
                <h2 className="text-3xl font-bold tracking-tight">{resumeData.fullName}</h2>
                <p className="text-primary font-medium mt-1">{resumeData.title}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {[resumeData.city, resumeData.email, resumeData.phone].filter(Boolean).join(' • ') || t('common.notSpecified')}
                </p>
                {selectedTargetJob ? (
                  <p className="text-sm text-muted-foreground mt-2">
                    <span className="font-medium text-foreground">{t('resume.targetJob')}:</span> {selectedTargetJob.title} • {selectedTargetJob.company}
                  </p>
                ) : null}
              </div>

              <div className="space-y-6">
                <section>
                  <h3 className="text-base font-semibold mb-2">{t('resume.aboutMe')}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{resumeData.summary}</p>
                </section>

                <section>
                  <h3 className="text-base font-semibold mb-2">{t('resume.skills')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {(resumeData.skills.length ? resumeData.skills : [t('common.notSpecified')]).map((skill) => (
                      <span key={skill} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-base font-semibold mb-2">{t('resume.strengths')}</h3>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    {((resumeData.strengths?.length ? resumeData.strengths : [t('common.notSpecified')])).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="text-base font-semibold mb-2">{t('resume.achievements')}</h3>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    {((resumeData.achievements?.length ? resumeData.achievements : [t('common.notSpecified')])).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="text-base font-semibold mb-2">{t('resume.tools')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {((resumeData.tools?.length ? resumeData.tools : [t('common.notSpecified')])).map((item) => (
                      <span key={item} className="px-2.5 py-1 rounded-full bg-muted text-xs font-medium text-foreground/80">
                        {item}
                      </span>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-base font-semibold mb-2">{t('resume.experience')}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{resumeData.experience || t('common.notSpecified')}</p>
                </section>

                <section>
                  <h3 className="text-base font-semibold mb-2">{t('resume.education')}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{resumeData.education || t('common.notSpecified')}</p>
                </section>

                <section>
                  <h3 className="text-base font-semibold mb-2">{t('resume.languages')}</h3>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    {(resumeData.languages.length ? resumeData.languages : [t('common.notSpecified')]).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="text-base font-semibold mb-2">{t('resume.projects')}</h3>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    {(resumeData.projects.length ? resumeData.projects : [t('common.notSpecified')]).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-white p-8 text-sm text-muted-foreground">
              {t('resume.noResumeYet')}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
