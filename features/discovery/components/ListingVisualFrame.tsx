import { useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, tracking, type } from '../../../design/tokens';
import { listingVisualIcon, visualAfterError } from './listingVisual';
import type { ListingVisual } from './listingVisual';
import type { HousingType } from '../types';

type Props = {
  visual: ListingVisual;
  housingType: HousingType;
  /** thumbnail 은 목록용 작은 칸, hero 는 상세 상단용 큰 칸. */
  variant: 'thumbnail' | 'hero';
  /**
   * 칸 안에 함께 읽을 지역 이름.
   *
   * 자료가 없을 때 아이콘만 두면 26개 카드가 전부 같은 그림이 된다.
   * 공고마다 실제로 다른 값을 넣어야 목록에서 구분에 쓸 수 있다.
   */
  placeLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * 공고 시각 자료 한 칸.
 *
 * 크기는 호출부가 정하고 이 컴포넌트는 그 안을 채우기만 한다.
 * 세 종류가 모두 같은 상자를 쓰기 때문에 이미지가 늦게 와도, 못 와도
 * 카드와 상세의 높이가 변하지 않는다.
 */
export function ListingVisualFrame({ visual, housingType, variant, placeLabel, style }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const shown = failed ? visualAfterError(visual) : visual;
  const hero = variant === 'hero';

  if (shown.kind === 'map_preview') {
    /**
     * 좌표는 있지만 사진은 아니다.
     * 사진처럼 잘라 보여주면 실제 단지 모습으로 오해할 수 있어
     * 늘 핀과 이름표를 남기고 사진과 다른 바탕색을 쓴다.
     */
    return (
      <View style={[styles.frame, styles.mapFrame, hero && styles.heroRow, style]}>
        <MaterialIcons name="place" size={hero ? 28 : 22} color={colors.primary} />
        <View style={styles.copy}>
          {hero ? <Text style={styles.kindLabel}>{shown.label}</Text> : null}
          {placeLabel ? (
            <Text style={[styles.place, hero && styles.placeHero]} numberOfLines={1}>
              {placeLabel}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (shown.kind === 'none') {
    return (
      <View style={[styles.frame, styles.emptyFrame, hero && styles.heroRow, style]}>
        <MaterialIcons
          name={listingVisualIcon(housingType)}
          size={hero ? 28 : 22}
          color={colors.textSubtle}
        />
        {placeLabel ? (
          <Text style={[styles.place, styles.placeMuted, hero && styles.placeHero]} numberOfLines={1}>
            {placeLabel}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.frame, style]}>
      {/*
        불러오는 동안에도 같은 상자가 이미 자리를 잡고 있다.
        skeleton 을 이미지 위에 겹쳐 두어 교체 순간에 높이가 흔들리지 않는다.
      */}
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: shown.url }}
        style={styles.image as StyleProp<ImageStyle>}
        resizeMode="cover"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        // 목록에 공고가 많다. 화면에 들어오기 전 thumbnail 까지 내려받지 않는다.
        {...(Platform.OS === 'web' && !hero ? { loading: 'lazy' } : null)}
      />
      {loaded ? null : <View style={styles.skeleton} pointerEvents="none" />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: radius.cardSm,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  /** 위치를 아는 상태. 브랜드 보라 계열로 두어 정보가 있다는 걸 색으로도 알린다. */
  mapFrame: { backgroundColor: colors.primaryFixed },
  /** 큰 칸은 가로로 눕혀 이름표와 지역을 아이콘 옆에 둔다. */
  heroRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14 },
  copy: { minWidth: 0, alignItems: 'center', gap: 2 },
  kindLabel: { ...type.micro, color: colors.primary, letterSpacing: tracking.wide },
  place: { ...type.micro, color: colors.primary, maxWidth: '100%' },
  placeHero: { ...type.bodySmStrong, color: colors.text, letterSpacing: tracking.normal },
  placeMuted: { color: colors.textSubtle },
  /** 위치조차 모르는 상태. 색을 한 단계 죽여 구분한다. */
  emptyFrame: { backgroundColor: colors.surfaceContainer },
  image: { width: '100%', height: '100%' },
  /** 자리표시자와 같은 색이라 이미지가 붙는 순간이 튀지 않는다. */
  skeleton: { ...StyleSheet.absoluteFill, backgroundColor: colors.lavender },
});
