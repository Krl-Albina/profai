import { Button } from '@/components/ui/button';
import { AIThinking } from '@/components/LoadingSkeleton';
import { useStore } from '@/store/useStore';
import { jobs } from '@/data/jobs';
import { conductInterview, analyzeInterview } from '../lib/ai';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Send, BarChart3, BarChart2, ArrowLeft, Sparkles,
  TrendingUp, AlertTriangle, CheckCircle, XCircle, RefreshCw, Mic, MicOff, Volume2, VolumeX, Bot, Wifi, WifiOff
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useI18n } from '@/contexts/I18nContext';
import { useSpeechRecognition, useSpeechSynthesis } from '@/hooks/useSpeech';
import { AvatarChat } from '@myned-ai/avatar-chat-widget';

const INTERVIEW_IMG = 'https://private-us-east-1.manuscdn.com/sessionFile/jEzBJwYrZx1oONmR73Dibg/sandbox/w9MJXfqlFpTQrySgI2073N-img-3_1772022775000_na1fn_aW50ZXJ2aWV3LWlsbHVzdHJhdGlvbg.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvakV6Qkp3WXJaeDFvT05tUjczRGliZy9zYW5kYm94L3c5TUpYZnFsRnBUUXJ5U2dJMjA3M04taW1nLTNfMTc3MjAyMjc3NTAwMF9uYTFmbl9hVzUwWlhKMmFXVjNMV2xzYkhWemRISmhkR2x2YmcucG5nP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=gcTbxLHRtPJji4QQqdmUKhHjPc4jzBYEfz2mmSg77VoazxFIUbyOExBQ9BR9~zVwVBb8wApmDzCs87pVOG-3tFpS3vxLw1PdxXjRRcqAtsCYRk7FVXRPjaw5KFJLApexX-Q~ztC241HHi6rS87Ah8FzTgiR-sD-PKI2xGBLDIWG5On1kLOFl5npLRmkRiv0wQYrSQBTq24G5sJJ9Ur3ncoIcKcL-tM9LuDaCnCC-kDZlZyBca~aWeQLB-O~orboMdigrGC83VI-WWVNwpP6dLvqKAMibWZ-VeIummub4t5XsrknVd84R7g-ceMzGbFy8~TRzuEmpwRH6c2Tirs~dog__';

