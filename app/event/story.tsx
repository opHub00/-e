import { router } from 'expo-router';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { ProductStory } from '../../features/eventKiosk/story/ProductStory';
import { markStorySeen } from '../../features/eventKiosk/story/storyPreference';

/** Product Story 를 주소로 바로 여는 화면. 첫 화면의 '완판e 소개 보기'와 같은 내용이다. */
export default function EventStory() {
  return (
    <ProductStory
      testID="event-story-route"
      onStart={() => {
        markStorySeen();
        useKioskStore.getState().reset();
        router.replace('/event/intro' as never);
      }}
      onSkip={() => {
        markStorySeen();
        router.replace('/event' as never);
      }}
    />
  );
}
