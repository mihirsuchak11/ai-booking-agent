export interface CallSession {
  callSid: string;
  from: string;
  to: string;
  conversationHistory: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  collectedData: {
    customerName?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    phoneNumber?: string;
  };
  status:
    | "greeting"
    | "collecting"
    | "checking"
    | "confirming"
    | "completed"
    | "failed";
  createdAt: Date;
  retryCount?: number; // Track retry attempts for unclear speech
}

class SessionStore {
  private sessions: Map<string, CallSession> = new Map();
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes

  createSession(callSid: string, from: string, to: string): CallSession {
    const session: CallSession = {
      callSid,
      from,
      to,
      conversationHistory: [],
      collectedData: {},
      status: "greeting",
      createdAt: new Date(),
    };

    this.sessions.set(callSid, session);
    return session;
  }

  getSession(callSid: string): CallSession | undefined {
    const session = this.sessions.get(callSid);

    if (!session) {
      return undefined;
    }

    // Check if session expired
    const age = Date.now() - session.createdAt.getTime();
    if (age > this.TTL_MS) {
      this.sessions.delete(callSid);
      return undefined;
    }

    return session;
  }

  updateSession(
    callSid: string,
    updates: Partial<CallSession>
  ): CallSession | undefined {
    const session = this.getSession(callSid);
    if (!session) {
      return undefined;
    }

    Object.assign(session, updates);
    return session;
  }

  deleteSession(callSid: string): void {
    this.sessions.delete(callSid);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [callSid, session] of this.sessions.entries()) {
      const age = now - session.createdAt.getTime();
      if (age > this.TTL_MS) {
        this.sessions.delete(callSid);
      }
    }
  }
}

// Singleton instance
export const sessionStore = new SessionStore();

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  sessionStore.cleanup();
}, 5 * 60 * 1000);
