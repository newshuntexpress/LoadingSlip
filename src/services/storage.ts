import { TicketRecord, DriverMasterRecord, CompanySettings, LoadingSlipItem } from '../types';
import { formatSaudiPhoneNumber } from '../utils/whatsapp';

const STORAGE_KEYS = {
  TICKETS: 'mat_loading_tickets_v1',
  DRIVERS: 'mat_loading_drivers_v1',
  SETTINGS: 'mat_loading_settings_v1',
};

export const DEFAULT_SETTINGS: CompanySettings = {
  companyName: 'SHREE BALAJI LOGISTICS & INDUSTRIAL PLANT',
  companySubtitle: 'Material Dispatch, Gate Queue & Loading Slip Management System',
  address: 'Plot No. 48-52, Industrial Area, Sector 5, Transport District',
  phone: '+966 11 456 7890',
  email: 'dispatch@balajilogistics.com',
  gstin: '310123456700003',
  gates: ['Gate 1', 'Gate 2', 'Gate 3', 'Gate 4'],
  ticketPrefix: 'TK',
  autoPrintTokenAfterSave: true,
};

export function getTodayDateString(): string {
  const now = new Date();
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  const monthIdx = parseInt(month, 10) - 1;
  const monthName = MONTH_NAMES[monthIdx] || month;
  return `${day}-${monthName}-${year}`;
}

export function getCurrentTimeString(): string {
  const d = new Date();
  return d.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
}

export function createEmpty8Rows(): LoadingSlipItem[] {
  return Array.from({ length: 8 }, (_, i) => ({
    srNo: i + 1,
    description: '',
    pack: '',
    palletRatio: '23',
    qty: '',
    pallets: '',
    looseRolls: '',
    remarks: '',
  }));
}

// Seed sample records if storage is empty
const SAMPLE_DRIVERS: DriverMasterRecord[] = [
  {
    id: 'drv-1',
    truckNumber: '5275 AXG',
    driverName: 'Rameshwar Yadav',
    driverPhone: '+966550000000',
    iqamaNumber: '2481928491',
    transporterName: 'Al-Majd Freight Lines',
    defaultDestination: 'Central Warehouse Riyadh',
    lastVisited: getTodayDateString(),
    tripCount: 14,
  },
  {
    id: 'drv-2',
    truckNumber: '8912 TBD',
    driverName: 'Kuldeep Singh',
    driverPhone: '+966551234567',
    iqamaNumber: '2398102948',
    transporterName: 'Express Logistics Services',
    defaultDestination: 'Jeddah Port Depot',
    lastVisited: getTodayDateString(),
    tripCount: 8,
  },
  {
    id: 'drv-3',
    truckNumber: '4410 KSA',
    driverName: 'Sunil Kumar',
    driverPhone: '+966569876543',
    iqamaNumber: '2219481920',
    transporterName: 'National Freight Carriers',
    defaultDestination: 'Dammam Industrial Hub',
    lastVisited: getTodayDateString(),
    tripCount: 21,
  },
  {
    id: 'drv-4',
    truckNumber: '7821 RTA',
    driverName: 'Mohd. Salim',
    driverPhone: '+966508899112',
    iqamaNumber: '2510293841',
    transporterName: 'Super Fast Cargo',
    defaultDestination: 'Yanbu Terminal',
    lastVisited: getTodayDateString(),
    tripCount: 5,
  },
];

