import React, { useState, useEffect } from 'react';
import { TicketRecord, DriverMasterRecord, CompanySettings } from '../types';
import { StorageService, getCurrentTimeString, createEmpty8Rows } from '../services/storage';
import { ApiClient } from '../services/api';
import { formatSaudiPhoneNumber } from '../utils/whatsapp';
import { Ticket, Truck, User, Phone, MapPin, Building2, DoorOpen, Hash, AlertCircle, Save, Printer, MessageSquare, X, FileText } from 'lucide-react';

interface NewTicketModalProps {
  date: string;
  settings: CompanySettings;
  onSave: (ticket: TicketRecord, nextAction?: 'print' | 'whatsapp') => void;
  onClose: () => void;
}

export const NewTicketModal: React.FC<NewTicketModalProps> = ({
  date,
  settings,
  onSave,
  onClose,
}) => {
  const [driverMasterList] = useState<DriverMasterRecord[]>(() => StorageService.getDrivers());

  // Automatic sequence number and ticket number for selected date
  const [nextSeq, setNextSeq] = useState<number>(() => StorageService.getNextDailySequence(date));
  const [ticketNumber, setTicketNumber] = useState<string>(() =>
    StorageService.generateTicketNumber(date, StorageService.getNextDailySequence(date))
  );

  // Mandatory Delivery Note Number (Del Note No.)
  const [delNoteNumber, setDelNoteNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [truckNumber, setTruckNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [iqamaNumber, setIqamaNumber] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [destinationPlace, setDestinationPlace] = useState('');
  const [selectedGate, setSelectedGate] = useState<string>(settings.gates[0] || 'Gate 1');
  const [remarks, setRemarks] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [autoPrintToken, setAutoPrintToken] = useState<boolean>(settings.autoPrintTokenAfterSave ?? true);

  // Filtered autocomplete suggestions for truck number
  const [suggestions, setSuggestions] = useState<DriverMasterRecord[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Dynamic gate queue calculation
  const gateQueueInfo = StorageService.getGateQueueInfo(selectedGate, date);

  useEffect(() => {
    const seq = StorageService.getNextDailySequence(date);
    setNextSeq(seq);
    setTicketNumber(StorageService.generateTicketNumber(date, seq));
  }, [date]);

  const handlePhoneChange = (val: string) => {
    setDriverPhone(val);
    const digits = val.replace(/\D/g, '');
    // If typing reaches 10 digits starting with 05 (e.g. 0550000000) or 9 digits starting with 5 (e.g. 550000000)
    if (digits.startsWith('05') && digits.length === 10) {
      setDriverPhone('+966' + digits.slice(1));
    } else if (digits.startsWith('5') && digits.length === 9) {
      setDriverPhone('+966' + digits);
    }
  };

  const handlePhoneBlur = () => {
    if (driverPhone.trim()) {
      setDriverPhone(formatSaudiPhoneNumber(driverPhone));
    }
  };

  const handleTruckInput = (val: string) => {
    setTruckNumber(val);
    if (val.trim().length >= 2) {
      const match = driverMasterList.filter(
        (d) =>
          d.truckNumber.toLowerCase().includes(val.toLowerCase()) ||
          d.driverName.toLowerCase().includes(val.toLowerCase()) ||
          (d.iqamaNumber && d.iqamaNumber.includes(val))
      );
      setSuggestions(match);
      setShowSuggestions(match.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (item: DriverMasterRecord) => {
    setTruckNumber(item.truckNumber);
    setDriverName(item.driverName);
    setDriverPhone(formatSaudiPhoneNumber(item.driverPhone));
    setIqamaNumber(item.iqamaNumber || '');
    setTransporterName(item.transporterName || '');
    if (item.defaultDestination) {
      setDestinationPlace(item.defaultDestination);
    }
    setShowSuggestions(false);
  };

  const handleSubmit = async (action?: 'print' | 'whatsapp') => {
    setFormError(null);
    if (!delNoteNumber.trim()) {
      setFormError('Please enter Delivery Note Number (Del Note No.) * e.g. A1DD00001. Ticket cannot be created without it.');
      return;
    }
    if (!truckNumber.trim()) {
      setFormError('Please enter Vehicle / Truck Number!');
      return;
    }
    if (!driverName.trim()) {
      setFormError('Please enter Driver Name!');
      return;
    }
    if (!driverPhone.trim()) {
      setFormError('Please enter Driver Mobile Number!');
      return;
    }

    const calculatedGateSeq = gateQueueInfo.myPositionAtGate;
    const formattedPhone = formatSaudiPhoneNumber(driverPhone);
    const cleanDelNote = delNoteNumber.trim().toUpperCase();

    setSubmitting(true);
    try {
      const newTicket = await ApiClient.createTicket({
        ticketNumber,
        sequenceNumber: nextSeq,
        date,
        timeIn: getCurrentTimeString(),
        gateNumber: selectedGate,
        gateSequenceNumber: calculatedGateSeq,
        delNoteNumber: cleanDelNote,
        truckNumber: truckNumber.trim().toUpperCase(),
        driverName: driverName.trim(),
        driverPhone: formattedPhone,
        iqamaNumber: iqamaNumber.trim(),
        transporterName: transporterName.trim(),
        destinationPlace: destinationPlace.trim(),
        status: 'waiting',
        priority,
        remarks: remarks.trim(),
        loadingSlip: {
          delNoteNumber: cleanDelNote,
          placeName: destinationPlace.trim(),
          preparedBy: '',
          checkedBy: '',
          items: createEmpty8Rows(),
          totalQty: 0,
          totalPallets: 0,
          totalLooseRolls: 0,
          createdAt: date,
        },
      });

      const effectiveAction = action || (autoPrintToken ? 'print' : undefined);
      onSave(newTicket, effectiveAction);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to generate ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
              <Ticket className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Generate New Gate Ticket</h2>
              <p className="text-xs text-blue-100">
                Automatic Ticket & Sequence Generation | Gate Position Calculator
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-blue-100 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auto Generated Numbers Badge */}
        <div className="bg-blue-50/70 border-b border-blue-100 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-white p-2 rounded-xl border border-blue-200 shadow-sm">
            <span className="text-[10px] uppercase font-bold text-neutral-500 block">Ticket Number</span>
            <span className="text-sm font-black text-blue-900">{ticketNumber}</span>
          </div>
          <div className="bg-white p-2 rounded-xl border border-blue-200 shadow-sm">
            <span className="text-[10px] uppercase font-bold text-neutral-500 block">Daily Overall Seq</span>
            <span className="text-sm font-black text-indigo-700">#{nextSeq}</span>
          </div>
          <div className="bg-white p-2 rounded-xl border border-blue-200 shadow-sm">
            <span className="text-[10px] uppercase font-bold text-neutral-500 block">Selected Gate</span>
            <span className="text-sm font-black text-emerald-800">{selectedGate}</span>
          </div>
          <div className="bg-white p-2 rounded-xl border border-blue-200 shadow-sm">
            <span className="text-[10px] uppercase font-bold text-neutral-500 block">Position at Gate</span>
            <span className="text-sm font-black text-purple-800">#{gateQueueInfo.myPositionAtGate}</span>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Delivery Note Number (Del Note No.) * - MANDATORY */}
          <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-300">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-black text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-700" />
                <span>Delivery Note Number (Del Note No.) *</span>
              </label>
              <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                REQUIRED
              </span>
            </div>
            <input
              type="text"
              value={delNoteNumber}
              onChange={(e) => setDelNoteNumber(e.target.value.toUpperCase())}
              placeholder="e.g. A1DD00001"
              required
              className="w-full px-3 py-2 text-sm font-black uppercase tracking-wider rounded-lg border border-amber-400 focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white shadow-xs font-mono text-neutral-900"
            />
            <p className="text-[10.5px] text-amber-900 font-medium mt-1">
              ⚠️ Without entering Delivery Note Number (e.g. A1DD00001), ticket cannot be created.
            </p>
          </div>

          {/* Truck Number with Autocomplete */}
          <div className="relative">
            <label className="text-xs font-bold text-neutral-700 uppercase tracking-wide block mb-1">
              Vehicle / Truck Number *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                <Truck className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={truckNumber}
                onChange={(e) => handleTruckInput(e.target.value)}
                onFocus={() => {
                  if (truckNumber.trim().length >= 1) setShowSuggestions(true);
                }}
                placeholder="e.g. 5275 AXG"
                className="w-full pl-9 pr-3 py-2 text-sm font-black uppercase tracking-wider rounded-xl border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white shadow-sm font-mono"
              />
            </div>

            {/* Autocomplete Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-neutral-100">
                <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-400 bg-neutral-50 uppercase tracking-wide">
                  Saved Master Directory (Click to Auto-fill):
                </div>
                {suggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(item)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50/80 transition flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div>
                      <span className="font-extrabold text-blue-900 font-mono">{item.truckNumber}</span>
                      <span className="ml-2 font-medium text-neutral-700">{item.driverName}</span>
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      <span>{item.driverPhone}</span>
                      {item.iqamaNumber && <span className="ml-1.5 text-neutral-600">| Iqama: {item.iqamaNumber}</span>}
                      <span> | {item.transporterName || 'Self'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Driver Name, Phone & Iqama */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wide block mb-1">
                Driver Name *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="e.g. Rameshwar Yadav"
                  className="w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wide block mb-1">
                Driver Mobile / WhatsApp *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <Phone className="w-4 h-4 text-emerald-600" />
                </div>
                <input
                  type="text"
                  value={driverPhone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  onBlur={handlePhoneBlur}
                  placeholder="e.g. 0550000000"
                  className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border border-neutral-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wide block mb-1">
                ID / Iqama Number
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <Hash className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={iqamaNumber}
                  onChange={(e) => setIqamaNumber(e.target.value)}
                  placeholder="e.g. 2481928491"
                  className="w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Place Name and Transporter Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wide block mb-1">
                Destination Place / Unloading Point
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={destinationPlace}
                  onChange={(e) => setDestinationPlace(e.target.value)}
                  placeholder="e.g. Central Warehouse Riyadh / Jeddah"
                  className="w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wide block mb-1">
                Transporter / Company Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={transporterName}
                  onChange={(e) => setTransporterName(e.target.value)}
                  placeholder="e.g. Al-Majd Freight Lines"
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
              </div>
            </div>
          </div>

          {/* Gate Selection with Live Queue Status */}
          <div>
            <label className="text-xs font-bold text-neutral-700 uppercase tracking-wide block mb-1.5">
              Assign Loading Gate:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {settings.gates.map((gate) => {
                const info = StorageService.getGateQueueInfo(gate, date);
                const isSelected = selectedGate === gate;
                return (
                  <button
                    key={gate}
                    type="button"
                    onClick={() => setSelectedGate(gate)}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'border-blue-700 bg-blue-50/90 ring-2 ring-blue-500/20 shadow-sm'
                        : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-xs text-neutral-900">{gate}</span>
                      <DoorOpen className={`w-4 h-4 ${isSelected ? 'text-blue-700' : 'text-neutral-400'}`} />
                    </div>
                    <div className="text-[10px] space-y-0.5">
                      {info.currentLoading ? (
                        <p className="text-amber-800 font-semibold truncate">
                          ⏳ 1 Truck Loading
                        </p>
                      ) : (
                        <p className="text-emerald-700 font-semibold">🟢 Available</p>
                      )}
                      <p className="text-neutral-500">
                        {info.waitingQueue.length} in queue | Your Pos: #{info.myPositionAtGate}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority & Remarks */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wide block mb-1">
                Loading Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'normal' | 'urgent')}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              >
                <option value="normal">Normal Loading</option>
                <option value="urgent">Urgent / Express Loading</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wide block mb-1">
                Special Remarks / Notes
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Tarpaulin required, Box material, Seal inspection"
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              />
            </div>
          </div>

          {/* Auto-Print Token Option */}
          <div className="flex items-center justify-between p-3 bg-blue-50/80 border border-blue-200 rounded-xl">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-blue-950">
              <input
                type="checkbox"
                checked={autoPrintToken}
                onChange={(e) => setAutoPrintToken(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-blue-300 focus:ring-blue-500 cursor-pointer"
              />
              <span>Auto-Print Token After Save (Immediately triggers ticket print view upon registration)</span>
            </label>
            <Printer className="w-4 h-4 text-blue-700 shrink-0" />
          </div>

          {/* Quick Info Box */}
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p>
              Vehicle, driver, and phone details are automatically saved to your master database for future autocomplete.
            </p>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs font-semibold text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="app-btn w-full md:w-auto md:min-w-[110px] text-neutral-700 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300"
            >
              Cancel
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full md:w-auto">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit('whatsapp')}
                className="app-btn w-full bg-emerald-600 hover:bg-emerald-500 text-white shadow"
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span>Save & Send WhatsApp</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit('print')}
                className="app-btn w-full bg-neutral-800 hover:bg-neutral-900 text-white shadow"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>Save & Print Token</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit()}
                className="app-btn w-full bg-blue-700 hover:bg-blue-600 text-white shadow-lg shadow-blue-700/30"
              >
                <Save className="w-4 h-4 shrink-0" />
                <span>{submitting ? 'Saving...' : 'Generate Ticket'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
