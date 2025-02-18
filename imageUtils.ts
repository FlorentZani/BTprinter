// imageUtils.ts
export function dataUrlToBuffer(dataUrl: string): Buffer {
    const base64Data = dataUrl.split(',')[1];
    return Buffer.from(base64Data, 'base64');
  }
  