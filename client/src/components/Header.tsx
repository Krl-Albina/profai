import { useStore } from '@/store/useStore';
import { Sparkles, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useI18n } from '@/contexts/I18nContext';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [homeHeaderUnlocked, setHomeHeaderUnlocked] = useState(false);
  const { userRole, onboardingComplete } = useStore();
  const [location] = useLocation();
  const { t, lang, setLang } = useI18n();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const key = 'prof-ai-home-header-unlocked';
    const saved = window.sessionStorage.getItem(key) === '1';
    if (saved) {
      setHomeHeaderUnlocked(true);
      return;
    }

    const onScroll = () => {
      if (window.scrollY > 20) {
        setHomeHeaderUnlocked(true);
        window.sessionStorage.setItem(key, '1');
        window.removeEventListener('scroll', onScroll);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const shouldHideHeaderOnHome = location === '/' && !homeHeaderUnlocked;

  const navItems = userRole === 'super_admin'
    ? [
        { href: '/admin', label: t('header.admin') },
      ]
    : userRole === 'employer'
    ? [
        { href: '/employer/create-job', label: t('header.employerCreate') },
        { href: '/employer/candidates', label: t('header.employerCandidates') },
      ]
    : onboardingComplete
    ? [
        { href: '/dashboard', label: t('header.dashboard') },
        { href: '/jobs', label: t('header.jobs') },
      ]
    : [];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 border-b border-border bg-white/80 backdrop-blur-md transition-all duration-500 ${shouldHideHeaderOnHome ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}
    >
      <div className="container flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-display text-xl font-bold text-foreground tracking-tight">
            Prof.ai
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <div className="flex items-center gap-1 rounded-full border border-border bg-white/70 px-1 py-1">
            <button
              onClick={() => setLang('ru')}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${lang === 'ru' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t('language.ru')}
            </button>
            <button
              onClick={() => setLang('kk')}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${lang === 'kk' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t('language.kk')}
            </button>
          </div>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium transition-colors no-underline ${
                location === item.href
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          className="md:hidden p-2"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-white border-b border-border">
          <nav className="container py-4 flex flex-col gap-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('language.label')}:</span>
              <button
                onClick={() => setLang('ru')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${lang === 'ru' ? 'bg-primary text-white' : 'bg-muted text-foreground'}`}
              >
                {t('language.ru')}
              </button>
              <button
                onClick={() => setLang('kk')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${lang === 'kk' ? 'bg-primary text-white' : 'bg-muted text-foreground'}`}
              >
                {t('language.kk')}
              </button>
            </div>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-foreground no-underline py-2"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
