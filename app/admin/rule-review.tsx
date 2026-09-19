import { useRouter } from 'expo-router';
import { RuleReviewConsole } from '../../features/assessmentRuleReview/ui/RuleReviewConsole';

/**
 * Admin-only rule review console.
 *
 * There is no admin authentication yet, so this route is deliberately unreachable
 * from user navigation: nothing links to it and it is not a tab. It runs the real
 * review service over a fixture seed in memory — no Supabase client, no database
 * read or write, and no activation.
 *
 * The root layout registers this route with `headerShown: false`.
 */
export default function AdminRuleReviewRoute() {
  const router = useRouter();
  return (
    <RuleReviewConsole onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
  );
}
