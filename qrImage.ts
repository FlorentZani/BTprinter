// qrImage.ts
import QRCode from 'qrcode';

export async function generateQRCodeDataUrl(data: string, width: number = 512): Promise<string> {
  const options = {
    errorCorrectionLevel: 'L' as const,
    type: 'image/png' as const,
    width,
  };
  return await QRCode.toDataURL(data, options);
}
