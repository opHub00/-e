import { useLocalSearchParams } from 'expo-router';
import AssessmentScreen from '../../features/applicationAssessment/AssessmentScreen';
import { PortfolioScreen } from '../../features/applicationAssessment/PortfolioScreen';
import { userCentricFeatureFlags } from '../../features/userCentricAssessment/featureFlags';

export default function AssessmentOrPortfolioRoute() {
  const params = useLocalSearchParams<{ listingId?: string }>();
  return userCentricFeatureFlags().userCentricPortfolio && !params.listingId
    ? <PortfolioScreen />
    : <AssessmentScreen />;
}
