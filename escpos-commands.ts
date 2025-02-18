// escpos-commands.ts

/**
 * Returns ESC/POS commands to print text in a selectable size.
 * Level: 1 = largest, 2 = medium-large, 3 = medium, 4 = normal.
 */
/**
 * Sets the text size for all subsequent text.
 * 
 * @param level A number from 1 (normal size) to 8 (largest). Values outside this range will be clamped.
 * @returns The ESC/POS command string to set the text size.
 */
/**
 * Returns the ESC/POS command to set the text size for all subsequent text.
 *
 * Supports levels 1 to 8, where:
 *   - Level 1 produces the largest text (8× multiplier)
 *   - Level 8 produces the normal text size (1× multiplier)
 *
 * Any level below 1 or above 8 will be clamped.
 *
 * @param level - The heading level (1 = largest, 8 = normal).
 * @returns The command string to set the text size.
 */
export function setTextSize(level: 1): string {
  // In ESC/POS, 0 represents normal size and 1 represents double size.
  // We map level 1 -> 0 (normal) and level 2 -> 1 (double).

  if(level == 1)
  {
  // ESC/POS command: GS ! n (0x1D, 0x21, n)
  return '\x1D\x21\x11';
  }
  if(level == 2)
  {
    return '\x1D\x21\x22';
  }
  else
  {
    return '\x1D\x21\x00';
  }
}


/**
 * Returns ESC/POS commands to print a QR code for the provided data.
 * @param data The data to encode in the QR code.
 * @param moduleSize The module size (scaling factor). Default is 4.
 */
export function printQRCode(data: string, moduleSize: number = 4): string {
  // Clamp moduleSize between 1 and 8 (since your printer supports up to 8)
  const size = Math.max(1, Math.min(moduleSize, 8));
  
  // Set QR code model to 2 (common requirement)
  const modelCommand = '\x1D\x28\x6B\x04\x00\x31\x41\x32\x00';
  
  // Set module size using the clamped value
  const sizeCommand = '\x1D\x28\x6B\x03\x00\x31\x43' + String.fromCharCode(size);
  
  // Set error correction level to 51 (for example, adjust if needed)
  const errorCommand = '\x1D\x28\x6B\x03\x00\x31\x45' + String.fromCharCode(51);
  
  // Prepare the store data command:
  // Data length + 3 bytes for the command
  const storeLen = data.length + 3;
  const pL = String.fromCharCode(storeLen & 0xff);
  const pH = String.fromCharCode((storeLen >> 8) & 0xff);
  const storeCommand = '\x1D\x28\x6B' + pL + pH + '\x31\x50\x30' + data;
  
  // Command to print the QR code
  const printCommand = '\x1D\x28\x6B\x03\x00\x31\x51\x30';

  // Alignment commands: Center ON and OFF
  const centerOn = '\x1B' + 'a' + String.fromCharCode(1);
  const centerOff = '\x1B' + 'a' + String.fromCharCode(0);

  return centerOn + modelCommand + sizeCommand + errorCommand + storeCommand + printCommand + centerOff;
}

/**
 * Returns ESC/POS commands to print a QR code using a "heading level" (1 = largest, 4 = smallest).
 * This function maps a level to a module size:
 *   Level 1 -> moduleSize = 16,
 *   Level 2 -> moduleSize = 6,
 *   Level 3 -> moduleSize = 4 (default),
 *   Level 4 -> moduleSize = 2.
 */
export function printQRCodeWithLevel(data: string, level: number = 3): string {
  let moduleSize: number;
  if (level === 1) {
    moduleSize = 16;
  } else if (level === 2) {
    moduleSize = 6;
  } else if (level === 3) {
    moduleSize = 4;
  } else {
    moduleSize = 2;
  }
  return printQRCode(data, moduleSize);
}

/**
 * Returns an ESC/POS command to feed 'n' lines (i.e. add line breaks).
 */
export function addBreaks(n: number): string {
  return '\x1B' + 'd' + String.fromCharCode(n);
}

/**
 * Returns an ESC/POS command to center text.
 * Uses ESC a 1 to set center alignment, and then resets to left (ESC a 0).
 */
export function centerText(): string {
  const setCenter = '\x1B\x61\x01';
  return setCenter;
}

/**
 * Returns ESC/POS commands to print text in bold.
 * Uses ESC E n where n=1 turns bold on and n=0 turns it off.
 */
export function boldText(): string {
  const boldOn = '\x1B\x45\x01';
  return boldOn;
}
/**
 * Returns a string that prints a dotted line.
 * You can adjust the character and length as needed.
 */
export function dottedLine(length: number = 48, char: string = '.'): string {
  return char.repeat(length) + '\n';
}
export function straightLine(length: number = 48, char: string = '-'): string {
  return char.repeat(length) + '\n';
}

/**
 * Returns ESC/POS commands to print text aligned to the right.
 * Uses ESC a 2 to set right alignment, and then resets to left (ESC a 0).
 */
export function rightAlignText(): string {
  const setRight = '\x1B\x61\x02'; // Right-align command
  return setRight;
}
export function reset(): string {
  // ESC @ resets the printer to its default settings.
  return '\x1B\x40';
}
/**
 * Helper function to align two pieces of text on the same line.
 * The left text is kept left aligned and the right text is positioned at the right margin.
 *
 * @param left - The left part of the text.
 * @param right - The right part of the text.
 * @param totalWidth - Total number of characters per line (default is 48).
 * @returns A single line with left and right text properly spaced.
 */
export function leftRightText(left: string, right: string, totalWidth: number = 48): string {
  const leftLength = left.length;
  const rightLength = right.length;
  const spacesCount = totalWidth - leftLength - rightLength;
  const spaces = spacesCount > 0 ? " ".repeat(spacesCount) : "";
  return left + spaces + right;
}