export type CheckinStatus = 'sending' | 'working' | 'complete' | 'failed' | 'approval_required' | 'unknown';
export type CheckinView = {
  id: string; sessionId: string; status: CheckinStatus; instructions: string;
  response?: string; progress?: string; error?: string; createdAt: number; updatedAt: number;
  canReply: boolean; canPoll: boolean;
};
export type CheckinDraft = { ticket: string; instructions: string; newConversation: boolean; sessionId: string };
