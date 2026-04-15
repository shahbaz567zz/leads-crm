import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string[];
  subject: string;
  text: string;
  html: string;
};

function readMailerConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 2525);
  const user = process.env.SMTP_USER ?? process.env.SMTP_EMAIL;
  const password = process.env.SMTP_PASSWORD;
  const fromAddress = process.env.EMAIL_FROM ?? process.env.FROM_EMAIL;
  const fromName =
    process.env.EMAIL_FROM_NAME ?? process.env.FROM_NAME ?? "CollegeTpoint CRM";

  const isConfigured = Boolean(host && port && user && password && fromAddress);

  return {
    host,
    port,
    user,
    password,
    fromAddress,
    fromName,
    isConfigured,
  };
}

export function isSlaEmailConfigured() {
  return readMailerConfig().isConfigured;
}

export async function sendDigestEmail(input: SendEmailInput) {
  const config = readMailerConfig();

  if (
    !config.isConfigured ||
    !config.host ||
    !config.user ||
    !config.password ||
    !config.fromAddress
  ) {
    throw new Error("SMTP configuration is incomplete.");
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  await transporter.sendMail({
    from: `${config.fromName} <${config.fromAddress}>`,
    to: input.to.join(", "),
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
