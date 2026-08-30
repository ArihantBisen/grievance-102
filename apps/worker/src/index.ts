import { getNotificationSender } from "@sboss/whatsapp-client";
import { dispatchPendingMessages } from "./dispatch";
import { checkTatBreaches } from "./breachCheck";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const BREACH_CHECK_INTERVAL_MS = Number(process.env.WORKER_BREACH_CHECK_INTERVAL_MS ?? 60000);

// Picks the real Meta Cloud API client once META_ACCESS_TOKEN is set; falls back to a
// logging stub otherwise (see packages/whatsapp-client).
const sender = getNotificationSender();

async function outboxTick() {
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

async function breachTick() {
  try {
    const result = await checkTatBreaches();
    if (result.breached) {
      console.log(`[breach-check] escalated ${result.breached} ticket(s) for TAT breach`);
    }
  } catch (err) {
    console.error("[breach-check] poll cycle failed:", err);
  }
}

console.log(
  `Outbox Worker started, polling every ${POLL_INTERVAL_MS}ms (dispatch) / ${BREACH_CHECK_INTERVAL_MS}ms (TAT breach check)`
);
outboxTick();
breachTick();
setInterval(outboxTick, POLL_INTERVAL_MS);
setInterval(breachTick, BREACH_CHECK_INTERVAL_MS);
