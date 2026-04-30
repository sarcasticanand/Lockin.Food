export interface MacroTargets {
  bmi: number;
  bmr: number;
  tdee: number;
  target_kcal: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  weekly_rate_kg: number;
  workout_day_kcal: number;
  rest_day_kcal: number;
}

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  active: 1.55,
  very_active: 1.725,
};

export function calculateMacros(profile: {
  height_cm: number;
  weight_kg: number;
  age: number;
  sex: string;
  activity_level: string;
  goal: string;
  condition?: string;
  target_kg?: number;
  target_weeks?: number;
}): MacroTargets {
  const heightM = profile.height_cm / 100;
  const bmi = Math.round((profile.weight_kg / (heightM * heightM)) * 10) / 10;

  // Mifflin-St Jeor BMR
  let bmr: number;
  if (profile.sex === 'male') {
    bmr = 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age + 5;
  } else {
    bmr = 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age - 161;
  }

  const tdee = Math.round(bmr * (ACTIVITY_MULTIPLIERS[profile.activity_level] || 1.2));

  let target_kcal: number;
  let weekly_rate_kg = 0;
  let protein_per_kg: number;
  let fat_pct: number;

  switch (profile.goal) {
    case 'fat_loss': {
      weekly_rate_kg = profile.target_kg && profile.target_weeks
        ? Math.min(profile.target_kg / profile.target_weeks, 1.0)
        : 0.5;
      const daily_deficit = weekly_rate_kg * 1100; // 7700 kcal/kg ÷ 7 days ≈ 1100
      target_kcal = Math.max(
        Math.round(tdee - daily_deficit),
        Math.max(Math.round(bmr), 1200)
      );
      protein_per_kg = 1.8; // preserve muscle during deficit
      fat_pct = 0.25;
      break;
    }
    case 'muscle_gain': {
      target_kcal = Math.round(tdee + 300); // lean bulk surplus
      protein_per_kg = 2.0; // max muscle protein synthesis
      fat_pct = 0.25;
      weekly_rate_kg = 0.25;
      break;
    }
    case 'clean_eating': {
      target_kcal = tdee;
      protein_per_kg = 1.4;
      fat_pct = 0.30;
      break;
    }
    case 'manage_condition': {
      // Diabetes: 10% caloric reduction
      target_kcal = profile.condition === 'diabetes' ? Math.round(tdee * 0.9) : tdee;
      protein_per_kg = 1.2;
      fat_pct = 0.30;
      break;
    }
    default:
      target_kcal = tdee;
      protein_per_kg = 1.4;
      fat_pct = 0.30;
  }

  const target_protein_g = Math.round(profile.weight_kg * protein_per_kg);
  const fat_kcal = Math.round(target_kcal * fat_pct);
  const target_fat_g = Math.round(fat_kcal / 9);
  const protein_kcal = target_protein_g * 4;
  const target_carbs_g = Math.round(Math.max((target_kcal - protein_kcal - fat_kcal) / 4, 50));

  return {
    bmi,
    bmr: Math.round(bmr),
    tdee,
    target_kcal,
    target_protein_g,
    target_carbs_g,
    target_fat_g,
    weekly_rate_kg: Math.round(weekly_rate_kg * 100) / 100,
    workout_day_kcal: Math.round(target_kcal * 1.12),
    rest_day_kcal: target_kcal,
  };
}

export function getBMILabel(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: '#D4A574' };
  if (bmi < 25) return { label: 'Healthy', color: '#7BA088' };
  if (bmi < 30) return { label: 'Overweight', color: '#D4A574' };
  return { label: 'Obese', color: '#C66B5C' };
}

export function getWeeklyRateLabel(weekly_rate_kg: number, goal: string): string {
  if (goal === 'fat_loss') {
    if (weekly_rate_kg <= 0.5) return 'Steady & sustainable';
    if (weekly_rate_kg <= 0.75) return 'Moderate pace';
    return 'Aggressive — ensure adequate protein';
  }
  if (goal === 'muscle_gain') {
    return 'Lean bulk pace';
  }
  return '';
}
