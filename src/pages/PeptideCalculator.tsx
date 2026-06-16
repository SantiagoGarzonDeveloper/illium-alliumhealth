import { useMemo, useState } from 'react';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const VIAL_PRESETS = [5, 10, 15, 20] as const;
const WATER_PRESETS = [1, 2, 3, 4] as const;
/** U-100 insulin: 100 units per 1 mL */
const UNITS_PER_ML = 100;

function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
        active
          ? 'border-brand-600 bg-brand-50 text-brand-900 shadow-sm'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
      )}
    >
      {children}
    </button>
  );
}

export function PeptideCalculator() {
  const { t } = useI18n();
  const syringePresets = useMemo(
    () => [
      { label: t('calculator.syringe30'), units: 30, ml: 0.3 },
      { label: t('calculator.syringe50'), units: 50, ml: 0.5 },
      { label: t('calculator.syringe100'), units: 100, ml: 1 },
    ],
    [t]
  );
  const [vialMg, setVialMg] = useState(5);
  const [vialCustom, setVialCustom] = useState(false);
  const [vialCustomVal, setVialCustomVal] = useState('5');

  const [waterMl, setWaterMl] = useState(1);
  const [waterCustom, setWaterCustom] = useState(false);
  const [waterCustomVal, setWaterCustomVal] = useState('1');

  const [syringeIdx, setSyringeIdx] = useState(0);
  const [syringeCustom, setSyringeCustom] = useState(false);
  const [syringeUnitsCustom, setSyringeUnitsCustom] = useState('30');

  const [doseUnit, setDoseUnit] = useState<'mcg' | 'mg'>('mcg');
  const [doseInput, setDoseInput] = useState('250');

  const vialActive = vialCustom ? Number(vialCustomVal) || 0 : vialMg;
  const waterActive = waterCustom ? Number(waterCustomVal) || 0 : waterMl;
  const syringe = useMemo(() => {
    if (syringeCustom) {
      const u = Math.max(1, Number(syringeUnitsCustom) || 30);
      return { label: `${u}u`, units: u, ml: u / UNITS_PER_ML };
    }
    return syringePresets[syringeIdx] ?? syringePresets[0];
  }, [syringeCustom, syringeIdx, syringePresets, syringeUnitsCustom]);

  const doseNumber = Number(doseInput.replace(',', '.')) || 0;
  const doseMg = doseUnit === 'mcg' ? doseNumber / 1000 : doseNumber;

  const { drawMl, units, overCapacity, doseLabel } = useMemo(() => {
    if (vialActive <= 0 || waterActive <= 0 || doseMg <= 0) {
      return { drawMl: 0, units: 0, overCapacity: false, doseLabel: `${doseNumber} ${doseUnit}` };
    }
    const ml = (doseMg / vialActive) * waterActive;
    const u = ml * UNITS_PER_ML;
    const roundedU = Math.round(u * 10) / 10;
    const over = roundedU > syringe.units + 1e-6;
    return {
      drawMl: ml,
      units: roundedU,
      overCapacity: over,
      doseLabel: `${doseNumber} ${doseUnit}`,
    };
  }, [doseMg, doseNumber, doseUnit, syringe.units, vialActive, waterActive]);

  const fillPct = syringe.units > 0 ? Math.min(100, (units / syringe.units) * 100) : 0;

  const tickCount = 5;
  const ticks = useMemo(() => {
    const max = syringe.units;
    return Array.from({ length: tickCount }, (_, i) => Math.round((max * i) / (tickCount - 1)));
  }, [syringe.units]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-slate-100 to-white">
      <div className="border-b-4 border-brand-600 bg-gradient-to-r from-slate-950 via-brand-950 to-slate-900 px-4 py-10 text-center shadow-xl">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-4 inline-flex rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-7 py-2.5 text-[11px] font-black tracking-[0.28em] text-white shadow-[0_0_28px_rgba(59,130,246,0.55)] ring-1 ring-white/20">
            {t('calculator.badge')}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-brand-200/90">{t('calculator.researchTool')}</p>
          <h1 className="mt-3 text-3xl font-extrabold text-white md:text-4xl drop-shadow-sm">{t('calculator.title')}</h1>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-100 bg-white p-7 shadow-lg shadow-slate-200/50">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-10 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-[10px] font-bold text-brand-800">
                  {t('calculator.vialPreset')}
                </div>
                <h2 className="text-sm font-bold text-slate-800">{t('calculator.step1')}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {VIAL_PRESETS.map((m) => (
                  <Pill
                    key={m}
                    active={!vialCustom && vialMg === m}
                    onClick={() => {
                      setVialCustom(false);
                      setVialMg(m);
                    }}
                  >
                    {m}mg
                  </Pill>
                ))}
              </div>
              <Button
                type="button"
                variant={vialCustom ? 'primary' : 'outline'}
                className="mt-3 w-full"
                onClick={() => setVialCustom(true)}
              >
                {t('calculator.custom')}
              </Button>
              {vialCustom && (
                <div className="mt-3">
                  <label className="text-xs font-medium text-slate-600">mg</label>
                  <Input
                    inputMode="decimal"
                    value={vialCustomVal}
                    onChange={(e) => setVialCustomVal(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-100 bg-white p-7 shadow-lg shadow-slate-200/50">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-[9px] font-bold leading-tight text-red-800">
                  {t('calculator.waterPreset')}
                </div>
                <h2 className="text-sm font-bold text-slate-800">{t('calculator.step2')}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {WATER_PRESETS.map((m) => (
                  <Pill
                    key={m}
                    active={!waterCustom && waterMl === m}
                    onClick={() => {
                      setWaterCustom(false);
                      setWaterMl(m);
                    }}
                  >
                    {m}mL
                  </Pill>
                ))}
              </div>
              <Button
                type="button"
                variant={waterCustom ? 'primary' : 'outline'}
                className="mt-3 w-full"
                onClick={() => setWaterCustom(true)}
              >
                {t('calculator.custom')}
              </Button>
              {waterCustom && (
                <div className="mt-3">
                  <label className="text-xs font-medium text-slate-600">mL</label>
                  <Input
                    inputMode="decimal"
                    value={waterCustomVal}
                    onChange={(e) => setWaterCustomVal(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-100 bg-white p-7 shadow-lg shadow-slate-200/50">
              <h2 className="mb-4 text-sm font-bold text-slate-800">{t('calculator.step3')}</h2>
              <div className="flex flex-wrap gap-2">
                {syringePresets.map((s, i) => (
                  <Pill
                    key={s.label}
                    active={!syringeCustom && syringeIdx === i}
                    onClick={() => {
                      setSyringeCustom(false);
                      setSyringeIdx(i);
                    }}
                  >
                    {s.label}
                  </Pill>
                ))}
              </div>
              <Button
                type="button"
                variant={syringeCustom ? 'primary' : 'outline'}
                className="mt-3 w-full"
                onClick={() => setSyringeCustom(true)}
              >
                {t('calculator.custom')}
              </Button>
              {syringeCustom && (
                <div className="mt-3">
                  <label className="text-xs font-medium text-slate-600">{t('calculator.maxUnitsLabel')}</label>
                  <Input
                    inputMode="numeric"
                    value={syringeUnitsCustom}
                    onChange={(e) => setSyringeUnitsCustom(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-100 bg-white p-7 shadow-lg shadow-slate-200/50">
              <h2 className="mb-4 text-sm font-bold text-slate-800">{t('calculator.step4')}</h2>
              <div className="mb-4 inline-flex overflow-hidden rounded-full border border-slate-800 bg-slate-900 p-1">
                <button
                  type="button"
                  className={cn(
                    'rounded-full px-6 py-2 text-sm font-semibold transition-colors',
                    doseUnit === 'mcg' ? 'bg-brand-600 text-white' : 'text-slate-300'
                  )}
                  onClick={() => setDoseUnit('mcg')}
                >
                  {t('calculator.mcg')}
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-full px-6 py-2 text-sm font-semibold transition-colors',
                    doseUnit === 'mg' ? 'bg-brand-600 text-white' : 'text-slate-300'
                  )}
                  onClick={() => setDoseUnit('mg')}
                >
                  {t('calculator.mg')}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  inputMode="decimal"
                  value={doseInput}
                  onChange={(e) => setDoseInput(e.target.value)}
                  className="text-lg font-semibold"
                />
                <span className="text-sm font-medium text-slate-600">{doseUnit}</span>
              </div>
            </section>
          </div>

          <div>
            <div className="rounded-2xl border-2 border-brand-500 bg-white p-6 shadow-lg">
              <p className="text-center text-xs font-bold uppercase tracking-widest text-brand-600">{t('calculator.yourResults')}</p>
              <div className="my-6 flex items-center justify-center gap-4 text-slate-400">
                <div className="flex flex-col items-center text-[10px] font-bold text-brand-900">
                  <div className="mb-1 flex h-14 w-10 items-center justify-center rounded-lg border-2 border-brand-300 bg-brand-50">
                    {vialActive}mg
                  </div>
                  <span className="text-slate-500">{t('calculator.vialPreset')}</span>
                </div>
                <span className="text-2xl">+</span>
                <div className="flex flex-col items-center text-[10px] font-bold text-red-900">
                  <div className="mb-1 flex h-14 w-10 items-center justify-center rounded-lg border-2 border-red-300 bg-red-50">BAC</div>
                  <span className="text-slate-500">{waterActive}mL</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                  <p className="text-xs font-semibold uppercase text-slate-500">{t('calculator.dose')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{doseLabel}</p>
                </div>
                <div className="rounded-xl border-2 border-brand-600 bg-brand-50/50 p-4 text-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-brand-700">{t('calculator.drawTo')}</p>
                  <p className="mt-2 text-5xl md:text-6xl font-black text-brand-700 tabular-nums">{Number.isFinite(units) ? units : '—'}</p>
                  <p className="text-xs font-medium text-brand-800">{t('calculator.units')}</p>
                </div>
              </div>

              <div className="mt-8">
                <div className="mb-1 flex justify-between px-0.5 text-[10px] font-semibold tabular-nums text-slate-500">
                  {ticks.map((v) => (
                    <span key={v}>{v}</span>
                  ))}
                </div>
                <div className="relative h-5 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-inner">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 transition-all"
                    style={{ width: `${fillPct}%` }}
                  />
                  <div
                    className="absolute top-0 h-full w-0.5 bg-slate-900/80 shadow"
                    style={{ left: `calc(${fillPct}% - 1px)` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-500">
                  <span>0u</span>
                  <span>
                    {syringe.units}u ({syringe.ml}mL)
                  </span>
                </div>
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  {drawMl > 0
                    ? `${(drawMl * 1000).toFixed(2)} ${t('calculator.volumeLine')} (${drawMl.toFixed(4)} ${t('calculator.mlLine')})`
                    : '—'}
                </p>
              </div>

              {overCapacity && (
                <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  {t('calculator.overSyringe')}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-bold">{t('calculator.disclaimerTitle')}</p>
              <p className="mt-1 text-xs leading-relaxed">{t('calculator.disclaimerBody')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
