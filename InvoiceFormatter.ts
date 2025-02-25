import { 
  setTextSize, 
  addBreaks, 
  printQRCode, 
  reset,
  boldText,
  centerText,
  dottedLine,
  leftRightText
} from './escpos-commands';

/**
 * Wraps a string into lines not exceeding the given width.
 */
function wrapText(text: string, width: number): string {
  let result = "";
  while (text.length > width) {
    result += text.substring(0, width) + "\n";
    text = text.substring(width);
  }
  result += text;
  return result;
}

/**
 * Centers text by padding each wrapped line.
 */
function centerWrap(text: string, width: number): string {
  const lines = wrapText(text, width).split("\n");
  return lines
    .map(line => {
      const pad = Math.floor((width - line.length) / 2);
      return " ".repeat(pad) + line;
    })
    .join("\n");
}

/**
 * Formats a left/right line; wraps left text if necessary.
 */
function leftRightTextWrapped(left: string, right: string, totalWidth: number): string {
  const rightLen = right.length;
  const leftWidth = totalWidth - rightLen;
  if (leftWidth <= 0) return left + right;
  const wrappedLeft = wrapText(left, leftWidth);
  const leftLines = wrappedLeft.split("\n");
  let result = "";
  leftLines.forEach((line, index) => {
    if (index === 0) {
      result += line.padEnd(leftWidth) + right;
    } else {
      result += "\n" + line;
    }
  });
  return result;
}

/**
 * Returns a dotted line exactly as wide as the printer.
 */
function dottedLineLocal(width: number): string {
  return ".".repeat(width) + "\n";
}

export interface Invoice {
  header?: string;
  invoiceType?: string;
  invNumber?: number | string;
  tin?: string;
  address?: string;
  fiscString?: string;
  opCode?: string;
  buCode?: string;
  Date?: string;
  FiscDateRange?: string;
  TaxPointDate?: string;
  lines?: Array<{
    productName?: string;
    quantity?: number;
    price?: number;
    fullPrice?: number;
    discountAmount?: number;
    uom?: string;
  }>;
  totalPriceNoVat?: number;
  vat?: Array<{
    vatType?: string;
    amount?: number;
  }>;
  totalDiscount?: number;
  totalPrice?: number;
  Exrate?: number;
  CustomerName?: string;
  CustomerTin?: string;
  CustomerContact?: string;
  CustomerAddress?: string;
  qrCode?: string;
  qrSize?: number;
  IIC?: string;
  FIC?: string;
  EIC?: string;
  Footer?: string;
}

