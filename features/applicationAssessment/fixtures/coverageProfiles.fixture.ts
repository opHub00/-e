// Synthetic profile locations used only by the offline/Staging coverage audit.
// Announcement-specific literals belong in the fixture layer, not the generic analyzer.
export const COVERAGE_PROFILE_REGIONS = {
  general: '제주특별자치도',
  newlywed: '경기도',
} as const;

/** Synthetic answers model a user confirming listing-only questions once. */
export const COVERAGE_LISTING_ANSWERS = {
  youth: {
    accountKindEligible: 'yes', youthPriorityTarget: 'yes', exceptions: 'no',
  },
  newlywed: {
    familyCategory: 'married', plannedMarriageWithinDeadline: 'yes',
    singleParentQualified: 'no', incomeHouseholdSize: '3', accountKindEligible: 'yes',
    noHomeSince: '2018-01-01', newlywedPriorityTarget: 'yes', exceptions: 'no',
  },
  firstHome: {
    unmarriedChildInHousehold: 'yes', incomeHouseholdSize: '3',
    householdNoWinningFiveYears: 'yes', accountKindEligible: 'yes', exceptions: 'no',
  },
} as const;
