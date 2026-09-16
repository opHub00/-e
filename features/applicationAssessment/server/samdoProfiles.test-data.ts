/** Fictitious people; HWP-derived rule package is loaded by server tests only. */
import { createMinimalApplicantProfile, knownField } from '../../profile/domain.ts';
import type { AssessmentInput, SupplyType } from '../types.ts';
export function samdoApplicant(type: SupplyType = 'youth'): AssessmentInput {
  const profile=createMinimalApplicantProfile({name:'검증용 신청자',age:31,currentRegion:'제주특별자치도',preferredRegions:[]});
  profile.family.marriageStatus=knownField(type==='youth'?'single':'married');
  profile.housing.currentOwnership=knownField('no-home');
  profile.housing.previousOwnership=knownField(false);
  profile.housing.householdHasHome=knownField(false);
  profile.housing.householdDisqualifyingPreviousOwnership=knownField(false);
  profile.housing.hasSpecialSupplyRestriction=knownField(false);
  profile.subscriptionAccount.hasAccount=knownField(true);
  profile.income.incomeTaxPaymentYears=knownField(5);
  profile.income.workOrBusinessIncomeEligible=knownField(true);
  profile.household.memberCount=knownField(2);
  return {profile,details:{birthDate:'1995-09-14',currentResidence:'제주특별자치도',residenceStartDate:'2024-09-14',overseasStayHistory:[],
    subscriptionAccountOpenedAt:'2024-01-01',recognizedPaymentCount:24,recognizedDepositAmount:6000000,accountKindEligible:true,firstRank:true,
    isHouseholdHead:true,householdNoWinningFiveYears:true,monthlyIncome:2669354,householdIncome:5000000,incomeHouseholdSize:2,dualIncome:false,
    totalAssets:100000000,parentAssets:200000000,specialSupplyHistory:false,reWinningRestriction:false,specialExceptions:[],children:[],
    familyCategory:'married',marriageDate:'2025-09-14',firstMarriageDate:'2025-09-14',everMarried:true,housingDisposalDates:[]}};
}
