import type { Locale } from './translations';

export type QuizStepDef = {
  id: string;
  question: string;
  options: string[];
  /** If true, user can select multiple options */
  multiSelect?: boolean;
  /** Extra metadata per option */
  optionMeta?: Record<string, {
    subtitle?: string;
    badge?: string;
    offer?: string;
    highlighted?: boolean;
    preselected?: boolean;
    icon?: string;
  }>;
  /** Note displayed below all options */
  note?: string;
};

const STEPS_EN: QuizStepDef[] = [
  {
    id: 'goal',
    question: 'What is your primary research focus?',
    multiSelect: true,
    options: [
      'Metabolic & GLP-1 Pathway Research',
      'Myogenesis & Anabolic Signaling Research',
      'Neuropeptide & Cognitive Function Research',
      'Senescence & Longevity Pathway Research',
      'Tissue Repair & Regeneration Research',
      'HPA Axis & Sleep Regulation Research',
      'Endocrine & Hormonal Pathway Research',
    ],
    optionMeta: {
      'Metabolic & GLP-1 Pathway Research': { icon: '🔥' },
      'Myogenesis & Anabolic Signaling Research': { icon: '💪' },
      'Neuropeptide & Cognitive Function Research': { icon: '🧠' },
      'Senescence & Longevity Pathway Research': { icon: '⏳' },
      'Tissue Repair & Regeneration Research': { icon: '🩹' },
      'HPA Axis & Sleep Regulation Research': { icon: '😴' },
      'Endocrine & Hormonal Pathway Research': { icon: '⚡' },
    },
  },
  {
    id: 'experience',
    question: 'Your experience level',
    options: ['Beginner', 'Intermediate', 'Advanced'],
    optionMeta: {
      'Beginner': { icon: '🌱' },
      'Intermediate': { icon: '📊', preselected: true },
      'Advanced': { icon: '🔬' },
    },
  },
  {
    id: 'sex',
    question: 'Biological sex?',
    options: ['Male', 'Female'],
    optionMeta: {
      'Male': { icon: '🧔' },
      'Female': { icon: '👩' },
    },
  },
  {
    id: 'duration',
    question: 'How long would you like to continue?',
    options: ['1 Month', '3 Months', '6+ Months'],
    optionMeta: {
      '1 Month': {
        subtitle: 'Basic trial',
        icon: '📋',
      },
      '3 Months': {
        subtitle: 'Most popular option',
        badge: 'MOST POPULAR',
        offer: 'Receive 15% in store credit + free shipping',
        highlighted: true,
        preselected: true,
        icon: '⭐',
      },
      '6+ Months': {
        subtitle: 'Extended use',
        badge: 'BEST VALUE',
        offer: 'Receive 25% in store credit + free shipping',
        icon: '🏆',
      },
    },
    note: 'Most people choose 8–12 weeks of continued use.',
  },
  {
    id: 'preference',
    question: 'Choose your option',
    options: ['Basic Option', 'Complete Option'],
    optionMeta: {
      'Basic Option': {
        subtitle: '1–2 products • Simple approach',
        icon: '🎯',
      },
      'Complete Option': {
        subtitle: 'A combination of products for a broader approach',
        badge: 'Most Chosen',
        highlighted: true,
        preselected: true,
        icon: '🧬',
      },
    },
  },
];

const STEPS_ES: QuizStepDef[] = [
  {
    id: 'goal',
    question: '¿Cuál es tu enfoque principal de investigación?',
    multiSelect: true,
    options: [
      'Investigación metabólica y vía GLP-1',
      'Investigación de miogénesis y señalización anabólica',
      'Investigación de neuropéptidos y función cognitiva',
      'Investigación de senescencia y vías de longevidad',
      'Investigación de reparación y regeneración de tejidos',
      'Investigación del eje HPA y regulación del sueño',
      'Investigación de vías endocrinas y hormonales',
    ],
    optionMeta: {
      'Investigación metabólica y vía GLP-1': { icon: '🔥' },
      'Investigación de miogénesis y señalización anabólica': { icon: '💪' },
      'Investigación de neuropéptidos y función cognitiva': { icon: '🧠' },
      'Investigación de senescencia y vías de longevidad': { icon: '⏳' },
      'Investigación de reparación y regeneración de tejidos': { icon: '🩹' },
      'Investigación del eje HPA y regulación del sueño': { icon: '😴' },
      'Investigación de vías endocrinas y hormonales': { icon: '⚡' },
    },
  },
  {
    id: 'experience',
    question: 'Tu nivel de experiencia',
    options: ['Principiante', 'Intermedio', 'Avanzado'],
    optionMeta: {
      'Principiante': { icon: '🌱' },
      'Intermedio': { icon: '📊', preselected: true },
      'Avanzado': { icon: '🔬' },
    },
  },
  {
    id: 'sex',
    question: '¿Sexo biológico?',
    options: ['Hombre', 'Mujer'],
    optionMeta: {
      'Hombre': { icon: '🧔' },
      'Mujer': { icon: '👩' },
    },
  },
  {
    id: 'duration',
    question: '¿Por cuánto tiempo deseas continuar?',
    options: ['1 Mes', '3 Meses', '6+ Meses'],
    optionMeta: {
      '1 Mes': {
        subtitle: 'Prueba básica',
        icon: '📋',
      },
      '3 Meses': {
        subtitle: 'Opción más popular',
        badge: 'MÁS POPULAR',
        offer: 'Recibe 15% en crédito en tienda + envío gratis',
        highlighted: true,
        preselected: true,
        icon: '⭐',
      },
      '6+ Meses': {
        subtitle: 'Uso prolongado',
        badge: 'MÁXIMO VALOR',
        offer: 'Recibe 25% en crédito en tienda + envío gratis',
        icon: '🏆',
      },
    },
    note: 'La mayoría de personas elige entre 8–12 semanas de uso continuado.',
  },
  {
    id: 'preference',
    question: 'Elige tu opción',
    options: ['Opción básica', 'Opción completa'],
    optionMeta: {
      'Opción básica': {
        subtitle: '1–2 productos • Enfoque simple',
        icon: '🎯',
      },
      'Opción completa': {
        subtitle: 'Combinación de productos para un enfoque más amplio',
        badge: 'Más elegido',
        highlighted: true,
        preselected: true,
        icon: '🧬',
      },
    },
  },
];

export function getQuizSteps(locale: Locale): QuizStepDef[] {
  return locale === 'es' ? STEPS_ES : STEPS_EN;
}
