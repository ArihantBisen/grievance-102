import type { NotificationSender, OutboundNotification } from "./types";

// D2b's confirmed request shape (Meta Cloud API direct, per ADR-003).
export interface MetaClientConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion?: string; // default v20.0
  // Every real message this system sends over the required TEMPLATE path (outside the
  // 24hr window) reuses one generic, pre-approved utility template with a single body
  // variable — see the drafted templates in README.md. Real per-template selection
  // (different templates for different notification kinds) needs more structure than
  // Message.body's single freeform string carries today; out of scope for this pass.
  defaultTemplateName?: string; // default "sboss_ticket_update"
  defaultTemplateLanguage?: string; // default "en_US"
}

export class MetaCloudApiSender implements NotificationSender {
  private readonly baseUrl: string;

  constructor(private readonly config: MetaClientConfig) {
    const version = config.apiVersion ?? "v20.0";
    this.baseUrl = `https://graph.facebook.com/${version}/${config.phoneNumberId}/messages`;
  }

  async send(notification: OutboundNotification): Promise<void> {
    if (notification.channel !== "WHATSAPP" && notification.channel !== "WEB") {
      return; // email notifications aren't this sender's concern
    }
    if (!notification.toPhoneNumber) {
      throw new Error(`No phone number on file for ticket ${notification.ticketId ?? "(none)"}`);
    }

    const body =
      notification.messageChannelType === "TEMPLATE"
        ? {
            messaging_product: "whatsapp",
            to: notification.toPhoneNumber,
            type: "template",
            template: {
              name: this.config.defaultTemplateName ?? "sboss_ticket_update",
              language: { code: this.config.defaultTemplateLanguage ?? "en_US" },
              components: [
                {
                  type: "body",
                  parameters: [{ type: "text", text: notification.body.slice(0, 1024) }],
                },
              ],
            },
          }
        : {
            messaging_product: "whatsapp",
            to: notification.toPhoneNumber,
            type: "text",
            text: { body: notification.body },
          };

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`Meta send failed (${res.status}): ${errorBody.slice(0, 500)}`);
    }
  }
}

// Inbound media (image/document) messages carry only a media ID — the actual bytes
// live on Meta's servers and need two hops to retrieve: look up the temporary download
// URL for the ID, then fetch that URL. Both requests need the same bearer token as
// sending does. Used by apps/api's webhook handler when a citizen attaches a file.
export async function fetchMetaMedia(
  mediaId: string,
  config: { accessToken: string; apiVersion?: string }
): Promise<{ buffer: Buffer; mimeType: string }> {
  const version = config.apiVersion ?? "v20.0";

  const lookupRes = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!lookupRes.ok) {
    const errorBody = await lookupRes.text().catch(() => "");
    throw new Error(`Meta media lookup failed (${lookupRes.status}): ${errorBody.slice(0, 500)}`);
  }
  const { url, mime_type: mimeType } = (await lookupRes.json()) as { url: string; mime_type: string };

  const fileRes = await fetch(url, { headers: { Authorization: `Bearer ${config.accessToken}` } });
  if (!fileRes.ok) {
    throw new Error(`Meta media download failed (${fileRes.status})`);
  }

  return { buffer: Buffer.from(await fileRes.arrayBuffer()), mimeType };
}
