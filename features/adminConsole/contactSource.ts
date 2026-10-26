export type AdminContactView = { id: string; name: string; phoneMasked: string; consultationAt: string; noticeId: string;
  resultStatus: string; deliveryStatus: string; expiresAt: string };
export type AdminContactPage = { metrics: { registered: number; requested: number; sent: number; failed: number; unconfigured: number };
  rows: AdminContactView[]; nextCursor: number | null };

export async function connectedContacts(accessToken: string, cursor = 0, fetcher: typeof fetch = fetch): Promise<AdminContactPage> {
  const response = await fetcher(`/admin-api/consultation-contacts?cursor=${cursor}`, {
    headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'AUTH_REQUIRED' : response.status === 403 ? 'FORBIDDEN' : 'CONTACT_ADMIN_UNAVAILABLE');
  return response.json() as Promise<AdminContactPage>;
}
