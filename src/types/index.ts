export type TruckStatus = 'waiting' | 'called' | 'under_loading' | 'completed' | 'cancelled';

export interface LoadingSlipItem {
  srNo: number;
  description: string;
  pack: string;
  palletRatio?: string; // Auto-Pallet Ratio e.g. "23" (1 Pallet = 23 Rolls / Qty)
  qty: string;
  pallets: string;
  looseRolls: string;
  remarks?: string;
}

export interface LoadingSlipData {
  delNoteNumber: string;
  placeName: string;
  items: LoadingSlipItem[];
  totalQty: number;
  totalPallets: number;
  totalLooseRolls: number;
  preparedBy: string;
  checkedBy: string; // Now used for Forklift Operator / Loaded By
  loadedBy?: string;  // Forklift Operator / Loaded By
  driverSignatureNotes?: string;
  createdAt: string;
}

export interface TicketRecord {
  id: string;
  ticketNumber: string;       // e.g. "TK-20261110-001"
  sequenceNumber: number;     // Daily sequence (1, 2, 3...)
  date: string;               // YYYY-MM-DD
  timeIn: string;             // HH:MM:SS
  timeCalled?: string;
  timeLoadingStarted?: string;
  timeCompleted?: string;
  gateNumber: string;         // e.g. "Gate 1", "Gate 2"
  gateSequenceNumber: number; // Position at this specific gate queue
  truckNumber: string;        // e.g. "5275 AXG"
  driverName: string;
  driverPhone: string;        // e.g. "0500000000"
  iqamaNumber?: string;       // ID / Iqama Number
  transporterName: string;
  destinationPlace: string;   // Place / destination name
  delNoteNumber?: string;     // e.g. "A1DD00001" (Mandatory for ticket creation)
  status: TruckStatus;
  loadingSlip?: LoadingSlipData;
  remarks?: string;
  priority?: 'normal' | 'urgent';
  createdAt: number;
  updatedAt: number;
}

export interface DriverMasterRecord {
  id: string;
  truckNumber: string;
  driverName: string;
  driverPhone: string;
  iqamaNumber?: string;       // ID / Iqama Number
  transporterName: string;
  defaultDestination?: string;
  lastVisited: string;
  tripCount: number;
}

export interface CompanySettings {
  companyName: string;
  companySubtitle: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  gates: string[]; // ["Gate 1", "Gate 2", "Gate 3", "Gate 4"]
  ticketPrefix: string;
  autoPrintTokenAfterSave?: boolean; // New setting
}
