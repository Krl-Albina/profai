import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, BrainCircuit, ScanSearch, Rocket } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useI18n } from '@/contexts/I18nContext';

const featureIcons = [BrainCircuit, ScanSearch, Rocket];

function MouseTrailCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const points: Array<{ x: number; y: number; life: number; size: number }> = [];
    let rafId = 0;
    let lastX = -9999;
    let lastY = -9999;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;

      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      const distance = Math.hypot(dx, dy);
      if (distance < 10) return;

      lastX = event.clientX;
      lastY = event.clientY;
      points.unshift({
        x: event.clientX,
        y: event.clientY,
        life: 1,
        size: 7 + Math.random() * 2,
      });

      if (points.length > 18) {
        points.pop();
      }
    };

    const onPointerLeave = () => {
      lastX = -9999;
      lastY = -9999;
    };

    const render = () => {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (let index = points.length - 1; index >= 0; index -= 1) {
        const point = points[index];
        point.life -= 0.035;

        if (point.life <= 0) {
          points.splice(index, 1);
          continue;
        }

        const alpha = Math.max(0, point.life * 0.45);
        const radius = point.size * (0.75 + point.life * 0.4);
        const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
        gradient.addColorStop(0, `rgba(56,170,245,${alpha})`);
        gradient.addColorStop(0.65, `rgba(48,211,151,${alpha * 0.7})`);
        gradient.addColorStop(1, 'rgba(48,211,151,0)');

        context.fillStyle = gradient;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
      }

      rafId = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    rafId = window.requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[1]" />;
}

export default function Home() {
  const [, navigate] = useLocation();
  const { setUserRole } = useStore();
  const { t } = useI18n();

  const handleSeeker = () => {
    setUserRole('seeker');
    navigate('/onboarding');
  };



  return (
    <div className="relative min-h-screen overflow-hidden bg-[#dfe4ec]">
      <div className="pointer-events-none absolute inset-0 opacity-65 [background-image:radial-gradient(circle,_rgba(124,133,149,0.18)_1.6px,_transparent_1.6px)] [background-size:42px_42px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(55,170,244,0.16),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(38,212,142,0.14),transparent_30%)]" />

      <MouseTrailCanvas />

      <div className="container relative z-10 pt-20">
        <div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center pb-12 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/70 px-4 py-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-primary">{t('home.badge')}</span>
          </div>

          <h1 className="font-display text-6xl font-extrabold tracking-tight text-[#3f4a5c] sm:text-7xl lg:text-8xl">
            <span>Prof</span>
            <span className="bg-gradient-to-r from-[#26d48e] to-[#37aaf4] bg-clip-text text-transparent">.ai</span>
          </h1>

          <p className="mt-4 max-w-2xl text-lg text-[#556173]">
            {t('home.subtitle')}
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Button size="lg" className="h-14 min-w-[220px] rounded-xl text-base font-semibold" onClick={handleSeeker}>
              {t('home.start')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

          </div>
        </div>

        <section className="pb-14">
          <h2 className="text-center font-display text-3xl font-bold text-[#3f4a5c]">{t('home.featuresTitle')}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-[#617086]">
            {t('home.featuresSubtitle')}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {featureIcons.map((Icon, index) => {
              const titleKey = (`home.feature${index + 1}Title`) as const;
              const textKey = (`home.feature${index + 1}Text`) as const;
              return (
                <div
                  key={titleKey}
                  className="rounded-2xl border border-white/60 bg-white/72 p-6 shadow-sm backdrop-blur-sm"
                >
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-display text-xl font-semibold text-[#3f4a5c]">{t(titleKey)}</h3>
                  <p className="mt-2 text-sm text-[#617086]">{t(textKey)}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="pb-16">
          <div className="rounded-3xl border border-white/65 bg-white/70 p-8 backdrop-blur-sm">
            <h2 className="font-display text-3xl font-bold text-[#3f4a5c]">{t('home.howTitle')}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-[#edf4ff] p-4 text-[#4a5a71]">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Шаг 1</p>
                <p className="mt-2 font-semibold">{t('home.step1')}</p>
              </div>
              <div className="rounded-xl bg-[#eefaf5] p-4 text-[#4a5a71]">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Шаг 2</p>
                <p className="mt-2 font-semibold">{t('home.step2')}</p>
              </div>
              <div className="rounded-xl bg-[#f1f5fb] p-4 text-[#4a5a71]">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Шаг 3</p>
                <p className="mt-2 font-semibold">{t('home.step3')}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
