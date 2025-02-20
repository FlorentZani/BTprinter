// invoiceFormatter.ts
import { 
    centerText, 
    setTextSize, 
    addBreaks, 
    dottedLine, 
    printQRCode, 
    rightAlignText,
    leftRightText,
    reset,
    boldText,
  } from './escpos-commands';
  
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
      vatType?:string,
      amount?:number
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
    Footer?: string;
  }
  
  export function formatInvoice(invoice: Invoice): string {
    // Ensure we have a valid invoice object
    if (!invoice || typeof invoice !== 'object') {
      console.error("Invalid invoice data received.");
      return "";
    }
  
    let commands = "";
     
    commands += centerText();
    // **Header Section**
    if (invoice.header) {
      commands += invoice.header + "\n";
    }
    if (invoice.tin) {
      commands += invoice.tin+ "\n";
    }
    if (invoice.address) {
      commands += invoice.address + "\n";
    }
    if (invoice.invoiceType) {
        commands += boldText();
      commands += setTextSize(1);
      commands += invoice.invoiceType + "\n";
      commands += reset();
    }
    commands += reset();
    
    // **Invoice Details**
    if (invoice.invNumber != null) {
      commands += "Nr. Fatures: " + invoice.invNumber + "\n";
    }
    if(invoice.buCode != null){
        commands += "Njesia e Biznesit: " + invoice.buCode + "\n";
    }
    if(invoice.opCode != null){
        commands += "Kodi Operatorit: " + invoice.opCode + "\n";
    }
    if (invoice.Date != null) {
        commands += "Data: " + invoice.Date + "\n";
      }
    commands += dottedLine(48);
  
    // **Products Section**
    if (Array.isArray(invoice.lines) && invoice.lines.length > 0) {
      invoice.lines.forEach((line) => {
        if (line.quantity != null && line.price != null) {
          // Build the left part: quantity, unit, and price.
          const leftText = `${line.quantity}  ${line.uom ?? ""}  x ${Number(line.price).toFixed(2)}L`;
          if (line.fullPrice != null) {
            // Build the right part: full price.
            const rightText = `${Number(line.fullPrice).toFixed(2)}L`;
            // Combine them on one line, with the right text aligned to the right.
            commands += leftRightText(leftText, rightText) + "\n";
          } else {
            commands += leftText + "\n";
          }
          // If discount is present, align it to the right on a new line.
          if (line.discountAmount != null) {
            const leftText = line.productName ?? "";
            const afterDiscount = (line.fullPrice ?? 0) - line.discountAmount;
            const rightText = " -" + line.discountAmount.toString() + "L " + afterDiscount.toString() + "L";
            commands += leftRightText(leftText, rightText) + "\n";
          }
          else
          {
            commands += rightAlignText();
            commands += line.fullPrice + "\n";
          }
        }
      });
      commands += dottedLine(48);
    }

      
      // **Totals**
      if (invoice.totalPriceNoVat != null) {
        const leftText = "SHUMA PA TVSH";
        const rightText = invoice.totalPriceNoVat + "L";
        commands += leftRightText(leftText, rightText) + "\n";
      }
      if (invoice.totalDiscount != null) {
        const leftText = "ZBRITJA TOTALE";
        const rightText = invoice.totalDiscount.toString() + "L";
        commands += leftRightText(leftText, rightText) + "\n";
      }

      // **VAT Section**
      if (Array.isArray(invoice.vat) && invoice.vat.length > 0) {
        invoice.vat.forEach((vatItem) => {
          // Check that both vatType and amount exist before printing.
          if (vatItem.vatType != null && vatItem.amount != null) {
            const leftText = "TVSH " + vatItem.vatType;
            const rightText = vatItem.amount + "L";
            commands += leftRightText(leftText, rightText) + "\n";
          }
        });
      }

      if (invoice.totalPrice != null) {
        commands += boldText();
        const leftText = "SHUMA Leke";
        const rightText = invoice.totalPrice + "L";
        commands += leftRightText(leftText, rightText) + "\n";
        commands += reset();
      }

    commands += reset();
    // **Customer Info**
    commands += centerText();
    if(invoice.CustomerName || invoice.CustomerTin || invoice.CustomerContact || invoice.CustomerAddress){
        commands += dottedLine(48);
    }
     if (invoice.CustomerName) {
       commands +=  invoice.CustomerName + "\n";
     }
     if (invoice.CustomerTin) {
       commands +=  invoice.CustomerTin + "\n";
     }
     if (invoice.CustomerContact) {
       commands +=  invoice.CustomerContact + "\n";
     }
     if (invoice.CustomerAddress) {
       commands += invoice.CustomerAddress + "\n";
     }
     commands += reset();
     commands += addBreaks(1);
    
     // **QR Code**
     if (invoice.qrCode) {
       const qrSize = invoice.qrSize ?? 7;
       commands += printQRCode(invoice.qrCode, qrSize);;
     }
  
     commands += centerText();
     // **IIC / FIC Codes**
     if (invoice.IIC) {
       commands += "IIC: " + invoice.IIC + "\n";
     }
     if (invoice.FIC) {
       commands += "FIC: " + invoice.FIC + "\n";
     }
     
  
     // **Footer**
     if (invoice.Footer) {
       commands += invoice.Footer + "\n";
     }
     
    commands += addBreaks(4);
    return commands;

  }
