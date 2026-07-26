// src/components/scan/ScanView.tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { Button, Input, Label, Select, Card } from "@/components/ui";
import { ScanLine, ArrowRightLeft, Undo2, AlertTriangle, Camera, CameraOff } from "lucide-react";
import { scanItem } from "@/server/scan-actions";

type Action = "checkout" | "checkin" | "damaged";

export function ScanView({ ongoing }: { ongoing: { id: number; clientName: string; contactPerson: string | null; eventDate: string | null }[] }) {
  const [barcode, setBarcode] = useState("");
  const [action, setAction] = useState<Action>("checkout");
  const [orderId, setOrderId] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const cancelledRef = useRef(false);

  const READER_ID = "kp-reader";

  useEffect(() => {
    return () => {
      // stop camera on unmount, and ignore any scan still in flight
      cancelledRef.current = true;
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  async function runScan(code: string) {
    const value = code.trim();
    if (!value) { setMsg({ ok: false, text: "No barcode detected." }); return; }
    setPending(true);
    setMsg(null);
    try {
      const res = await scanItem(value, action, orderId ? Number(orderId) : undefined);
      if (cancelledRef.current) return; // unmounted/stopped mid-scan — discard result
      setMsg({ ok: true, text: res.msg });
      setBarcode("");
    } catch (err) {
      if (cancelledRef.current) return;
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      if (!cancelledRef.current) setPending(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await runScan(barcode);
  }

  async function startCamera() {
    setCamError(null);
    setMsg(null);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

      // Clear any previous instance
      document.getElementById(READER_ID)?.replaceChildren();

      const scanner = new Html5Qrcode(READER_ID, {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
        useBarCodeDetectorIfSupported: true,
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 160 } },
        (decodedText) => {
          // detected — fill, stop, submit
          setBarcode(decodedText);
          void stopCamera();
          void runScan(decodedText);
        },
        () => {
          /* per-frame decode failure — ignore */
        }
      );
      setCameraOn(true);
    } catch (err) {
      setCamError((err as Error).message || "Could not start camera. Check browser permissions or use a HTTPS URL.");
      setCameraOn(false);
    }
  }

  async function stopCamera() {
    try {
      const s = scannerRef.current;
      if (s) {
        await s.stop();
        s.clear();
      }
    } catch {
      /* ignore */
    }
    scannerRef.current = null;
    setCameraOn(false);
    document.getElementById(READER_ID)?.replaceChildren();
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Scan Item</h1>
      <p className="mb-5 text-sm text-gray-500">Scan a barcode with your camera, or type it manually.</p>

      <Card className="max-w-xl p-5">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Action</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <ActionBtn active={action === "checkout"} onClick={() => setAction("checkout")} icon={ArrowRightLeft} label="Move to Event" />
              <ActionBtn active={action === "checkin"} onClick={() => setAction("checkin")} icon={Undo2} label="Return to Stock" />
              <ActionBtn active={action === "damaged"} onClick={() => setAction("damaged")} icon={AlertTriangle} label="Mark Damaged" />
            </div>
          </div>

          {action === "checkout" && (
            <div>
              <Label>Select Active Event</Label>
              <Select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                <option value="">— choose event —</option>
                {ongoing.map((o) => (
                  <option key={o.id} value={o.id}>#{o.id} {o.contactPerson ?? o.clientName}</option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Label>Barcode</Label>
            <div className="relative">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="KP…" className="pl-9 font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="submit" disabled={pending}>{pending ? "Processing…" : "Submit Scan"}</Button>
            {!cameraOn ? (
              <Button type="button" variant="info" onClick={startCamera}><Camera className="h-4 w-4" /> Scan via Camera</Button>
            ) : (
              <Button type="button" variant="danger" onClick={stopCamera}><CameraOff className="h-4 w-4" /> Stop Camera</Button>
            )}
          </div>
        </form>

        {/* Camera viewport */}
        <div className="mt-4">
          <div id={READER_ID} className="overflow-hidden rounded-lg border border-gray-200 bg-black [&_video]:mx-auto [&_video]:max-h-72" />
          {camError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-kp-danger">{camError}</p>}
          {cameraOn && <p className="mt-2 text-center text-xs text-gray-500">Point your camera at a barcode. It auto-submits on detection.</p>}
        </div>

        {msg && (
          <div className={`mt-4 rounded-lg px-4 py-2.5 text-sm font-medium ${msg.ok ? "bg-emerald-50 text-kp-success" : "bg-red-50 text-kp-danger"}`}>
            {msg.text}
          </div>
        )}
      </Card>
    </div>
  );
}

function ActionBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof ScanLine; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs font-medium transition ${active ? "border-kp-primary bg-gray-50 text-gray-900 ring-2 ring-gray-400/30 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-500/30" : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/50"}`}
    >
      <Icon className="h-5 w-5" /> {label}
    </button>
  );
}