export default function Interview() {
  const [, navigate] = useLocation();
  const { t, lang } = useI18n();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const jobIdParam = params.get('jobId');

  const {
    interviewMessages, addInterviewMessage, interviewActive, setInterviewActive,
    interviewAnalytics, setInterviewAnalytics, clearInterview, setInterviewJobId, interviewJobId
  } = useStore();

  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(jobIdParam || interviewJobId || '');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [interviewMode, setInterviewMode] = useState<'text' | 'avatar' | null>(null);
  const [avatarConnected, setAvatarConnected] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const avatarContainerRef = useRef<HTMLDivElement>(null);

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interviewMessages]);

  useEffect(() => {
    if (!selectedJobId && interviewJobId) {
      setSelectedJobId(interviewJobId);
    }
  }, [interviewJobId, selectedJobId]);

  // If page was reloaded mid-interview and mode was lost, go back to mode selector
  useEffect(() => {
    if (interviewActive && interviewMode === null) {
      setInterviewActive(false);
    }
  }, []);

  const buildFallbackAnalytics = () => ({
    confidenceScore: 72,
    anxietyLevel: 'средний',
    responseQuality: 68,
    strengths: ['Хорошая структура ответов', 'Релевантный опыт'],
    weaknesses: ['Можно добавить больше конкретных примеров'],
    opportunities: ['Добавить количеимые результаты и KPI в ответы', 'Подготовить 2-3 кейса под требования вакансии'],
    threats: ['Слишком общие формулировки без примеров', 'Потеря структуры ответа при сложных вопросах'],
    overallFeedback: 'Хорошее собеседование! Рекомендуем подготовить больше конкретных примеров из опыта.',
    detailedAnalysis: lang === 'kk'
      ? 'Толық AI-талдау үшін Gemini токенін қосыңыз (VITE_AI_API_KEY).'
      : 'Для полного AI-анализа добавьте токен Gemini (VITE_AI_API_KEY).',
  });

  const normalizeAnalytics = (raw: unknown) => {
    const fallback = buildFallbackAnalytics();
    const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const toList = (field: string, fallbackList: string[]) =>
      Array.isArray(value[field])
        ? value[field].map((item) => String(item).trim()).filter(Boolean)
        : fallbackList;

    return {
      confidenceScore: Number.isFinite(Number(value.confidenceScore)) ? Number(value.confidenceScore) : fallback.confidenceScore,
      anxietyLevel: String(value.anxietyLevel || fallback.anxietyLevel),
      responseQuality: Number.isFinite(Number(value.responseQuality)) ? Number(value.responseQuality) : fallback.responseQuality,
      strengths: toList('strengths', fallback.strengths),
      weaknesses: toList('weaknesses', fallback.weaknesses),
      opportunities: toList('opportunities', fallback.opportunities),
      threats: toList('threats', fallback.threats),
      overallFeedback: String(value.overallFeedback || fallback.overallFeedback),
      detailedAnalysis: String(value.detailedAnalysis || fallback.detailedAnalysis),
    };
  };

  const {
    text: recognizedText,
    interimText,
    isListening,
    isSupported: speechInputSupported,
    startListening,
    stopListening,
    resetText,
  } = useSpeechRecognition({
    language: 'ru-RU',
    continuous: true,
    interimResults: true,
  });

  const draftMessage = (input || recognizedText || interimText).trim();
  const canSend = Boolean(draftMessage) && !aiLoading && Boolean(selectedJob);

  const {
    isSpeaking,
    isSupported: speechOutputSupported,
    speak,
    stop: stopSpeech,
  } = useSpeechSynthesis();

  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [autoVoice, setAutoVoice] = useState(true);

  useEffect(() => {
    if (!recognizedText) return;
    setInput(recognizedText);
  }, [recognizedText]);

  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, [stopSpeech]);

  useEffect(() => {
    if (!isSpeaking && speakingMessageId) {
      setSpeakingMessageId(null);
    }
  }, [isSpeaking, speakingMessageId]);

  // Avatar widget initialization
  useEffect(() => {
    if (!interviewActive || interviewMode !== 'avatar') return;
    if (!avatarContainerRef.current) return;

    let baseServerUrl = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_AVATAR_SERVER_URL || 'ws://localhost:8765/ws';
    // Normalize URL: convert http(s) → ws(s), add wss:// if no protocol
    baseServerUrl = baseServerUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    if (!baseServerUrl.startsWith('ws://') && !baseServerUrl.startsWith('wss://')) {
      baseServerUrl = 'wss://' + baseServerUrl;
    }
    // Add /ws path if missing
    if (!baseServerUrl.includes('/ws')) {
      baseServerUrl = baseServerUrl.replace(/\/?$/, '/ws');
    }
    const origin = window.location.origin;

    // Pass job context to server via query params
    const jobTitle = encodeURIComponent(selectedJob?.title ?? '');
    const company = encodeURIComponent(selectedJob?.company ?? '');
    const serverUrl = `${baseServerUrl}?job_title=${jobTitle}&company=${company}`;

    const chat = AvatarChat.init({
      container: avatarContainerRef.current,
      serverUrl,
      position: 'inline',
      authEnabled: false,
      primaryColor: '#6B2FD9',
      startCollapsed: false,
      enableVoice: true,
      enableText: true,
      width: window.innerWidth,
      height: window.innerHeight - 56,
      avatarUrl: `${origin}/nyx.zip`,
      assetsBaseUrl: `${origin}/`,
      suggestions: [
        'Расскажите о своём опыте',
        'Какие технологии вы знаете?',
        'Опишите ваш самый сложный проект',
      ],
      customStyles: `
        avatar-chat-widget { display: block; width: 100% !important; height: 100% !important; }
        .widget-inline-container, .widget-root, .widget-panel { width: 100% !important; height: 100% !important; border-radius: 0 !important; box-shadow: none !important; }
        [class*="branding"], [class*="powered"], [class*="footer"], a[href*="myned"] { display: none !important; }
      `,
      onConnectionChange: (connected: boolean) => setAvatarConnected(connected),
      onReady: () => {
        setAvatarConnected(true);
        // Rename "Nyx Assistant" → "Диана" and hide Myned AI branding inside Shadow DOM
        setTimeout(() => {
          const container = avatarContainerRef.current;
          if (!container) return;
          const widget = container.querySelector('avatar-chat-widget');
          const shadow = (widget as HTMLElement & { shadowRoot: ShadowRoot | null })?.shadowRoot;
          if (shadow) {
            // Rename title
            const title = shadow.querySelector('h3');
            if (title && title.textContent?.includes('Nyx')) title.textContent = 'Диана';
            // Hide branding
            const style = document.createElement('style');
            style.textContent = '[class*="branding"],[class*="powered"],[class*="footer"],a[href*="myned"]{display:none!important;}';
            shadow.appendChild(style);
          }
        }, 500);
      },
    });

    return () => {
      setAvatarConnected(false);
      chat.destroy();
    };
  }, [interviewActive, interviewMode, selectedJob]);

  const startInterview = useCallback(async () => {
    if (!selectedJob) return;
    clearInterview();
    setInterviewJobId(selectedJob.id);
    setInterviewActive(true);
    setShowAnalytics(false);

    // In avatar mode the widget handles the conversation
    if (interviewMode === 'avatar') return;

    setAiLoading(true);

    try {
      const response = await conductInterview(
        selectedJob.title,
        selectedJob.requirements,
        [],
        true
      );
      addInterviewMessage({
        id: Date.now().toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      });
      if (autoVoice && speechOutputSupported) {
        await speak(response, 'ru-RU');
      }
    } catch {
      const fallbackMessage = lang === 'kk'
        ? 'Сәлеметсіз бе! Сұхбатты бастайық. Өзіңіз және тәжірибеңіз туралы айтып беріңіз.'
        : 'Здравствуйте! Давайте начнём собеседование. Расскажите о себе и вашем опыте.';

      addInterviewMessage({
        id: Date.now().toString(),
        role: 'assistant',
        content: fallbackMessage,
        timestamp: Date.now(),
      });
      if (autoVoice && speechOutputSupported) {
        await speak(fallbackMessage, 'ru-RU');
      }
    }
    setAiLoading(false);
  }, [selectedJob, clearInterview, setInterviewJobId, setInterviewActive, addInterviewMessage, autoVoice, speechOutputSupported, speak, lang, interviewMode]);

  const sendMessage = async () => {
    if (!draftMessage || aiLoading || !selectedJob) return;

    if (isListening) {
      stopListening();
    }

    const userMsg = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: draftMessage,
      timestamp: Date.now(),
    };
    addInterviewMessage(userMsg);
    setInput('');
    resetText();
    setAiLoading(true);

    try {
      const allMessages = [...interviewMessages, userMsg];
      const response = await conductInterview(
        selectedJob.title,
        selectedJob.requirements,
        allMessages.map((m) => ({ role: m.role, content: m.content })),
        false
      );
      addInterviewMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      });
      if (autoVoice && speechOutputSupported) {
        await speak(response, 'ru-RU');
      }
    } catch {
      const fallbackMessage = lang === 'kk'
        ? 'Жақсы жауап! Жалғастырайық. Ең маңызды жобаңыз туралы айтып беріңіз.'
        : 'Хороший ответ! Давайте продолжим. Расскажите о вашем самом значимом проекте.';

      addInterviewMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fallbackMessage,
        timestamp: Date.now(),
      });
      if (autoVoice && speechOutputSupported) {
        await speak(fallbackMessage, 'ru-RU');
      }
    }
    setAiLoading(false);
  };

  const toggleListening = () => {
    if (!speechInputSupported || aiLoading) return;

    if (isListening) {
      if (interimText.trim()) {
        setInput((prev) => `${prev} ${interimText}`.trim());
      }
      stopListening();
      return;
    }

    resetText();
    startListening();
  };

  const playAssistantMessage = async (messageId: string, content: string) => {
    if (!speechOutputSupported) return;

    if (isSpeaking && speakingMessageId === messageId) {
      stopSpeech();
      setSpeakingMessageId(null);
      return;
    }

    setSpeakingMessageId(messageId);
    const started = await speak(content, 'ru-RU');
    if (!started) {
      setSpeakingMessageId(null);
    }
  };

  const finishInterview = async () => {
    setInterviewActive(false);
    setAnalyzing(true);

    if (!selectedJob) {
      setInterviewAnalytics(buildFallbackAnalytics());
      setAnalyzing(false);
      setShowAnalytics(true);
      return;
    }

    try {
      const result = await analyzeInterview(interviewMessages, selectedJob.title);
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const analytics = JSON.parse(cleaned);
      setInterviewAnalytics(normalizeAnalytics(analytics));
    } catch {
      setInterviewAnalytics(buildFallbackAnalytics());
    }
    setAnalyzing(false);
    setShowAnalytics(true);
  };
  if (analyzing && !showAnalytics) {
    return (
      <div className="min-h-screen pt-16 bg-white">
        <div className="container py-10 max-w-3xl">
          <div className="rounded-2xl border border-border bg-white p-6">
            <AIThinking text={t('interview.analyzingInterview')} />
          </div>
        </div>
      </div>
    );
  }

  if (!interviewActive && !showAnalytics && interviewMode === null) {
    return (
      <div className="min-h-screen pt-16 bg-background">
        <div className="container py-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Button
              variant="outline"
              size="sm"
              className="mb-8 gap-1 bg-transparent"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Назад
            </Button>

            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 mb-4">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">Мок-собеседование</span>
              </div>
              <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight mb-3">
                Выберите формат<br />
                <span className="text-primary">собеседования</span>
              </h1>
              <p className="text-muted-foreground text-lg">
                Потренируйтесь перед настоящим интервью
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              {/* Text Chat */}
              <button
                type="button"
                onClick={() => setInterviewMode('text')}
                className="group text-left rounded-2xl border-2 border-border bg-white p-6 hover:border-primary hover:shadow-lg transition-all duration-200 focus:outline-none focus:border-primary"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
                  <MessageSquare className="w-6 h-6 text-primary" />
                </div>
                <h2 className="font-display font-bold text-lg mb-2">Текстовый чат</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  Общайтесь с AI-интервьюером текстом или через голосовой ввод. Получите детальный анализ по окончании.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs bg-green-50 text-green-700 border border-green-100 rounded-full px-2.5 py-1">Анализ ответов</span>
                  <span className="text-xs bg-green-50 text-green-700 border border-green-100 rounded-full px-2.5 py-1">Голосовой ввод</span>
                  <span className="text-xs bg-green-50 text-green-700 border border-green-100 rounded-full px-2.5 py-1">Работает сразу</span>
                </div>
              </button>

              {/* 3D Avatar */}
              <button
                type="button"
                onClick={() => setInterviewMode('avatar')}
                className="group text-left rounded-2xl border-2 border-border bg-white p-6 hover:border-primary hover:shadow-lg transition-all duration-200 focus:outline-none focus:border-primary"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
                  <Bot className="w-6 h-6 text-primary" />
                </div>
                <h2 className="font-display font-bold text-lg mb-2">3D Аватар</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  Реалистичное интервью с 3D-аватаром: мимика, lip-sync и голос в реальном времени.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs bg-purple-50 text-purple-700 border border-purple-100 rounded-full px-2.5 py-1">3D Gaussian Splatting</span>
                  <span className="text-xs bg-purple-50 text-purple-700 border border-purple-100 rounded-full px-2.5 py-1">Lip-sync</span>
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-2.5 py-1">Нужен сервер</span>
                </div>
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (!interviewActive && !showAnalytics) {
    return (
      <div className="min-h-screen pt-16 bg-background">
        <div className="container py-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <Button
                variant="outline"
                size="sm"
                className="gap-1 bg-transparent"
                onClick={() => setInterviewMode(null)}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Формат
              </Button>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10">
                {interviewMode === 'avatar' ? (
                  <Bot className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                )}
                <span className="text-xs font-medium text-primary">
                  {interviewMode === 'avatar' ? '3D Аватар' : 'Текстовый чат'}
                </span>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 mb-4">
                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">{t('interview.aiMock')}</span>
                </div>

                <h1 className="font-display text-3xl lg:text-5xl font-bold tracking-tight mb-4">
                  {t('interview.prepareTitle')}
                  <br />
                  <span className="text-primary">{t('interview.prepareAccent')}</span>
                </h1>

                <p className="text-muted-foreground text-lg mb-8 max-w-lg">
                  {t('interview.prepareSubtitle')}
                </p>

                <div className="space-y-3 mb-8">
                  <label className="text-sm font-medium">{t('interview.chooseJob')}</label>
                  <select
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm focus:border-primary outline-none"
                  >
                    <option value="">{t('interview.chooseJobPlaceholder')}</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title} — {j.company}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  size="lg"
                  disabled={!selectedJobId}
                  onClick={startInterview}
                  className="h-12 px-8 rounded-xl font-semibold gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {t('interview.startInterview')}
                </Button>
              </div>

              <div className="hidden lg:block">
                <img
                  src={INTERVIEW_IMG}
                  alt={t('interview.aiMock')}
                  className="w-full max-w-md mx-auto rounded-2xl"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }
  if (showAnalytics && interviewAnalytics) {
    return (
      <div className="min-h-screen pt-16 bg-white">
        <div className="container py-10 max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 mb-6">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">{t('interview.analyticsBadge')}</span>
            </div>

            <h1 className="font-display text-3xl font-bold tracking-tight mb-8">
              {t('interview.analyticsTitle')}
            </h1>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="rounded-2xl border border-border bg-white p-6 text-center">
                <div className="font-display text-4xl font-extrabold text-primary mb-1">
                  {interviewAnalytics.confidenceScore}%
                </div>
                <div className="text-xs text-muted-foreground font-medium">{t('interview.confidence')}</div>
              </div>
              <div className="rounded-2xl border border-border bg-white p-6 text-center">
                <div className="font-display text-4xl font-extrabold text-primary mb-1">
                  {interviewAnalytics.responseQuality}%
                </div>
                <div className="text-xs text-muted-foreground font-medium">{t('interview.answerQuality')}</div>
              </div>
              <div className="rounded-2xl border border-border bg-white p-6 text-center">
                <div className={`font-display text-2xl font-extrabold mb-1 ${
                  interviewAnalytics.anxietyLevel === 'низкий' ? 'text-green-600' :
                  interviewAnalytics.anxietyLevel === 'средний' ? 'text-amber-500' : 'text-red-500'
                }`}>
                  {interviewAnalytics.anxietyLevel}
                </div>
                <div className="text-xs text-muted-foreground font-medium">{t('interview.anxietyLevel')}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-white p-6 mb-6">
              <h3 className="font-display font-bold mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                {t('interview.overallFeedback')}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {interviewAnalytics.overallFeedback}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <div className="rounded-2xl border border-green-100 bg-green-50/50 p-6">
                <h3 className="font-display font-bold mb-3 flex items-center gap-2 text-green-700">
                  <CheckCircle className="w-4 h-4" />
                  {t('interview.strengths')}
                </h3>
                <ul className="space-y-2">
                  {interviewAnalytics.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                      <TrendingUp className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-6">
                <h3 className="font-display font-bold mb-3 flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="w-4 h-4" />
                  {t('interview.growthZones')}
                </h3>
                <ul className="space-y-2">
                  {interviewAnalytics.weaknesses.map((w, i) => (
                    <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                      <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-6">
                <h3 className="font-display font-bold mb-3 flex items-center gap-2 text-blue-700">
                  <TrendingUp className="w-4 h-4" />
                  {t('interview.opportunities')}
                </h3>
                <ul className="space-y-2">
                  {(interviewAnalytics.opportunities || []).map((item, i) => (
                    <li key={i} className="text-sm text-blue-700 flex items-start gap-2">
                      <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-6">
                <h3 className="font-display font-bold mb-3 flex items-center gap-2 text-rose-700">
                  <XCircle className="w-4 h-4" />
                  {t('interview.threats')}
                </h3>
                <ul className="space-y-2">
                  {(interviewAnalytics.threats || []).map((item, i) => (
                    <li key={i} className="text-sm text-rose-700 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {interviewAnalytics.detailedAnalysis && (
              <div className="rounded-2xl border border-border bg-white p-6 mb-8">
                <h3 className="font-display font-bold mb-3">{t('interview.detailed')}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {interviewAnalytics.detailedAnalysis}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { clearInterview(); setShowAnalytics(false); }}
                className="gap-2 bg-transparent"
              >
                <RefreshCw className="w-4 h-4" />
                {t('interview.retry')}
              </Button>
              <Button onClick={() => navigate('/dashboard')} className="gap-2">
                {t('interview.toDashboard')}
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (interviewActive && interviewMode === 'avatar') {
    return (
      <div className="flex flex-col bg-white" style={{ height: '100dvh' }}>
        <div className="border-b border-border bg-white/80 backdrop-blur-md sticky top-0 z-30 shrink-0" style={{ paddingTop: '64px' }}>
          <div className="container flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-bold font-display">{selectedJob?.title}</div>
                <div className="text-xs text-muted-foreground">{selectedJob?.company}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                avatarConnected
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                {avatarConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {avatarConnected ? 'Подключён' : 'Нет соединения'}
              </div>
              <Button
                size="sm"
                onClick={finishInterview}
                className="gap-1 bg-primary text-white hover:bg-primary/90"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Завершить и получить анализ
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setInterviewActive(false); setInterviewMode(null); clearInterview(); }}
                className="gap-1 bg-transparent"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Выйти
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-stretch justify-center relative overflow-hidden">
          <div
            ref={avatarContainerRef}
            id="avatar-chat-container"
            className="w-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-16 flex flex-col bg-white">
      <div className="border-b border-border bg-white/80 backdrop-blur-md sticky top-16 z-30">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-bold font-display">{selectedJob?.title}</div>
              <div className="text-xs text-muted-foreground">{selectedJob?.company}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const next = !autoVoice;
                setAutoVoice(next);
                if (!next) {
                  stopSpeech();
                  setSpeakingMessageId(null);
                }
              }}
              className="gap-1 bg-transparent"
              title={autoVoice ? t('interview.autoVoiceOn') : t('interview.autoVoiceOff')}
            >
              {autoVoice ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {autoVoice ? t('interview.autoVoiceOn') : t('interview.autoVoiceOff')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={finishInterview}
              className="gap-1 bg-transparent"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              {t('interview.finish')}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="container py-6 max-w-3xl space-y-4">
          <AnimatePresence>
            {interviewMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-white rounded-br-md'
                      : 'bg-muted/70 text-foreground rounded-bl-md'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.role === 'assistant' && speechOutputSupported && (
                    <button
                      type="button"
                      onClick={() => playAssistantMessage(msg.id, msg.content)}
                      className="mt-2 inline-flex items-center gap-1 rounded-md border border-border/60 bg-white/70 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isSpeaking && speakingMessageId === msg.id ? (
                        <VolumeX className="w-3 h-3" />
                      ) : (
                        <Volume2 className="w-3 h-3" />
                      )}
                      {isSpeaking && speakingMessageId === msg.id ? t('interview.stopAudio') : t('interview.listenAnswer')}
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {(isListening || interimText) && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <div className="font-medium mb-1">{isListening ? t('interview.listening') : t('interview.recognized')}</div>
              <div className="whitespace-pre-wrap">{interimText || recognizedText || t('interview.listening')}</div>
            </div>
          )}

          {aiLoading && <AIThinking text={t('interview.interviewerThinking')} />}
          {analyzing && <AIThinking text={t('interview.analyzingInterview')} />}
          <div ref={chatEndRef} />
        </div>
      </div>

      <div className="border-t border-border bg-white/80 backdrop-blur-md sticky bottom-0">
        <div className="container py-4 max-w-3xl">
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={toggleListening}
              disabled={!speechInputSupported || aiLoading}
              className={`h-12 w-12 rounded-xl p-0 ${isListening ? 'border-red-300 text-red-600' : ''}`}
              title={isListening ? t('interview.stopListening') : t('interview.startListening')}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canSend && sendMessage()}
              placeholder={t('interview.answerPlaceholder')}
              className="flex-1 h-12 px-5 rounded-xl border border-border bg-white text-sm focus:border-primary outline-none transition-all"
              disabled={aiLoading}
              autoFocus
            />
            <Button
              onClick={sendMessage}
              disabled={!canSend}
              className="h-12 w-12 rounded-xl p-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
