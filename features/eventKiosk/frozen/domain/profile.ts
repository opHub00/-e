export type Knowledge<T> =
  | { status: 'KNOWN'; value: T }
  | { status: 'UNKNOWN' }
  | { status: 'NOT_APPLICABLE' };

export const known = <T>(value: T): Knowledge<T> => ({ status: 'KNOWN', value });
export const unknown = <T>(): Knowledge<T> => ({ status: 'UNKNOWN' });
export const notApplicable = <T>(): Knowledge<T> => ({ status: 'NOT_APPLICABLE' });

export type MaritalStatus = 'SINGLE' | 'MARRIED' | 'ENGAGED' | 'DIVORCED' | 'WIDOWED';
export type HouseholdComposition =
  | 'SINGLE'
  | 'COUPLE'
  | 'COUPLE_WITH_CHILDREN'
  | 'ENGAGED_COUPLE'
  | 'SINGLE_PARENT'
  | 'MULTIGENERATIONAL'
  | 'OTHER';

export type ResidenceProfile = {
  region: Knowledge<string>;
  residentSince: Knowledge<string>;
  overseasStayRequiresReview: Knowledge<boolean>;
};

export type HousingProfile = {
  currentHomeCount: Knowledge<number>;
  everOwnedHome: Knowledge<boolean>;
  noHomeSince: Knowledge<string>;
};

export type SubscriptionAccountProfile = {
  hasAccount: Knowledge<boolean>;
  openedAt: Knowledge<string>;
  firstRank: Knowledge<boolean>;
  recognizedPaymentCount: Knowledge<number>;
  recognizedDepositAmountKrw: Knowledge<number>;
};

export type FinancialProfile = {
  monthlyIncomeKrw: Knowledge<number>;
  earnedOrBusinessIncome: Knowledge<boolean>;
  incomeTaxPaymentYears: Knowledge<number>;
  totalAssetsKrw: Knowledge<number>;
  /** Highest applicable vehicle value used by public-housing asset tests. */
  vehicleValueKrw?: Knowledge<number>;
};

export type AdultProfile = {
  id: string;
  birthDate: Knowledge<string>;
  maritalStatus: Knowledge<MaritalStatus>;
  marriageDate: Knowledge<string>;
  residence: ResidenceProfile;
  housing: HousingProfile;
  subscriptionAccount: SubscriptionAccountProfile;
  financial: FinancialProfile;
  specialSupplyHistory: Knowledge<boolean>;
  reWinningRestriction: Knowledge<boolean>;
};

/** Applicant and spouse intentionally remain distinct even when many fields match. */
export type ApplicantProfile = AdultProfile & {
  role: 'APPLICANT';
  isHouseholdHead: Knowledge<boolean>;
};

export type SpouseProfile = AdultProfile & {
  role: 'SPOUSE';
};

export type HouseholdMemberRelationship =
  | 'CHILD'
  | 'PARENT'
  | 'GRANDPARENT'
  | 'SIBLING'
  | 'OTHER';

export type HouseholdMemberProfile = {
  id: string;
  relationship: HouseholdMemberRelationship;
  birthDate: Knowledge<string>;
  unborn: boolean;
  coResident: Knowledge<boolean>;
  currentHomeCount: Knowledge<number>;
  monthlyIncomeKrw: Knowledge<number>;
  totalAssetsKrw: Knowledge<number>;
};

export type HouseholdProfile = {
  composition: HouseholdComposition;
  spouse?: SpouseProfile;
  members: HouseholdMemberProfile[];
  /**
   * Values the kiosk asks for as household totals. Keeping them as totals avoids
   * inventing a spouse/member split that the visitor never supplied.
   */
  declaredTotals?: {
    memberCount: Knowledge<number>;
    monthlyIncomeKrw: Knowledge<number>;
    totalAssetsKrw: Knowledge<number>;
    allNoHome: Knowledge<boolean>;
    everOwnedHomeByAnyMember: Knowledge<boolean>;
    specialSupplyHistoryByAnyMember: Knowledge<boolean>;
    reWinningRestrictionByAnyMember: Knowledge<boolean>;
  };
};

export type UserProfile = {
  schemaVersion: 1;
  profileId: string;
  applicant: ApplicantProfile;
  household: HouseholdProfile;
  /**
   * Notice-specific facts that cannot be inferred safely from ordinary profile data.
   * Every field is explicit Knowledge so an omitted kiosk answer remains UNKNOWN,
   * never false or zero.
   */
  eventQualifications?: Partial<{
    eligibleResident: Knowledge<boolean>;
    currentProgramTenant: Knowledge<boolean>;
    collegeStudent: Knowledge<boolean>;
    jobSeekerWithinTwoYears: Knowledge<boolean>;
    marriageBeforeMoveIn: Knowledge<boolean>;
    supportedSingleParent: Knowledge<boolean>;
    benefitCategory: Knowledge<'NONE' | 'BASIC_LIVELIHOOD' | 'BASIC_MEDICAL' | 'BASIC_HOUSING' | 'BASIC_EDUCATION' | 'NEAR_POOR' | 'SUPPORTED_SINGLE_PARENT'>;
    parentMonthlyIncomeKrw: Knowledge<number>;
    parentTotalAssetsKrw: Knowledge<number>;
    parentVehicleValueKrw: Knowledge<number>;
    parentNoHome: Knowledge<boolean>;
    applicantDisabilityPoints: Knowledge<number>;
    youthIncomeUnderHalfThreshold: Knowledge<boolean>;
    housingVulnerable: Knowledge<boolean>;
    severeDisabilityInHousehold: Knowledge<boolean>;
    supportsSeniorParent: Knowledge<boolean>;
    applicantRegisteredDisabled: Knowledge<boolean>;
    rentBurdenPercent: Knowledge<number>;
    workHistoryMonths: Knowledge<number>;
    generalRentalPriorityCategory: Knowledge<'NONE' | 'PRIORITY_1' | 'UDO_PRIORITY_2'>;
    lhCollegeIncomeEligible: Knowledge<boolean>;
  }>;
  consent: {
    assessment: boolean;
    temporaryResultSession: boolean;
  };
};

export function readKnown<T>(field: Knowledge<T>): T | undefined {
  return field.status === 'KNOWN' ? field.value : undefined;
}

export function assertUserProfile(profile: UserProfile): void {
  if (profile.schemaVersion !== 1) throw new Error('Unsupported UserProfile schema version');
  if (!profile.profileId.trim()) throw new Error('profileId is required');
  if (!profile.applicant.id.trim()) throw new Error('applicant.id is required');
  if (profile.applicant.role !== 'APPLICANT') throw new Error('Applicant role mismatch');
  if (profile.household.spouse?.role !== undefined && profile.household.spouse.role !== 'SPOUSE') {
    throw new Error('Spouse role mismatch');
  }
  const ids = [profile.applicant.id, profile.household.spouse?.id, ...profile.household.members.map(member => member.id)]
    .filter((id): id is string => id !== undefined);
  if (new Set(ids).size !== ids.length) throw new Error('Household person ids must be unique');
  if (!profile.consent.assessment) throw new Error('Assessment consent is required');
}
