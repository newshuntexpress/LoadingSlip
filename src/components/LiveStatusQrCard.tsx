import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Maximize2, Copy, Check, X, ShieldCheck, AlertCircle } from 'lucide-react';

interface LiveStatusQrCardProps {
  statusUrl: string;
  truckNumber?: string;
  gateNumber?: string;
  delNoteNumber?: string;
  statusLabel?: string;
}

export const LiveStatusQrCard: React.FC<LiveStatusQrCardProps> = ({
  statusUrl,
  truckNumber,
  gateNumber,
  delNoteNumber,
  statusLabel,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    if (!statusUrl) {
      setQrDataUrl('');
      return;
    }

    QRCode.toDataURL(statusUrl, {
      errorCorrectionLevel: 'M',
      margin: 3,
      width: 440,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
          setQrError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrError('Unable to generate QR code for this status link.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [statusUrl]);

  useEffect(() => {
    if (!enlarged) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEnlarged(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enlarged]);

  const handleCopyUrl = async () => {
    if (!statusUrl) return;
    try {
      await navigator.clipboard.writeText(statusUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for restricted clipboard contexts
      try {
        const input = document.createElement('input');
        input.value = statusUrl;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    }
  };

  return (
    <>
      <section
        aria-label="Gate Guard Scan QR Pass"
        className="bg-white rounded-2xl border border-[#D1DBE5] p-4 sm:p-5 shadow-xs space-y-3.5"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#E5ECF4] pb-3">
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide text-[#1C2833] flex items-center gap-2">
              <QrCode className="w-4 h-4 text-[#0A6ED1] shrink-0" />
              <span>Gate Guard QR Pass</span>
            </h3>
            <p className="text-xs text-[#475E75] mt-1 leading-relaxed">
              Show this QR code to the Gate Guard to scan and verify your live loading status directly on their device.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* High-Contrast Scannable QR Container */}
          <button
            type="button"
            onClick={() => qrDataUrl && setEnlarged(true)}
            disabled={!qrDataUrl}
            aria-label="Enlarge QR code for gate guard scanning"
            className="w-44 h-44 sm:w-40 sm:h-40 rounded-xl bg-white border-2 border-[#354A5F] p-2 flex items-center justify-center shrink-0 shadow-xs hover:border-[#0A6ED1] focus:outline-none focus:ring-2 focus:ring-[#0A6ED1] cursor-pointer transition disabled:cursor-default"
          >
            {qrError ? (
              <div className="text-center px-2 space-y-1">
                <AlertCircle className="w-6 h-6 text-[#BB0000] mx-auto" />
                <span className="text-[11px] font-semibold text-[#BB0000] block">{qrError}</span>
              </div>
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code linking to live loading status for ${truckNumber || 'vehicle'}`}
                className="w-full h-full object-contain select-none"
              />
            ) : (
              <span className="text-xs font-semibold text-[#5B738B]">Generating QR...</span>
            )}
          </button>

          {/* Pass Summary & Actions */}
          <div className="flex-1 w-full min-w-0 space-y-3">
            <div className="bg-[#F7F9FB] rounded-xl border border-[#E3EAF2] p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[#5B738B]">Truck Number</span>
                <span className="font-black text-[#1C2833] tabular-nums">{truckNumber || '—'}</span>
              </div>
              {gateNumber && (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#5B738B]">Assigned Gate</span>
                  <span className="font-black text-[#0854A0]">{gateNumber}</span>
                </div>
              )}
              {delNoteNumber && (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#5B738B]">Delivery No.</span>
                  <span className="font-bold text-[#1C2833] font-mono tabular-nums">{delNoteNumber}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setEnlarged(true)}
                disabled={!qrDataUrl}
                className="min-h-[44px] px-3.5 rounded-xl bg-[#0A6ED1] hover:bg-[#085CAF] disabled:opacity-50 text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer transition whitespace-nowrap"
              >
                <Maximize2 className="w-4 h-4 shrink-0" />
                <span>Enlarge for Scan</span>
              </button>

              <button
                type="button"
                onClick={handleCopyUrl}
                disabled={!statusUrl}
                className="min-h-[44px] px-3.5 rounded-xl bg-[#EFF4F9] hover:bg-[#E1EBF5] disabled:opacity-50 text-[#1C2833] border border-[#BCC8D4] text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-[#107E3E] shrink-0" />
                    <span className="text-[#107E3E]">Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[#354A5F] shrink-0" />
                    <span>Copy Status Link</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-[#5B738B]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#107E3E] shrink-0" />
              <span className="truncate font-mono" title={statusUrl}>
                {statusUrl}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* High-Contrast Full-Screen Scan Modal for Outdoor Gate Guards */}
      {enlarged && qrDataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Gate Guard Full-Size QR Pass"
          className="fixed inset-0 z-50 bg-[#0F172A]/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEnlarged(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl border border-[#D1DBE5] p-5 sm:p-6 shadow-2xl space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-left min-w-0">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5B738B] block">
                  Gate Guard Scan Pass
                </span>
                <h4 className="text-lg font-black text-[#1C2833] truncate">
                  {truckNumber || 'Live Loading Pass'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEnlarged(false)}
                aria-label="Close enlarged QR view"
                className="min-h-[44px] min-w-[44px] rounded-xl bg-[#F3F6FA] hover:bg-[#E5ECF4] text-[#1C2833] flex items-center justify-center cursor-pointer transition shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white rounded-2xl border-2 border-[#1C2833] p-3 mx-auto w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
              <img
                src={qrDataUrl}
                alt={`Full-size QR code for ${truckNumber || 'live loading status'}`}
                className="w-full h-full object-contain select-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-left bg-[#F7F9FB] rounded-xl border border-[#E3EAF2] p-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5B738B] block">
                  Gate Number
                </span>
                <span className="text-sm font-black text-[#0854A0]">{gateNumber || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5B738B] block">
                  Status
                </span>
                <span className="text-sm font-black text-[#1C2833]">{statusLabel || 'Live'}</span>
              </div>
              {delNoteNumber && (
                <div className="col-span-2 pt-1 border-t border-[#E3EAF2]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5B738B] block">
                    Delivery Number
                  </span>
                  <span className="text-xs font-bold font-mono text-[#1C2833] tabular-nums">
                    {delNoteNumber}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setEnlarged(false)}
              className="w-full min-h-[48px] rounded-xl bg-[#354A5F] hover:bg-[#243647] text-white text-sm font-extrabold cursor-pointer transition"
            >
              Done Scanning
            </button>
          </div>
        </div>
      )}
    </>
  );
};
