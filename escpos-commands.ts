/**
 * Sets the text size for all subsequent text.
 * Level: 1 = largest, 2 = double, else = normal.
 */
export function setTextSize(level: number): string {
  // For simplicity, only level 1 and 2 are supported.
  if (level <= 1) {
    // Largest (for example, double height and width)
    return '\x1D\x21\x11';
  } else if (level === 2) {
    return '\x1D\x21\x22';
  } else {
    return '\x1D\x21\x00';
  }
}

/**
 * Returns ESC/POS commands to print a QR code for the provided data.
 * @param data The data to encode in the QR code.
 * @param moduleSize The module size (scaling factor). Default is 4.
 */
export function printQRCode(data: string, moduleSize: number = 4): string {
  // Clamp moduleSize between 1 and 8
  const size = Math.max(1, Math.min(moduleSize, 8));
  
  // Set QR code model to 2
  const modelCommand = '\x1D\x28\x6B\x04\x00\x31\x41\x32\x00';
  
  // Set module size
  const sizeCommand = '\x1D\x28\x6B\x03\x00\x31\x43' + String.fromCharCode(size);
  
  // Set error correction level to 51 (adjust as needed)
  const errorCommand = '\x1D\x28\x6B\x03\x00\x31\x45' + String.fromCharCode(48);
  
  // Store the data in the symbol
  const storeLen = data.length + 3;
  const pL = String.fromCharCode(storeLen & 0xff);
  const pH = String.fromCharCode((storeLen >> 8) & 0xff);
  const storeCommand = '\x1D\x28\x6B' + pL + pH + '\x31\x50\x30' + data;
  
  // Print the QR code
  const printCommand = '\x1D\x28\x6B\x03\x00\x31\x51\x30';

  // Use center alignment for QR code printing
  const centerOn = '\x1B\x61\x01';
  const centerOff = '\x1B\x61\x00';

  return centerOn + modelCommand + sizeCommand + errorCommand + storeCommand + printCommand + centerOff;
}

/**
 * Returns ESC/POS commands to feed n lines.
 */
export function addBreaks(n: number): string {
  return '\x1B' + 'd' + String.fromCharCode(n);
}

/**
 * Returns ESC/POS command to set center alignment.
 */
export function centerText(width: number): string {
  // This command sets alignment to center.
  return '\x1B\x61\x01';
}

/**
 * Returns ESC/POS commands to print text in bold.
 */
export function boldText(): string {
  return '\x1B\x45\x01';
}

/**
 * Returns a string that prints a dotted line.
 */
export function dottedLine(length: number = 48, char: string = '.'): string {
  return char.repeat(length) + '\n';
}

/**
 * Returns ESC/POS command to align text to the right.
 */
export function rightAlignText(): string {
  return '\x1B\x61\x02';
}

/**
 * Returns ESC/POS command to reset the printer.
 */
export function reset(): string {
  return '\x1B\x40';
}

/**
 * Helper function to align two pieces of text on the same line.
 */
export function leftRightText(left: string, right: string, totalWidth: number = 48): string {
  const leftLength = left.length;
  const rightLength = right.length;
  const spacesCount = totalWidth - leftLength - rightLength;
  const spaces = spacesCount > 0 ? " ".repeat(spacesCount) : "";
  return left + spaces + right;
}
