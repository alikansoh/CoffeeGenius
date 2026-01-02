import mongoose from 'mongoose';

interface SessionInfo {
  startTime: number;
  paymentIntentId: string;
}

const activeSessions = new Map<string, SessionInfo>();

export function registerSession(
  session: mongoose.ClientSession,
  paymentIntentId: string
): void {
  const sessionId = getSessionId(session);
  if (sessionId) {
    activeSessions.set(sessionId, {
      startTime: Date.now(),
      paymentIntentId,
    });
    console.log(`[SessionMonitor] Registered session: ${sessionId}`);
  }
}

export function unregisterSession(session: mongoose.ClientSession): void {
  const sessionId = getSessionId(session);
  if (sessionId) {
    activeSessions.delete(sessionId);
    console.log(`[SessionMonitor] Unregistered session: ${sessionId}`);
  }
}

function getSessionId(session: mongoose.ClientSession): string | null {
  try {
    const sess = session as unknown as Record<string, unknown>;
    const id = sess.id;
    if (id) {
      return String(id);
    }
  } catch {
    // ignore
  }
  return null;
}

// ✅ Clean up stale sessions
export async function cleanupStaleSessions(): Promise<void> {
  const now = Date.now();
  const MAX_SESSION_AGE = 60000; // 1 minute
  
  for (const [sessionId, info] of activeSessions.entries()) {
    const age = now - info.startTime;
    
    if (age > MAX_SESSION_AGE) {
      console.warn(`⚠️ Stale session detected: ${sessionId} (${age}ms old)`);
      console.warn(`   Payment Intent: ${info.paymentIntentId}`);
      
      activeSessions.delete(sessionId);
      
      // TODO: Send admin alert
      console.error(`🚨 ALERT: Stale session for PI ${info.paymentIntentId}`);
    }
  }
}

// ✅ Run cleanup every 30 seconds
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupStaleSessions, 30000);
}

// ✅ Get current active sessions (for monitoring)
export function getActiveSessions(): Array<{ sessionId: string; info: SessionInfo }> {
  return Array.from(activeSessions.entries()).map(([sessionId, info]) => ({
    sessionId,
    info,
  }));
}