function generateSampleTickets(): TicketRecord[] {
  const today = getTodayDateString();
  const prefix = DEFAULT_SETTINGS.ticketPrefix;
  const dateFormatted = today.replace(/-/g, '');

  return [
    {
      id: 'tkt-1',
      ticketNumber: `${prefix}-${dateFormatted}-001`,
      sequenceNumber: 1,
      date: today,
      timeIn: '08:15 AM',
      timeCalled: '08:45 AM',
      timeLoadingStarted: '09:05 AM',
      timeCompleted: '10:10 AM',
      gateNumber: 'Gate 2',
      gateSequenceNumber: 1,
      truckNumber: '5275 AXG',
      driverName: 'Rameshwar Yadav',
      driverPhone: '+966550000000',
      iqamaNumber: '2481928491',
      transporterName: 'Al-Majd Freight Lines',
      destinationPlace: 'Central Warehouse Riyadh',
      status: 'completed',
      priority: 'normal',
      createdAt: Date.now() - 7200000,
      updatedAt: Date.now() - 3600000,
      delNoteNumber: 'A1DD00001',
      loadingSlip: {
        delNoteNumber: 'A1DD00001',
        placeName: 'Central Warehouse Riyadh',
        preparedBy: '',
        checkedBy: '',
        driverSignatureNotes: 'Received material in sound condition',
        totalQty: 480,
        totalPallets: 18,
        totalLooseRolls: 45,
        createdAt: today,
        items: [
          { srNo: 1, description: 'Industrial Kraft Paper Rolls 120 GSM', pack: 'Rolls', qty: '120', pallets: '4', looseRolls: '12', remarks: 'Batch A-1' },
          { srNo: 2, description: 'Corrugated Fluting Rolls 140 GSM', pack: 'Rolls', qty: '100', pallets: '4', looseRolls: '10', remarks: 'Grade I' },
          { srNo: 3, description: 'Duplex Board Packaging Sheets', pack: 'Board', qty: '80', pallets: '3', looseRolls: '0', remarks: 'Moisture proof' },
          { srNo: 4, description: 'Stretch Wrap Film Bundles', pack: 'EA', qty: '60', pallets: '2', looseRolls: '15', remarks: 'Clear 23 Mic' },
          { srNo: 5, description: 'Polypropylene Strapping Rolls', pack: 'Rolls', qty: '50', pallets: '2', looseRolls: '8', remarks: '12mm Blue' },
          { srNo: 6, description: 'Industrial Adhesive Gum Drums', pack: 'Drum', qty: '40', pallets: '2', looseRolls: '0', remarks: '50 Kg drums' },
          { srNo: 7, description: 'Coating Solvent Cans', pack: 'Can', qty: '30', pallets: '1', looseRolls: '0', remarks: '20L Can' },
          { srNo: 8, description: '', pack: '', qty: '', pallets: '', looseRolls: '', remarks: '' },
        ],
      },
    },
    {
      id: 'tkt-2',
      ticketNumber: `${prefix}-${dateFormatted}-002`,
      sequenceNumber: 2,
      date: today,
      timeIn: '09:20 AM',
      timeCalled: '09:40 AM',
      timeLoadingStarted: '10:00 AM',
      gateNumber: 'Gate 2',
      gateSequenceNumber: 1,
      truckNumber: '4410 KSA',
      driverName: 'Sunil Kumar',
      driverPhone: '+966569876543',
      iqamaNumber: '2219481920',
      transporterName: 'National Freight Carriers',
      destinationPlace: 'Dammam Industrial Hub',
      status: 'under_loading',
      priority: 'urgent',
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 1800000,
      loadingSlip: {
        delNoteNumber: 'DN-2026/0892',
        placeName: 'Dammam Industrial Hub',
        preparedBy: 'Dinesh Sharma (Dispatcher)',
        checkedBy: '',
        totalQty: 350,
        totalPallets: 14,
        totalLooseRolls: 24,
        createdAt: today,
        items: [
          { srNo: 1, description: 'Virgin Kraft Liner Paper 180 GSM', pack: 'Rolls', qty: '140', pallets: '6', looseRolls: '14', remarks: 'Priority Order' },
          { srNo: 2, description: 'Heavy Duty Box Rolls', pack: 'Rolls', qty: '110', pallets: '5', looseRolls: '10', remarks: 'High BF' },
          { srNo: 3, description: 'Adhesive Gum Drums 50Kg', pack: 'Drum', qty: '60', pallets: '2', looseRolls: '0', remarks: 'D-50 Grade' },
          { srNo: 4, description: 'Industrial Chemical Raw material', pack: 'KG', qty: '40', pallets: '1', looseRolls: '0', remarks: 'Sealed bags' },
          { srNo: 5, description: '', pack: '', qty: '', pallets: '', looseRolls: '', remarks: '' },
          { srNo: 6, description: '', pack: '', qty: '', pallets: '', looseRolls: '', remarks: '' },
          { srNo: 7, description: '', pack: '', qty: '', pallets: '', looseRolls: '', remarks: '' },
          { srNo: 8, description: '', pack: '', qty: '', pallets: '', looseRolls: '', remarks: '' },
        ],
      },
    },
    {
      id: 'tkt-3',
      ticketNumber: `${prefix}-${dateFormatted}-003`,
      sequenceNumber: 3,
      date: today,
      timeIn: '09:50 AM',
      timeCalled: '10:15 AM',
      gateNumber: 'Gate 1',
      gateSequenceNumber: 1,
      truckNumber: '8912 TBD',
      driverName: 'Kuldeep Singh',
      driverPhone: '+966551234567',
      iqamaNumber: '2398102948',
      transporterName: 'Express Logistics Services',
      destinationPlace: 'Jeddah Port Depot',
      status: 'called',
      priority: 'normal',
      createdAt: Date.now() - 2400000,
      updatedAt: Date.now() - 600000,
    },
    {
      id: 'tkt-4',
      ticketNumber: `${prefix}-${dateFormatted}-004`,
      sequenceNumber: 4,
      date: today,
      timeIn: '10:10 AM',
      gateNumber: 'Gate 2',
      gateSequenceNumber: 2,
      truckNumber: '7821 RTA',
      driverName: 'Mohd. Salim',
      driverPhone: '+966508899112',
      iqamaNumber: '2510293841',
      transporterName: 'Super Fast Cargo',
      destinationPlace: 'Yanbu Terminal',
      status: 'waiting',
      priority: 'normal',
      createdAt: Date.now() - 1200000,
      updatedAt: Date.now() - 1200000,
    },
  ];
}

