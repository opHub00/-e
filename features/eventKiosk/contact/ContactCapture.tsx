import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { KioskButton } from '../ui/controls';
import { k } from '../ui/theme';
import { EVENT_CONTACT_PROVISIONAL_RETENTION_DAYS, normalizeKoreanMobile } from './contract';

type State = 'idle' | 'sending' | 'saved' | 'error';

/** Optional. The eligibility result and QR remain visible when this form is skipped. */
export function ContactCapture({ token, claim }: { token: string; claim: string }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    if (state === 'sending' || state === 'saved') return;
    if (!name.trim() || !normalizeKoreanMobile(phone) || !consent) {
      setError('성함, 올바른 휴대폰 번호, 개인정보 수집·이용 동의를 확인해 주세요.'); return;
    }
    setState('sending'); setError('');
    try {
      const response = await fetch('/event-api/consultation-contacts', { method: 'POST',
        headers: { 'content-type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ token, claim, name: name.trim(), phone, consent: true }) });
      if (!response.ok) {
        setState('error');
        setError(response.status === 409 ? '이 결과에는 다른 연락처가 이미 등록되어 있어요.'
          : response.status === 410 || response.status === 404 ? '결과 링크가 만료됐어요. QR을 다시 만들어 주세요.'
            : response.status === 503 ? '연락처 저장이 아직 준비되지 않았어요. QR로 결과를 확인해 주세요.'
              : '입력 내용을 확인해 주세요.');
        return;
      }
      setState('saved'); setName(''); setPhone('');
    } catch { setState('error'); setError('연결이 원활하지 않아 등록하지 못했어요. QR 결과는 계속 확인할 수 있어요.'); }
  };

  return (
    <View style={styles.card} testID="event-contact-capture">
      <Text style={styles.title}>결과 받아보기</Text>
      <Text style={styles.caption}>연락처 등록은 선택 사항이에요. 동의하지 않아도 분석 결과와 QR은 그대로 볼 수 있어요.</Text>
      {state === 'saved' ? (
        <Text style={styles.saved} testID="event-contact-saved">연락처가 등록됐어요. SMS 발송은 아직 연결되지 않았으며, 지금은 QR 링크로 결과를 확인해 주세요.</Text>
      ) : (
        <>
          <TextInput testID="event-contact-name" accessibilityLabel="성함" placeholder="성함" value={name} onChangeText={setName}
            autoComplete="name" maxLength={80} style={styles.input} />
          <TextInput testID="event-contact-phone" accessibilityLabel="휴대폰 번호" placeholder="휴대폰 번호 (010-0000-0000)" value={phone} onChangeText={setPhone}
            keyboardType="phone-pad" autoComplete="tel" maxLength={20} style={styles.input} />
          <MotionPressable testID="event-contact-consent" accessibilityRole="checkbox" accessibilityState={{ checked: consent }}
            onPress={() => setConsent(value => !value)} style={styles.consent}>
            <Text style={styles.consentText}>{consent ? '☑' : '□'} 개인정보 수집·이용에 동의합니다 (선택)</Text>
          </MotionPressable>
          <Text style={styles.caption}>수집 항목: 성함·휴대폰 번호. 목적: 분석 결과 제공과 상담 이력 확인. 임시 보유기간: 등록 후 {EVENT_CONTACT_PROVISIONAL_RETENTION_DAYS}일 (정책 확정 전 행사 운영값). 만료 후 삭제 대상이며, 실제 보존 정책은 별도 확정됩니다.</Text>
          <KioskButton testID="event-contact-submit" label={state === 'sending' ? '등록 중…' : '연락처 등록하기'} onPress={() => { void submit(); }} disabled={state === 'sending'} />
          {error ? <Text testID="event-contact-error" style={styles.error}>{error}</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', gap: 12, padding: 16, borderRadius: k.radius.md, backgroundColor: k.colors.surface },
  title: { ...k.type.bodyLgStrong, color: k.colors.text },
  caption: { ...k.type.caption, color: k.colors.textMuted },
  input: { minHeight: 48, borderWidth: 1, borderColor: k.colors.outline, borderRadius: 8, paddingHorizontal: 12,
    ...k.type.body, color: k.colors.text, backgroundColor: k.colors.surface },
  consent: { minHeight: 48, justifyContent: 'center' },
  consentText: { ...k.type.bodyStrong, color: k.colors.text },
  saved: { ...k.type.bodyStrong, color: k.colors.primary },
  error: { ...k.type.caption, color: k.tint.amber.fg },
});
