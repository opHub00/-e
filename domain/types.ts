export type Occupation = 'student' | 'worker' | 'etc';

export type UserProfile = {
  name: string;
  age: number;
  occupation: Occupation;
  region: string;
  hasSubscriptionAccount: boolean;
  accountMonths: number;
  monthlyPayment: number;
  isNoHomeOwner: boolean;
};

export type Years = 1 | 2 | 5;

export type FutureSnapshot = {
  years: Years;
  age: number;
  accountMonths: number;
  estimatedPaidAmount: number;
  preparationScore: number;
};

export type Stage = {
  emoji: string;
  label: string;
};
