// src/lib/email.ts
import nodemailer from "nodemailer";
import { getSetting, getSmtpCredentials } from "./settings";

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function createTransporter() {
  const { host, port, user, pass } = await getSmtpCredentials();
  if (!host || !port || !user || !pass) return null;
  const portNum = Number(port);
  return nodemailer.createTransport({
    host,
    port: portNum,
    secure: portNum === 465,
    requireTLS: portNum === 587,
    auth: { user, pass },
  });
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const transporter = await createTransporter();
  if (!transporter) throw new Error("SMTP not configured. Set SMTP settings in Admin Settings.");
  const from = (await getSetting("smtp_from")) || process.env.SMTP_FROM || "noreply@kadamproduction.in";
  await transporter.sendMail({ from, to, subject, html });
}

export async function sendWelcomeEmail({ to, name }: { to: string; name: string }) {
  const logoUrl = await getSetting("logo_url");
  const logoImg =
    logoUrl && !logoUrl.startsWith("data:")
      ? `<img src="${escapeHtml(logoUrl)}" alt="Kadam Production" style="max-height:60px;margin-bottom:16px" />`
      : "";
  const loginUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://app.kadamproduction.in"}/login`;
  const html = `
    <div style="max-width:500px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
      <div style="text-align:center;padding:24px 0">${logoImg}<h2 style="margin:0;color:#1e40af">Welcome to Kadam Production</h2></div>
      <p>Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p>Your account has been created. You can now sign in using your email address:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Email</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${escapeHtml(to)}</td></tr>
      </table>
      <p>For your security, your temporary password is <strong>set by the administrator</strong> and must be changed when you first sign in. Please contact your administrator if you have not received it through a secure channel.</p>
      <p style="color:#dc2626;font-size:13px">You will be required to set a new password on your first login.</p>
      <a href="${loginUrl}" style="display:inline-block;margin-top:12px;padding:10px 24px;background:#1e40af;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Login Now</a>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
      <p style="font-size:12px;color:#6b7280">Kadam Production — Professional Event Services</p>
    </div>
  `;
  await sendEmail({ to, subject: "Welcome to Kadam Production — Your Account", html });
}

export async function sendPasswordResetEmail({ to, name }: { to: string; name: string }) {
  const logoUrl = await getSetting("logo_url");
  const logoImg =
    logoUrl && !logoUrl.startsWith("data:")
      ? `<img src="${escapeHtml(logoUrl)}" alt="Kadam Production" style="max-height:60px;margin-bottom:16px" />`
      : "";
  const loginUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://app.kadamproduction.in"}/login`;
  const html = `
    <div style="max-width:500px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
      <div style="text-align:center;padding:24px 0">${logoImg}<h2 style="margin:0;color:#1e40af">Password Reset — Kadam Production</h2></div>
      <p>Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p>Your account password has been reset by an administrator. You can now sign in with your email and the new temporary password provided to you securely.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Email</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${escapeHtml(to)}</td></tr>
      </table>
      <p style="color:#dc2626;font-size:13px">You will be required to set a new password on your next login.</p>
      <a href="${loginUrl}" style="display:inline-block;margin-top:12px;padding:10px 24px;background:#1e40af;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Login Now</a>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
      <p style="font-size:12px;color:#6b7280">Kadam Production — Professional Event Services</p>
    </div>
  `;
  await sendEmail({ to, subject: "Kadam Production — Password Reset", html });
}