// STORAGE API
export const StorageService = {
  getSettings(): CompanySettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings(settings: CompanySettings): void {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },

  getTickets(): TicketRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TICKETS);
      if (data) {
        const parsed: TicketRecord[] = JSON.parse(data);
        return parsed.map((t) => ({
          ...t,
          driverPhone: formatSaudiPhoneNumber(t.driverPhone),
        }));
      }
    } catch (e) {
      console.error('Failed to load tickets:', e);
    }
    // Seed initial records if empty
    const initial = generateSampleTickets();
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(initial));
    return initial;
  },

  saveTickets(tickets: TicketRecord[]): void {
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(tickets));
  },

  getDrivers(): DriverMasterRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DRIVERS);
      if (data) {
        const parsed: DriverMasterRecord[] = JSON.parse(data);
        return parsed.map((d) => ({
          ...d,
          driverPhone: formatSaudiPhoneNumber(d.driverPhone),
        }));
      }
    } catch (e) {
      console.error('Failed to load drivers:', e);
    }
    localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(SAMPLE_DRIVERS));
    return SAMPLE_DRIVERS;
  },

  saveDrivers(drivers: DriverMasterRecord[]): void {
    const normalized = drivers.map((d) => ({
      ...d,
      driverPhone: formatSaudiPhoneNumber(d.driverPhone),
    }));
    localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(normalized));
  },

  // Save or update driver in master
  updateDriverMaster(
    truckNumber: string,
    driverName: string,
    driverPhone: string,
    transporterName: string,
    destination?: string,
    iqamaNumber?: string
  ): void {
    if (!truckNumber.trim()) return;
    const cleanTruck = truckNumber.trim().toUpperCase();
    const cleanPhone = formatSaudiPhoneNumber(driverPhone);
    const drivers = this.getDrivers();
    const existingIndex = drivers.findIndex((d) => d.truckNumber.toUpperCase() === cleanTruck);

    if (existingIndex >= 0) {
      drivers[existingIndex] = {
        ...drivers[existingIndex],
        driverName: driverName.trim() || drivers[existingIndex].driverName,
        driverPhone: cleanPhone || drivers[existingIndex].driverPhone,
        iqamaNumber: iqamaNumber?.trim() || drivers[existingIndex].iqamaNumber,
        transporterName: transporterName.trim() || drivers[existingIndex].transporterName,
        defaultDestination: destination?.trim() || drivers[existingIndex].defaultDestination,
        lastVisited: getTodayDateString(),
        tripCount: (drivers[existingIndex].tripCount || 1) + 1,
      };
    } else {
      drivers.unshift({
        id: 'drv-' + Date.now(),
        truckNumber: cleanTruck,
        driverName: driverName.trim(),
        driverPhone: cleanPhone,
        iqamaNumber: iqamaNumber?.trim(),
        transporterName: transporterName.trim(),
        defaultDestination: destination?.trim(),
        lastVisited: getTodayDateString(),
        tripCount: 1,
      });
    }
    this.saveDrivers(drivers);
  },

  // Calculate Next Daily Sequence for a specific date
  getNextDailySequence(date: string): number {
    const tickets = this.getTickets();
    const dayTickets = tickets.filter((t) => t.date === date);
    if (dayTickets.length === 0) return 1;
    const maxSeq = Math.max(...dayTickets.map((t) => t.sequenceNumber || 0));
    return maxSeq + 1;
  },

  // Generate Automatic Ticket Number
  generateTicketNumber(date: string, nextSeq: number): string {
    const settings = this.getSettings();
    const dateFormatted = date.replace(/-/g, '');
    const seqStr = String(nextSeq).padStart(3, '0');
    return `${settings.ticketPrefix}-${dateFormatted}-${seqStr}`;
  },

  // Calculate current gate queue position for a ticket
  getGateQueueInfo(gateNumber: string, date: string, currentTicketId?: string): {
    currentLoading?: TicketRecord;
    calledTruck?: TicketRecord;
    waitingQueue: TicketRecord[];
    myPositionAtGate: number;
    aheadCount: number;
  } {
    const tickets = this.getTickets().filter((t) => t.date === date && t.gateNumber === gateNumber);
    const currentLoading = tickets.find((t) => t.status === 'under_loading');
    const calledTruck = tickets.find((t) => t.status === 'called');
    const waitingQueue = tickets
      .filter((t) => t.status === 'waiting')
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    let myPositionAtGate = 1;
    let aheadCount = 0;

    if (currentTicketId) {
      const current = tickets.find((t) => t.id === currentTicketId);
      if (current) {
        if (current.status === 'under_loading') {
          myPositionAtGate = 0; // Currently loading
          aheadCount = 0;
        } else if (current.status === 'called') {
          myPositionAtGate = 1; // Called, at the gate
          aheadCount = 0;
        } else if (current.status === 'waiting') {
          const indexInWaiting = waitingQueue.findIndex((t) => t.id === currentTicketId);
          // Count active trucks ahead (under loading + called)
          const activeAhead = (currentLoading ? 1 : 0) + (calledTruck ? 1 : 0);
          myPositionAtGate = activeAhead + (indexInWaiting >= 0 ? indexInWaiting + 1 : waitingQueue.length + 1);
          aheadCount = activeAhead + (indexInWaiting >= 0 ? indexInWaiting : waitingQueue.length);
        } else {
          myPositionAtGate = 0;
          aheadCount = 0;
        }
      }
    } else {
      // For a new prospective ticket at this gate
      const activeAhead = (currentLoading ? 1 : 0) + (calledTruck ? 1 : 0);
      aheadCount = activeAhead + waitingQueue.length;
      myPositionAtGate = aheadCount + 1;
    }

    return {
      currentLoading,
      calledTruck,
      waitingQueue,
      myPositionAtGate,
      aheadCount,
    };
  },

  // Add a new ticket
  addTicket(data: Omit<TicketRecord, 'id' | 'createdAt' | 'updatedAt'>): TicketRecord {
    const tickets = this.getTickets();
    const formattedPhone = formatSaudiPhoneNumber(data.driverPhone);
    const newRecord: TicketRecord = {
      ...data,
      driverPhone: formattedPhone,
      id: 'tkt-' + Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      loadingSlip: data.loadingSlip || (data.delNoteNumber ? {
        delNoteNumber: data.delNoteNumber,
        placeName: data.destinationPlace || '',
        preparedBy: '',
        checkedBy: '',
        items: createEmpty8Rows(),
        totalQty: 0,
        totalPallets: 0,
        totalLooseRolls: 0,
        createdAt: data.date,
      } : undefined),
    };

    tickets.unshift(newRecord);
    this.saveTickets(tickets);

    // Auto-save to driver master
    this.updateDriverMaster(
      data.truckNumber,
      data.driverName,
      formattedPhone,
      data.transporterName,
      data.destinationPlace,
      data.iqamaNumber
    );

    return newRecord;
  },

  // Update existing ticket
  updateTicket(id: string, updates: Partial<TicketRecord>): TicketRecord | null {
    const tickets = this.getTickets();
    const idx = tickets.findIndex((t) => t.id === id);
    if (idx === -1) return null;

    const formattedUpdates = {
      ...updates,
      ...(updates.driverPhone ? { driverPhone: formatSaudiPhoneNumber(updates.driverPhone) } : {}),
      updatedAt: Date.now(),
    };

    const updated = {
      ...tickets[idx],
      ...formattedUpdates,
    };
    tickets[idx] = updated;
    this.saveTickets(tickets);

    // Auto update driver master if truck/driver modified
    if (updated.truckNumber) {
      this.updateDriverMaster(
        updated.truckNumber,
        updated.driverName,
        updated.driverPhone,
        updated.transporterName,
        updated.destinationPlace,
        updated.iqamaNumber
      );
    }

    return updated;
  },

  deleteTicket(id: string): void {
    const tickets = this.getTickets().filter((t) => t.id !== id);
    this.saveTickets(tickets);
  },

  restoreTicket(ticket: TicketRecord): void {
    const tickets = this.getTickets();
    if (!tickets.some((t) => t.id === ticket.id)) {
      tickets.push(ticket);
      this.saveTickets(tickets);
    }
  },

  // Export to CSV
  exportToCSV(tickets: TicketRecord[], dateStr?: string): void {
    const headers = [
      'Ticket No',
      'Daily Seq',
      'Date',
      'Time In',
      'Time Called',
      'Time Loading Started',
      'Time Completed',
      'Gate No',
      'Gate Seq No',
      'Truck No',
      'Driver Name',
      'Driver Phone',
      'ID / Iqama No',
      'Transporter',
      'Destination Place',
      'Status',
      'Del Note No',
      'Forklift Operator / Loaded By',
      'Total Qty',
      'Total Pallets',
      'Total Loose Rolls',
      'Remarks',
    ];

    const rows = tickets.map((t) => [
      t.ticketNumber,
      t.sequenceNumber,
      t.date,
      t.timeIn || '',
      t.timeCalled || '',
      t.timeLoadingStarted || '',
      t.timeCompleted || '',
      t.gateNumber,
      t.gateSequenceNumber,
      `"${t.truckNumber}"`,
      `"${t.driverName}"`,
      `"${t.driverPhone}"`,
      `"${t.iqamaNumber || ''}"`,
      `"${t.transporterName || ''}"`,
      `"${t.destinationPlace || ''}"`,
      t.status.toUpperCase(),
      t.loadingSlip?.delNoteNumber || '',
      `"${t.loadingSlip?.loadedBy || t.loadingSlip?.checkedBy || ''}"`,
      t.loadingSlip?.totalQty || '',
      t.loadingSlip?.totalPallets || '',
      t.loadingSlip?.totalLooseRolls || '',
      `"${t.remarks || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Loading_Tickets_${dateStr || getTodayDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
};
