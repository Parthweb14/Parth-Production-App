// src/components/settings/SettingsView.tsx
"use client";
import { useState } from "react";
import { Button, Card, Input, Label } from "@/components/ui";
import { setLogo, removeLogo, setScanEnabled, saveSmtpSettings, testSmtpSettings, saveGstSettings } from "@/server/settings-actions";
import { Upload, Trash2, ScanLine, Mail, Send, Receipt } from "lucide-react";

function resizeImage(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Cannot process image."));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Could not read image file."));
    img.src = url;
  });
}

type SmtpData = { host: string; port: string; user: string; pass: string; from: string; passConfigured?: boolean };
type GstData = { number: string; percentage: number };

export function SettingsView({
  logoUrl,
  scanEnabled,
  smtp,
  gst,
}: {
  logoUrl: string | null;
  scanEnabled: boolean;
  smtp: { host: string; port: string; user: string; from: string; passConfigured?: boolean; pass?: string };
  gst: GstData;
}) {
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanOn, setScanOn] = useState(scanEnabled);

  const [smtpData, setSmtpData] = useState<SmtpData>({
    host: smtp.host,
    port: smtp.port,
    user: smtp.user,
    pass: "",
    from: smtp.from,
    passConfigured: smtp.passConfigured,
  });
  const [smtpPending, setSmtpPending] = useState(false);
  const [smtpMsg, setSmtpMsg] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testPending, setTestPending] = useState(false);
  const [gstData, setGstData] = useState<GstData>(gst);
  const [gstPending, setGstPending] = useState(false);
  const [gstMsg, setGstMsg] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) { setError("Only image files are allowed."); return; }
    try {
      const dataUrl = await resizeImage(file, 256);
      setPreview(dataUrl);
      setPending(true);
      try { await setLogo(dataUrl); } catch (err) { setError((err as Error).message); setPreview(logoUrl); } finally { setPending(false); }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove() {
    if (!confirm("Remove the logo?")) return;
    setPending(true);
    try { await removeLogo(); setPreview(null); } catch (err) { setError((err as Error).message); }
    setPending(false);
  }

  async function saveSmtp(e: React.FormEvent) {
    e.preventDefault();
    setSmtpPending(true);
    setSmtpMsg(null);
    try {
      await saveSmtpSettings(smtpData);
      setSmtpData((s) => ({ ...s, pass: "", passConfigured: s.passConfigured || Boolean(s.pass.trim()) }));
      setSmtpMsg("SMTP settings saved.");
    } catch (err) {
      setSmtpMsg(`Error: ${(err as Error).message}`);
    }
    setSmtpPending(false);
  }

  async function sendTest() {
    if (!testEmail.trim()) return;
    setTestPending(true);
    try {
      await testSmtpSettings(testEmail.trim());
      setSmtpMsg("Test email sent!");
    } catch (err) {
      setSmtpMsg(`Error: ${(err as Error).message}`);
    }
    setTestPending(false);
  }

  async function saveGst(e: React.FormEvent) {
    e.preventDefault(); setGstPending(true); setGstMsg(null);
    try { await saveGstSettings(gstData); setGstMsg("GST settings saved."); } catch (err) { setGstMsg(`Error: ${(err as Error).message}`); }
    setGstPending(false);
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Settings</h1>

      <Card className="max-w-lg p-5">
        <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Company Logo</h3>
        <p className="mb-4 text-xs text-gray-500">Shown in sidebar, invoices, PWA. Use a square image under ~220KB.</p>
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {preview ? (
              <img src={preview} alt="logo preview" className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs text-gray-400">No logo</span>
            )}
          </div>
          <div className="space-y-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-kp-primary px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]">
              <Upload className="h-4 w-4" /> {pending ? "Uploading…" : "Upload Logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="hidden" disabled={pending} />
            </label>
            {preview && (
              <button onClick={remove} disabled={pending} className="flex items-center gap-1 text-sm text-kp-danger hover:underline disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-kp-danger">{error}</p>}
      </Card>

      <Card className="mt-4 max-w-lg p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800">
              <ScanLine className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Scan Item Visibility</h3>
              <p className="text-xs text-gray-500">Toggle Scan for all employee dashboards.</p>
            </div>
          </div>
          <ToggleSwitch
            checked={scanOn}
            onChange={async (v) => {
              setScanOn(v);
              try { await setScanEnabled(v); } catch (e) { setScanOn(!v); alert((e as Error).message); }
            }}
          />
        </div>
      </Card>

      <Card className="mt-4 max-w-lg p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800">
            <Receipt className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">GST Settings</h3>
            <p className="text-xs text-gray-500">GST number and tax rate for invoices.</p>
          </div>
        </div>
        <form onSubmit={saveGst} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>GST Number</Label><Input placeholder="22AAAAA0000A1Z5" value={gstData.number} onChange={(e) => setGstData((s) => ({ ...s, number: e.target.value }))} /></div>
            <div><Label>GST Percentage</Label><Input type="number" min={0} max={100} placeholder="18" value={gstData.percentage} onChange={(e) => setGstData((s) => ({ ...s, percentage: Number(e.target.value) || 0 }))} /></div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={gstPending}>{gstPending ? "Saving…" : "Save GST"}</Button>
          </div>
          {gstMsg && <p className={`text-sm ${gstMsg.startsWith("Error") ? "text-kp-danger" : "text-kp-success"}`}>{gstMsg}</p>}
        </form>
      </Card>

      <Card className="mt-4 max-w-lg p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800">
            <Mail className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">SMTP / Email Settings</h3>
            <p className="text-xs text-gray-500">Configure outgoing email for notifications, welcome emails, etc.</p>
          </div>
        </div>
        <form onSubmit={saveSmtp} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>SMTP Host</Label><Input placeholder="smtp.gmail.com" value={smtpData.host} onChange={(e) => setSmtpData((s) => ({ ...s, host: e.target.value }))} /></div>
            <div><Label>Port</Label><Input placeholder="587" value={smtpData.port} onChange={(e) => setSmtpData((s) => ({ ...s, port: e.target.value }))} /></div>
          </div>
          <div><Label>SMTP Username</Label><Input placeholder="user@example.com" value={smtpData.user} onChange={(e) => setSmtpData((s) => ({ ...s, user: e.target.value }))} /></div>
          <div>
            <Label>SMTP Password</Label>
            <Input
              type="password"
              placeholder={smtpData.passConfigured ? "•••••••• (leave blank to keep)" : "••••••••"}
              value={smtpData.pass}
              onChange={(e) => setSmtpData((s) => ({ ...s, pass: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
          <div><Label>From Email</Label><Input placeholder="noreply@kadamproduction.in" value={smtpData.from} onChange={(e) => setSmtpData((s) => ({ ...s, from: e.target.value }))} /></div>
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={smtpPending}>{smtpPending ? "Saving…" : "Save SMTP"}</Button>
          </div>
        </form>
        <div className="mt-4 border-t border-gray-100 pt-4">
          <Label>Send Test Email</Label>
          <div className="mt-1 flex gap-2">
            <Input placeholder="test@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="flex-1" />
            <Button variant="success" onClick={sendTest} disabled={testPending}><Send className="h-4 w-4" /> {testPending ? "Sending…" : "Test"}</Button>
          </div>
        </div>
        {smtpMsg && <p className={`mt-2 text-sm ${smtpMsg.startsWith("Error") ? "text-kp-danger" : "text-kp-success"}`}>{smtpMsg}</p>}
      </Card>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${checked ? "bg-kp-success" : "bg-gray-300 dark:bg-gray-600"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}