// Formatter receives the invoice and the printer width (default 48).
export function formatInvoice(invoice: Invoice, printerWidth?: number): string {
  if (!invoice || typeof invoice !== 'object') {
    console.error("Invalid invoice data received.");
    return "";
  }

  const width = printerWidth || 48;
  let commands = "";

  // **Header Section (centered)**
  // Use ESC/POS center alignment for header items.
  commands += centerText(width); // Align center
  if (invoice.header) {
    commands += wrapText(invoice.header, width) + "\n";
  }
  if (invoice.tin) {
    commands += wrapText(invoice.tin, width) + "\n";
  }
  if (invoice.address) {
    commands += wrapText(invoice.address, width) + "\n";
  }
  if (invoice.invoiceType) {
    commands += boldText();
    commands += setTextSize(1);
    // Invoice type is printed centered using the printer's alignment.
    commands += invoice.invoiceType + "\n";
    commands += reset();
  }
  commands += reset(); // Reset to default settings

  // **Invoice Details**
  if (invoice.invNumber != null) {
    commands += wrapText("Nr. Fatures: " + invoice.invNumber, width) + "\n";
  }
  if(invoice.fiscString != null) {
    commands += wrapText(invoice.fiscString, width) + "\n";
  }
  if (invoice.buCode != null) {
    commands += wrapText("Njesia e Biznesit: " + invoice.buCode, width) + "\n";
  }
  if (invoice.opCode != null) {
    commands += wrapText("Kodi Operatorit: " + invoice.opCode, width) + "\n";
  }
  if (invoice.Date != null) {
    commands += wrapText("Data: " + invoice.Date, width) + "\n";
  }
  if (invoice.FiscDateRange != null) {
    commands += wrapText("Periudha e faturimit: " + invoice.FiscDateRange, width) + "\n";
  }
  if (invoice.TaxPointDate != null) {
    commands += wrapText("Tax point date: " + invoice.TaxPointDate, width) + "\n";
  }
  commands += dottedLineLocal(width);

  // **Products Section**
  if (Array.isArray(invoice.lines) && invoice.lines.length > 0) {
    invoice.lines.forEach((line) => {
      if (line.quantity != null && line.price != null) {
        const leftText = `${line.quantity}  ${line.uom ?? ""}  x ${Number(line.price).toFixed(2)}L`;
        if (line.fullPrice != null) {
          const rightText = `${Number(line.fullPrice).toFixed(2)}L`;
          commands += leftRightTextWrapped(leftText, rightText, width) + "\n";
        } else {
          commands += wrapText(leftText, width) + "\n";
        }
        if (line.discountAmount != null) {
          const leftDiscount = line.productName ?? "";
          const afterDiscount = (line.fullPrice ?? 0) - line.discountAmount;
          const rightDiscount = " -" + line.discountAmount.toString() + "L " + afterDiscount.toString() + "L";
          commands += leftRightTextWrapped(leftDiscount, rightDiscount, width) + "\n";
        } else {
          const leftProd = line.productName ?? "";
          commands += leftRightTextWrapped(leftProd, "", width) + "\n";
        }
      }
    });
    commands += dottedLineLocal(width);
  }

  // **Totals**
  if (invoice.totalPriceNoVat != null) {
    const leftText = "SHUMA PA TVSH";
    const rightText = invoice.totalPriceNoVat + "L";
    commands += leftRightTextWrapped(leftText, rightText, width) + "\n";
  }
  if (invoice.totalDiscount != null) {
    const leftText = "ZBRITJA TOTALE";
    const rightText = invoice.totalDiscount.toString() + "L";
    commands += leftRightTextWrapped(leftText, rightText, width) + "\n";
  }

  // **VAT Section**
  if (Array.isArray(invoice.vat) && invoice.vat.length > 0) {
    invoice.vat.forEach((vatItem) => {
      if (vatItem.vatType != null && vatItem.amount != null) {
        const leftText = "TVSH " + vatItem.vatType;
        const rightText = vatItem.amount + "L";
        commands += leftRightTextWrapped(leftText, rightText, width) + "\n";
      }
    });
  }

  if (invoice.totalPrice != null) {
    commands += boldText();
    const leftText = "SHUMA Leke";
    const rightText = invoice.totalPrice + "L";
    commands += leftRightTextWrapped(leftText, rightText, width) + "\n";
    commands += reset();
  }

  commands += reset();

  // **Customer Info (centered)**
  commands += centerWrap(
    (invoice.CustomerName || "") +
    (invoice.CustomerTin ? "\n" + invoice.CustomerTin : "") +
    (invoice.CustomerContact ? "\n" + invoice.CustomerContact : "") +
    (invoice.CustomerAddress ? "\n" + invoice.CustomerAddress : ""),
    width
  ) + "\n";
  commands += reset();
  commands += addBreaks(1);

  // **QR Code (centered)**
  if (invoice.qrCode) {
    const qrSize = invoice.qrSize ?? 7;
    commands += printQRCode(invoice.qrCode, qrSize);
  }

  if (invoice.IIC) {
    commands += centerWrap("IIC:" + invoice.IIC, width) + "\n";
  }
  if (invoice.FIC) {
    commands += centerWrap("FIC:" + invoice.FIC, width) + "\n";
  }
  if (invoice.EIC) {
    commands += centerWrap("EIC:" + invoice.EIC, width) + "\n";
  }
  

  // **Footer (centered)**
  if (invoice.Footer) {
    commands += centerWrap(invoice.Footer, width) + "\n";
  }

  commands += addBreaks(4);
  return commands;
}
