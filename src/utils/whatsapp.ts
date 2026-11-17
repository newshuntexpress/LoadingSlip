import { TicketRecord } from '../types';

export interface WhatsAppTemplate {
  id: string;
  titleHindi: string;
  titleEnglish: string;
  icon: string;
  generateText: (ticket: TicketRecord, companyName: string) => string;
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'gate_call',
    titleHindi: 'Call to Gate (Next in Queue)',
    titleEnglish: 'Gate Calling Notification',
    icon: 'Megaphone',
    generateText: (ticket, companyName) => {
      return `📢 *Loading Alert | Call to Gate*
🏢 *${companyName}*

Dear Driver *${ticket.driverName || 'Partner'}*,
Your vehicle *${ticket.truckNumber}* has been called for loading at *${ticket.gateNumber}*.

📌 *Ticket No:* ${ticket.ticketNumber}
🔢 *Daily Seq:* #${ticket.sequenceNumber}
🚪 *Loading Gate:* ${ticket.gateNumber}
⏳ *Status:* You are next in line at this gate!

⚠️ *Please place your truck at ${ticket.gateNumber} and report to the Loading Boy or Forklift Operator.*
Thank you!`;
    },
  },
  {
    id: 'token_generated',
    titleHindi: 'Ticket Issued & Gate Position',
    titleEnglish: 'Token Registration Receipt',
    icon: 'Ticket',
    generateText: (ticket, companyName) => {
      return `🎫 *Material Loading Ticket*
🏢 *${companyName}*

Hello *${ticket.driverName || 'Partner'}*,
Your vehicle inward entry has been registered successfully.

📋 *Ticket Details:*
• Vehicle Number: *${ticket.truckNumber}*
• Ticket Number: *${ticket.ticketNumber}*
• Daily Overall Sequence: *#${ticket.sequenceNumber}*
• Assigned Gate: *${ticket.gateNumber}*
• Position at Gate: *#${ticket.gateSequenceNumber}*
• Inward Time: ${ticket.timeIn}

🔔 *You will receive a WhatsApp alert when your turn is called at the gate. Please wait in the outside parking safe place.*`;
    },
  },
  {
    id: 'under_loading',
    titleHindi: 'Under Loading Confirmation',
    titleEnglish: 'Loading Commenced Alert',
    icon: 'Loader2',
    generateText: (ticket, companyName) => {
      return `🏗️ *Loading in Progress | Under Loading*
🏢 *${companyName}*

Driver *${ticket.driverName || 'Partner'}*,
Loading for vehicle *${ticket.truckNumber}* has commenced at *${ticket.gateNumber}*.

• Ticket No: ${ticket.ticketNumber}
• Gate: ${ticket.gateNumber}
• Time: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}

⚠️ Please adhere to plant safety protocols (Safety Shoes & Helmet) during material tally and loading.`;
    },
  },
  {
    id: 'completed_dispatch',
    titleHindi: 'Loading Completed & Slip Ready',
    titleEnglish: 'Dispatch & Gatepass Ready',
    icon: 'CheckCircle2',
    generateText: (ticket, companyName) => {
      const slip = ticket.loadingSlip;
      return `✅ *Loading Completed | Ready for Dispatch*
🏢 *${companyName}*

Loading for vehicle *${ticket.truckNumber}* at *${ticket.gateNumber}* has been successfully completed.

📄 *Dispatch Summary:*
• Delivery Note No: *${slip?.delNoteNumber || 'Issued'}*
• Destination Place: *${ticket.destinationPlace || slip?.placeName || 'N/A'}*
• Total Quantity: *${slip?.totalQty || '0'}*
• Total Pallets: *${slip?.totalPallets || '0'}*
• Loose Rolls/Packages: *${slip?.totalLooseRolls || '0'}*

Please collect your 2-copy Delivery Note from the Dispatch Office.
🛣️ *Have a safe journey!*`;
    },
  },
];

/**
 * Formats any input phone number to the standard Saudi international format +966XXXXXXXXX
 * If user inputs:
 *  - "0550000000" -> "+966550000000"
 *  - "0500000000" -> "+966500000000"
 *  - "550000000"  -> "+966550000000"
 *  - "+966550000000" -> "+966550000000"
 *  - "966550000000"  -> "+966550000000"
 *  - "00966550000000" -> "+966550000000"
 */
export function formatSaudiPhoneNumber(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Extract digits only
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed.startsWith('+') ? trimmed : '';

  // Case 1: Starts with 00966
  if (digits.startsWith('00966')) {
    const rest = digits.slice(5);
    return '+966' + (rest.startsWith('0') ? rest.slice(1) : rest);
  }

  // Case 2: Starts with 966
  if (digits.startsWith('966')) {
    const rest = digits.slice(3);
    return '+966' + (rest.startsWith('0') ? rest.slice(1) : rest);
  }

  // Case 3: Local Saudi mobile format 05XXXXXXXX (10 digits starting with 0)
  if (digits.startsWith('0')) {
    // Drop the leading 0 and attach +966 -> e.g. 0550000000 -> +966550000000
    return '+966' + digits.slice(1);
  }

  // Case 4: 9 digits starting with 5 (e.g. 550000000)
  if (digits.length === 9 && digits.startsWith('5')) {
    return '+966' + digits;
  }

  // If already starts with + and has country code
  if (trimmed.startsWith('+')) {
    return trimmed;
  }

  // Default fallback: attach +966
  return '+966' + digits;
}

/**
 * Clean phone number for WhatsApp Web / API URL:
 * WhatsApp API requires purely numerical country code + subscriber number (e.g. 966550000000)
 * without +, spaces, brackets, or dashes.
 */
export function cleanPhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  const formatted = formatSaudiPhoneNumber(rawPhone);
  const digits = formatted.replace(/\D/g, '');
  // If digits are e.g. 966055000000, remove the erroneous 0
  if (digits.startsWith('9660')) {
    return '966' + digits.slice(4);
  }
  return digits;
}

export function openWhatsAppChat(phone: string, message: string): void {
  const cleaned = cleanPhoneNumber(phone);
  const encodedText = encodeURIComponent(message);
  const url = `https://api.whatsapp.com/send?phone=${cleaned}&text=${encodedText}`;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
