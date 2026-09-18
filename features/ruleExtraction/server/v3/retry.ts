export type RetryDecision={action:'FAIL'|'SKIP_WITH_BACKOFF'|'RETRY_ONCE'|'SPLIT_ONCE';retryable:boolean;reason:string};
export function v3RetryDecision(error:string,attempt:number):RetryDecision {
  if(/^HTTP_(400|401|403)$/.test(error))return {action:'FAIL',retryable:false,reason:'요청 또는 권한 오류는 동일 payload로 재시도하지 않습니다.'};
  if(error==='HTTP_429')return {action:'SKIP_WITH_BACKOFF',retryable:false,reason:'benchmark task를 건너뛰고 장기 backoff를 적용합니다.'};
  if(error==='HTTP_503')return attempt<1?{action:'RETRY_ONCE',retryable:true,reason:'일시 오류를 한 번만 재시도합니다.'}:{action:'FAIL',retryable:false,reason:'503 재시도 한도를 소진했습니다.'};
  if(error==='INCOMPLETE_OUTPUT')return attempt<1?{action:'SPLIT_ONCE',retryable:true,reason:'context/task를 더 작게 나눠 한 번 재시도합니다.'}:{action:'FAIL',retryable:false,reason:'분할 재시도 한도를 소진했습니다.'};
  return {action:'FAIL',retryable:false,reason:'분류되지 않은 오류입니다.'};
}
