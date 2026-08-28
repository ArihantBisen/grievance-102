import { dispatchPendingMessages } from "./dispatch";
import { LoggingNotificationSender } from "./notificationSender";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);

const sender = new LoggingNotificationSender();

async function tick() {
  try {
    const result = await dispatchPendingMessages(sender);
    if (result.dispatched || result.failed || result.gaveUp) {
      console.log(
        `[outbox] dispatched=${result.dispatched} retrying=${result.failed} gaveUp=${result.gaveUp}`
      );
    }
  } catch (err) {
    console.error("[outbox] poll cycle failed:", err);
  }
}

console.log(`Outbox Worker started, polling every ${POLL_INTERVAL_MS}ms`);
tick();
setInterval(tick, POLL_INTERVAL_MS);
