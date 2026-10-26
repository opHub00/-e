import type { DeliveryStatus } from './contract.ts';

const transitions: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  REQUESTED: ['PROVIDER_UNCONFIGURED', 'SENDING', 'EXPIRED'],
  PROVIDER_UNCONFIGURED: ['SENDING', 'EXPIRED'],
  SENDING: ['SENT', 'FAILED'],
  SENT: [],
  FAILED: ['SENDING', 'EXPIRED'],
  EXPIRED: [],
};

export function canTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return transitions[from].includes(to);
}

export type SmsDeliveryRequest = {
  channel: 'SMS'; recipient: string; resultUrl: string; summary: string;
};
export type SmsDeliveryResult =
  | { status: 'SENT'; providerMessageId: string }
  | { status: 'PROVIDER_UNCONFIGURED' | 'FAILED'; failureCode: string };

/** No provider is configured for this event branch. Never report a mock as a real send. */
export interface ConsultationResultSender {
  sendConsultationResult(request: SmsDeliveryRequest): Promise<SmsDeliveryResult>;
}

export const unconfiguredSmsSender: ConsultationResultSender = {
  async sendConsultationResult(): Promise<SmsDeliveryResult> {
    return { status: 'PROVIDER_UNCONFIGURED', failureCode: 'SMS_PROVIDER_NOT_CONFIGURED' };
  },
};
