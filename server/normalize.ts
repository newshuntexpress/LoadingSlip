export function upperStr(val: unknown): string {
  return String(val ?? '').trim().toUpperCase();
}

const STANDARD_PACK_MAP = new Map<string, string>(
  ['Can', 'Drum', 'Board', 'EA', 'KG', 'Rolls', 'Pallet', 'Box'].map((opt) => [opt.toUpperCase(), opt])
);

function normalizePack(val: unknown): string {
  const raw = String(val ?? '').trim();
  if (!raw) return '';
  return STANDARD_PACK_MAP.get(raw.toUpperCase()) ?? raw.toUpperCase();
}

function trimStr(val: unknown): string {
  return String(val ?? '').trim();
}

export function normalizeLoadingSlip<T extends Record<string, any> | undefined>(slip: T): T {
  if (!slip || typeof slip !== 'object') return slip;
  const items = Array.isArray(slip.items)
    ? slip.items.map((item: any, idx: number) => ({
        ...item,
        srNo: item.srNo ?? idx + 1,
        description: upperStr(item.description),
        pack: normalizePack(item.pack),
        qty: item.qty !== undefined && item.qty !== null ? upperStr(item.qty) : '',
        loadedQty: item.loadedQty !== undefined && item.loadedQty !== null ? upperStr(item.loadedQty) : undefined,
        pallets: item.pallets !== undefined && item.pallets !== null ? upperStr(item.pallets) : '',
        looseRolls: item.looseRolls !== undefined && item.looseRolls !== null ? upperStr(item.looseRolls) : '',
        palletRatio: item.palletRatio !== undefined && item.palletRatio !== null ? upperStr(item.palletRatio) : undefined,
        remarks: upperStr(item.remarks),
        loadedByName: item.loadedByName !== undefined ? trimStr(item.loadedByName) : undefined,
      }))
    : undefined;

  return {
    ...slip,
    ...(slip.delNoteNumber !== undefined ? { delNoteNumber: upperStr(slip.delNoteNumber) } : {}),
    ...(slip.placeName !== undefined ? { placeName: upperStr(slip.placeName) } : {}),
    ...(slip.remarks !== undefined ? { remarks: upperStr(slip.remarks) } : {}),
    ...(slip.preparedBy !== undefined ? { preparedBy: trimStr(slip.preparedBy) } : {}),
    ...(slip.forkliftOperatorName !== undefined ? { forkliftOperatorName: trimStr(slip.forkliftOperatorName) } : {}),
    ...(slip.verifiedBy !== undefined ? { verifiedBy: trimStr(slip.verifiedBy) } : {}),
    ...(slip.checkedBy !== undefined ? { checkedBy: trimStr(slip.checkedBy) } : {}),
    ...(slip.storeInchargeUserId !== undefined ? { storeInchargeUserId: trimStr(slip.storeInchargeUserId) } : {}),
    ...(slip.storeInchargeName !== undefined ? { storeInchargeName: trimStr(slip.storeInchargeName) } : {}),
    ...(slip.loadedBy !== undefined ? { loadedBy: trimStr(slip.loadedBy) } : {}),
    ...(slip.loadingCompletedTime !== undefined ? { loadingCompletedTime: trimStr(slip.loadingCompletedTime) } : {}),
    ...(slip.loadingCompletedBy !== undefined ? { loadingCompletedBy: trimStr(slip.loadingCompletedBy) } : {}),
    ...(items ? { items } : {}),
  } as T;
}

