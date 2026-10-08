/** 마지막으로 보인 입력 단계. 다음 단계가 앞으로 왔는지 뒤로 왔는지만 알면 된다. */
let lastStepIndex = -1;

export function stepDirection(index: number): 1 | -1 | 0 {
  // 첫 단계는 언제나 새 체험의 시작일 수 있어 방향 없이 화면 진입 motion 만 쓴다(이전 방문자의 기억을 쓰지 않는다).
  const direction = index === 0 || lastStepIndex < 0 || index === lastStepIndex ? 0 : index > lastStepIndex ? 1 : -1;
  lastStepIndex = index;
  return direction;
}
