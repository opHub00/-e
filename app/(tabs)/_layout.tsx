import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { duration, easing, scale, travel, useNative } from '../../design/motion';
import { colors, radius, shadow, spacing, type } from '../../design/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { dismissActiveFocus } from '../../utils/webFocus';

type TabIconName = React.ComponentProps<typeof MaterialIcons>['name'];
const TAB_BAR_HEIGHT = 72;
const TAB_BAR_BOTTOM_PADDING = spacing.sm;

function TabIcon({ name, focused }: { name: TabIconName; focused: boolean }) {
  const reducedMotion = useReducedMotion();
  const focusProgress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      focusProgress.setValue(focused ? 1 : 0);
      return;
    }
    Animated.timing(focusProgress, {
      toValue: focused ? 1 : 0,
      duration: duration.content,
      easing: easing.standard,
      useNativeDriver: useNative,
    }).start();
  }, [focusProgress, focused, reducedMotion]);

  return (
    <Animated.View
      style={[
        styles.iconWrap,
        focused && styles.iconWrapActive,
        reducedMotion
          ? undefined
          : {
              transform: [
                {
                  scale: focusProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale.tabIdle, 1],
                  }),
                },
              ],
            },
      ]}
    >
      <MaterialIcons name={name} size={22} color={focused ? colors.primary : colors.textMuted} />
    </Animated.View>
  );
}

export default function AppTabsLayout() {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  return (
    <Tabs
      backBehavior="history"
      screenListeners={{ blur: dismissActiveFocus }}
      screenOptions={{
        animation: reducedMotion ? 'none' : 'fade',
        transitionSpec: {
          animation: 'timing',
          config: { duration: duration.content, easing: easing.standard },
        },
        // progress 는 focus 된 화면이 0, 좌/우로 벗어난 화면이 -1/1 이다.
        // 0 을 "등장 전"으로 읽으면 현재 화면이 계속 흐리게 남는다.
        sceneStyleInterpolator: ({ current }) => ({
          sceneStyle: {
            opacity: current.progress.interpolate({
              inputRange: [-1, 0, 1],
              outputRange: [0.96, 1, 0.96],
            }),
            transform: reducedMotion
              ? []
              : [
                  {
                    translateY: current.progress.interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: [travel.screen, 0, travel.screen],
                    }),
                  },
                ],
          },
        }),
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarStyle: [
          styles.bar,
          {
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingBottom: TAB_BAR_BOTTOM_PADDING + insets.bottom,
          },
        ],
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: '홈',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="discovery"
        options={{
          // Kakao Map 위에 transform/opacity 를 얹으면 compositing layer 가 생겨
          // drag 입력과 타일 렌더에 영향을 준다. scene 모션을 아예 걷어낸다.
          animation: 'none',
          transitionSpec: undefined,
          sceneStyleInterpolator: undefined,
          title: '청약찾기',
          tabBarIcon: ({ focused }) => <TabIcon name="travel-explore" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="preparation"
        options={{
          title: '준비',
          tabBarIcon: ({ focused }) => <TabIcon name="insights" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: 'AI',
          tabBarIcon: ({ focused }) => <TabIcon name="auto-awesome" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: '전체',
          tabBarIcon: ({ focused }) => <TabIcon name="apps" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: TAB_BAR_HEIGHT,
    paddingTop: spacing.xs,
    paddingBottom: TAB_BAR_BOTTOM_PADDING,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceHigh,
    backgroundColor: colors.surface,
    ...shadow.floating,
  },
  item: { paddingTop: 2 },
  label: { ...type.caption, fontFamily: type.label.fontFamily, fontSize: 10, lineHeight: 14 },
  iconWrap: {
    width: 42,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: colors.lavender },
});