export function normalizeTicketRecord<T extends Record<string, any>>(ticket: T): T {
  if (!ticket || typeof ticket !== 'object') return ticket;
  return {
    ...ticket,
    ...(ticket.ticketNumber !== undefined ? { ticketNumber: upperStr(ticket.ticketNumber) } : {}),
    ...(ticket.delNoteNumber !== undefined ? { delNoteNumber: upperStr(ticket.delNoteNumber) } : {}),
    ...(ticket.truckNumber !== undefined ? { truckNumber: upperStr(ticket.truckNumber) } : {}),
    ...(ticket.driverName !== undefined ? { driverName: upperStr(ticket.driverName) } : {}),
    ...(ticket.driverPhone !== undefined ? { driverPhone: upperStr(ticket.driverPhone) } : {}),
    ...(ticket.iqamaNumber !== undefined ? { iqamaNumber: upperStr(ticket.iqamaNumber) } : {}),
    ...(ticket.transporterName !== undefined ? { transporterName: upperStr(ticket.transporterName) } : {}),
    ...(ticket.destinationPlace !== undefined ? { destinationPlace: upperStr(ticket.destinationPlace) } : {}),
    ...(ticket.gateNumber !== undefined ? { gateNumber: trimStr(ticket.gateNumber) } : {}),
    ...(ticket.remarks !== undefined ? { remarks: upperStr(ticket.remarks) } : {}),
    ...(ticket.timeIn !== undefined ? { timeIn: trimStr(ticket.timeIn) } : {}),
    ...(ticket.timeCalled !== undefined ? { timeCalled: trimStr(ticket.timeCalled) } : {}),
    ...(ticket.timeLoadingStarted !== undefined ? { timeLoadingStarted: trimStr(ticket.timeLoadingStarted) } : {}),
    ...(ticket.timeCompleted !== undefined ? { timeCompleted: trimStr(ticket.timeCompleted) } : {}),
    ...(ticket.timeLoadingCompleted !== undefined ? { timeLoadingCompleted: trimStr(ticket.timeLoadingCompleted) } : {}),
    ...(ticket.timeOut !== undefined ? { timeOut: trimStr(ticket.timeOut) } : {}),
    ...(ticket.createdBy !== undefined ? { createdBy: trimStr(ticket.createdBy) } : {}),
    ...(ticket.updatedBy !== undefined ? { updatedBy: trimStr(ticket.updatedBy) } : {}),
    ...(ticket.completedBy !== undefined ? { completedBy: trimStr(ticket.completedBy) } : {}),
    ...(ticket.releasedBy !== undefined ? { releasedBy: trimStr(ticket.releasedBy) } : {}),
    ...(ticket.loadingSlip !== undefined ? { loadingSlip: normalizeLoadingSlip(ticket.loadingSlip) } : {}),
  } as T;
}

export function normalizeDriverRecord<T extends Record<string, any>>(driver: T): T {
  if (!driver || typeof driver !== 'object') return driver;
  return {
    ...driver,
    ...(driver.truckNumber !== undefined ? { truckNumber: upperStr(driver.truckNumber) } : {}),
    ...(driver.driverName !== undefined ? { driverName: upperStr(driver.driverName) } : {}),
    ...(driver.driverPhone !== undefined ? { driverPhone: upperStr(driver.driverPhone) } : {}),
    ...(driver.iqamaNumber !== undefined ? { iqamaNumber: upperStr(driver.iqamaNumber) } : {}),
    ...(driver.transporterName !== undefined ? { transporterName: upperStr(driver.transporterName) } : {}),
    ...(driver.defaultDestination !== undefined ? { defaultDestination: upperStr(driver.defaultDestination) } : {}),
  } as T;
}

export function normalizeSettingsRecord<T extends Record<string, any>>(settings: T): T {
  if (!settings || typeof settings !== 'object') return settings;
  return {
    ...settings,
    ...(settings.companyName !== undefined ? { companyName: trimStr(settings.companyName) } : {}),
    ...(settings.companySubtitle !== undefined ? { companySubtitle: trimStr(settings.companySubtitle) } : {}),
    ...(settings.address !== undefined ? { address: trimStr(settings.address) } : {}),
    ...(settings.phone !== undefined ? { phone: trimStr(settings.phone) } : {}),
    ...(settings.email !== undefined ? { email: trimStr(settings.email) } : {}),
    ...(settings.gstin !== undefined ? { gstin: trimStr(settings.gstin) } : {}),
    ...(settings.ticketPrefix !== undefined ? { ticketPrefix: upperStr(settings.ticketPrefix) || 'TK' } : {}),
    ...(Array.isArray(settings.gates)
      ? { gates: settings.gates.map((g: unknown) => trimStr(g)).filter(Boolean) }
      : {}),
  } as T;
}
