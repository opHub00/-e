param([Parameter(Mandatory = $true)][string]$SupabaseCli)

$ErrorActionPreference = 'Stop'
$expectedStaging = 'krkeiytshxpqojrlrmsx'
$expectedProduction = 'ypdreeipoxcztbxtiklt'
if ($env:WANPANE_ENV -ne 'staging' -or $env:VERCEL_ENV -eq 'production' -or
    $env:SUPABASE_STAGING_PROJECT_REF -ne $expectedStaging -or
    $env:SUPABASE_PRODUCTION_PROJECT_REF -ne $expectedProduction -or
    $env:SUPABASE_STAGING_URL -ne ('https://' + $expectedStaging + '.supabase.co') -or
    -not $env:SUPABASE_STAGING_ANON_KEY -or -not $env:SUPABASE_STAGING_SERVICE_ROLE_KEY) {
  throw 'STAGING_IDENTITY_REQUIRED'
}

$base = $env:SUPABASE_STAGING_URL
$adminHeaders = @{ apikey = $env:SUPABASE_STAGING_SERVICE_ROLE_KEY; Authorization = 'Bearer ' + $env:SUPABASE_STAGING_SERVICE_ROLE_KEY }
$userId = $null
$membershipGranted = $false
$report = [ordered]@{ stagingRef = $expectedStaging; unauthenticated = $null; nonAdmin = $null; admin = $null; postDenied = $null; cleanup = 'NOT_STARTED' }

function Invoke-ConsoleCheck {
  param([string]$Token)
  $env:STAGING_QA_ACCESS_TOKEN = $Token
  $script = @'
import { handleProductV3ConsoleRequest, authorizeProductV3Admin, loadProductV3StagingSnapshot } from './features/adminConsole/server/consoleApi.ts';
const headers = process.env.STAGING_QA_ACCESS_TOKEN ? { authorization: 'Bearer ' + process.env.STAGING_QA_ACCESS_TOKEN } : {};
const dependencies = {
  authorize: token => authorizeProductV3Admin(token, process.env),
  loadSnapshot: () => loadProductV3StagingSnapshot(process.env),
};
const get = await handleProductV3ConsoleRequest({ method: 'GET', headers }, dependencies);
const post = await handleProductV3ConsoleRequest({ method: 'POST', headers }, dependencies);
console.log(JSON.stringify({ get: get.status, post: post.status, notices: get.status === 200 ? get.body.notices.length : null }));
'@
  $output = & node --experimental-strip-types --input-type=module -e $script
  if ($LASTEXITCODE -ne 0) { throw 'CONSOLE_CHECK_FAILED' }
  return $output | ConvertFrom-Json
}

try {
  $env:SUPABASE_TELEMETRY_DISABLED = '1'
  $report.unauthenticated = (Invoke-ConsoleCheck '').get
  $email = 'product-v3-qa+' + [guid]::NewGuid().ToString('N') + '@example.invalid'
  $password = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $created = Invoke-RestMethod -Method Post -Uri ($base + '/auth/v1/admin/users') -Headers $adminHeaders -ContentType 'application/json' -Body (@{ email = $email; password = $password; email_confirm = $true } | ConvertTo-Json -Compress)
  $userId = [string]$created.id
  if ($userId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'QA_USER_ID_INVALID' }
  $signedIn = Invoke-RestMethod -Method Post -Uri ($base + '/auth/v1/token?grant_type=password') -Headers @{ apikey = $env:SUPABASE_STAGING_ANON_KEY } -ContentType 'application/json' -Body (@{ email = $email; password = $password } | ConvertTo-Json -Compress)
  $accessToken = [string]$signedIn.access_token
  if (-not $accessToken) { throw 'QA_SIGN_IN_FAILED' }
  $report.nonAdmin = (Invoke-ConsoleCheck $accessToken).get

  $grantSql = "begin; insert into public.assessment_review_members(user_id,role,enabled) values ('$userId'::uuid,'admin',true); insert into public.assessment_review_membership_audit_log(action,actor_role,target_user_id,new_role,reason) values ('GRANT','migration','$userId'::uuid,'admin','Temporary Product V3 staging admin E2E'); commit;"
  & $SupabaseCli db query --linked --project-ref $expectedStaging $grantSql | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'QA_ROLE_GRANT_FAILED' }
  $membershipGranted = $true
  $adminResult = Invoke-ConsoleCheck $accessToken
  $report.admin = $adminResult.get
  $report.postDenied = $adminResult.post
  $report.noticeCount = $adminResult.notices
  $env:STAGING_QA_EMAIL = $email
  $env:STAGING_QA_PASSWORD = $password
  $browserOutput = & node --experimental-strip-types scripts/product-v3-staging-console-e2e.mjs
  $browserReport = $browserOutput | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { $report.browserProbe = $browserReport; throw 'ADMIN_BROWSER_E2E_FAILED' }
  $report.browserConnected = $browserReport.connected
  $report.browserRoutes = $browserReport.routes
  $report.browserViewports = $browserReport.viewports
} finally {
  if ($membershipGranted) {
    $revokeSql = "begin; update public.assessment_review_members set enabled=false,updated_at=now() where user_id='$userId'::uuid; insert into public.assessment_review_membership_audit_log(action,actor_role,target_user_id,previous_role,reason) values ('REVOKE','migration','$userId'::uuid,'admin','Temporary Product V3 staging admin E2E complete'); commit;"
    & $SupabaseCli db query --linked --project-ref $expectedStaging $revokeSql | Out-Null
    if ($LASTEXITCODE -ne 0) { $report.cleanup = 'MEMBERSHIP_REVOKE_FAILED' }
  }
  if ($userId) {
    try {
      Invoke-RestMethod -Method Delete -Uri ($base + '/auth/v1/admin/users/' + $userId) -Headers $adminHeaders | Out-Null
      if ($report.cleanup -eq 'NOT_STARTED') {
        $report.cleanup = if ($membershipGranted) { 'USER_REMOVED_MEMBERSHIP_DISABLED' } else { 'USER_REMOVED' }
      }
    } catch { $report.cleanup = 'USER_DELETE_FAILED' }
  }
  Remove-Item Env:STAGING_QA_ACCESS_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:STAGING_QA_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:STAGING_QA_PASSWORD -ErrorAction SilentlyContinue
  $report | ConvertTo-Json -Compress
  if ($userId -and $report.cleanup -notin @('USER_REMOVED', 'USER_REMOVED_MEMBERSHIP_DISABLED')) {
    throw 'QA_CLEANUP_FAILED'
  }
}
