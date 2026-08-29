import { LoggingNotificationSender } from "./loggingSender";
import { MetaCloudApiSender } from "./metaClient";
import type { NotificationSender } from "./types";

export * from "./types";
export { LoggingNotificationSender } from "./loggingSender";
export { MetaCloudApiSender, type MetaClientConfig } from "./metaClient";
export { verifyMetaSignature } from "./signature";

// Real credentials (META_ACCESS_TOKEN) aren't set in most dev environments yet — this
// picks the real Meta client automatically once they are, and falls back to the
// logging stub otherwise, so nothing else in the codebase needs to know or care which
// one is active.
export function getNotificationSender(): NotificationSender {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

  if (accessToken && phoneNumberId) {
    return new MetaCloudApiSender({
      accessToken,
      phoneNumberId,
      apiVersion: process.env.META_API_VERSION,
      defaultTemplateName: process.env.META_DEFAULT_TEMPLATE_NAME,
      defaultTemplateLanguage: process.env.META_DEFAULT_TEMPLATE_LANGUAGE,
    });
  }

  return new LoggingNotificationSender();
}
