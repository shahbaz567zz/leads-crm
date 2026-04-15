import { normalizeIndianPhone } from "@/lib/utils";

type LeadAutoReplyInput = {
  phone: string;
  name: string;
  campaignName?: string | null;
};

export async function sendLeadAutoReply(input: LeadAutoReplyInput) {
  if (process.env.ENABLE_MSG91_AUTO_REPLY !== "true") {
    return { sent: false, reason: "disabled" } as const;
  }

  const authKey = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_WA_INTEGRATED_NUMBER;
  const templateName = process.env.MSG91_WA_TEMPLATE_NAME;
  const templateNamespace = process.env.MSG91_WA_TEMPLATE_NAMESPACE;
  const language = process.env.MSG91_WA_LANGUAGE ?? "en";

  if (!authKey || !integratedNumber || !templateName || !templateNamespace) {
    return { sent: false, reason: "missing-config" } as const;
  }

  const phone = normalizeIndianPhone(input.phone);

  if (phone.length !== 10) {
    return { sent: false, reason: "invalid-phone" } as const;
  }

  const response = await fetch(
    "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: authKey,
      },
      body: JSON.stringify({
        integrated_number: integratedNumber,
        content_type: "template",
        payload: {
          messaging_product: "whatsapp",
          type: "template",
          template: {
            name: templateName,
            language: {
              code: language,
              policy: "deterministic",
            },
            namespace: templateNamespace,
            to_and_components: [
              {
                to: [`91${phone}`],
                components: {
                  body_1: {
                    type: "text",
                    value: input.name,
                  },
                  body_2: {
                    type: "text",
                    value: input.campaignName ?? "B.Tech counselling",
                  },
                  body_3: {
                    type: "text",
                    value:
                      process.env.MSG91_WA_FALLBACK_CTA ??
                      "Our counsellor will call you shortly.",
                  },
                },
              },
            ],
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`MSG91 request failed: ${body}`);
  }

  return { sent: true } as const;
}

export function isSlaWhatsappConfigured() {
  return Boolean(
    process.env.MSG91_AUTH_KEY &&
    process.env.MSG91_WA_INTEGRATED_NUMBER &&
    process.env.MSG91_SLA_TEMPLATE_NAME &&
    process.env.MSG91_SLA_TEMPLATE_NAMESPACE,
  );
}

type SlaDigestWhatsappInput = {
  recipients: string[];
  overdueCount: number;
  untouchedCount: number;
  topLeadLabel: string;
  dashboardUrl: string;
};

export async function sendSlaDigestWhatsapp(input: SlaDigestWhatsappInput) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_WA_INTEGRATED_NUMBER;
  const templateName = process.env.MSG91_SLA_TEMPLATE_NAME;
  const templateNamespace = process.env.MSG91_SLA_TEMPLATE_NAMESPACE;
  const language = process.env.MSG91_SLA_TEMPLATE_LANGUAGE ?? "en";

  if (!authKey || !integratedNumber || !templateName || !templateNamespace) {
    throw new Error("MSG91 SLA template configuration is incomplete.");
  }

  const recipients = input.recipients
    .map((phone) => normalizeIndianPhone(phone))
    .filter((phone) => phone.length === 10);

  if (!recipients.length) {
    throw new Error("No valid WhatsApp recipients available.");
  }

  const response = await fetch(
    "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: authKey,
      },
      body: JSON.stringify({
        integrated_number: integratedNumber,
        content_type: "template",
        payload: {
          messaging_product: "whatsapp",
          type: "template",
          template: {
            name: templateName,
            language: {
              code: language,
              policy: "deterministic",
            },
            namespace: templateNamespace,
            to_and_components: recipients.map((phone) => ({
              to: [`91${phone}`],
              components: {
                body_1: {
                  type: "text",
                  value: String(input.overdueCount),
                },
                body_2: {
                  type: "text",
                  value: String(input.untouchedCount),
                },
                body_3: {
                  type: "text",
                  value: input.topLeadLabel,
                },
                body_4: {
                  type: "text",
                  value: input.dashboardUrl,
                },
              },
            })),
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`MSG91 SLA request failed: ${body}`);
  }

  return { sent: true } as const;
}
