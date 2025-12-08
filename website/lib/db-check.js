import mongoose from "mongoose";
import dbConnect from "./dbConnect";

/**
 * Convert mongoose readyState number to human-friendly name.
 * 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
 */
function readyStateText(state) {
  switch (state) {
    case 0:
      return "disconnected";
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    default:
      return "unknown";
  }
}

/**
 * Check DB connection:
 * - ensures we call your dbConnect() helper
 * - returns mongoose.connection.readyState and a ping result if possible
 */
export async function checkDbConnection({ doPing = true, pingTimeoutMs = 2500 } = {}) {
  try {
    // Ensure the connection attempt is made (uses your cached dbConnect)
    await dbConnect();

    const state = mongoose.connection.readyState;
    const stateText = readyStateText(state);

    let ping = null;
    if (doPing && mongoose.connection && mongoose.connection.db) {
      // Try to run a lightweight ping with a timeout
      const pingPromise = mongoose.connection.db.admin().ping();
      if (typeof pingTimeoutMs === "number") {
        // simple timeout wrapper
        ping = await Promise.race([
          pingPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), pingTimeoutMs)),
        ]);
      } else {
        ping = await pingPromise;
      }
    }

    return {
      ok: true,
      state,
      stateText,
      ping,
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : String(error),
      // still surface the mongoose state if available
      state: mongoose.connection ? mongoose.connection.readyState : undefined,
      stateText: mongoose.connection ? readyStateText(mongoose.connection.readyState) : "unknown",
    };
  }
}