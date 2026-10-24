export function bookingFixture(overrides = {}) {
  const pickupDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    citizen_name: 'Demo Citizen',
    phone: '+919876543210',
    address: '12 Test Road, HSR Layout',
    locality: 'HSR Layout',
    waste_type: 'Concrete & brick',
    quantity_tonnes: 2,
    preferred_date: pickupDate,
    instructions: 'Sorted concrete and brick; loading point beside the gate.',
    latitude: 12.9116,
    longitude: 77.6389,
    ...overrides,
  };
}

export function receiptFixture(overrides = {}) {
  return {
    facility_id: 'FAC-TEST-01',
    facility_name: 'DEBRIX Test Facility',
    received_tonnes: 1.8,
    evidence_ref: 'WB-TEST-0001',
    ...overrides,
  };
}

export function recoveryFixture(overrides = {}) {
  return {
    facility_name: 'DEBRIX Test Facility',
    sort_notes: 'Separated concrete, reusable material and residual fines.',
    outputs: [{ material_type: 'Recycled concrete aggregate', tonnes: 1.2 }],
    reused_tonnes: 0.4,
    residual_tonnes: 0.2,
    residual_destination: 'Approved test destination',
    evidence_ref: 'REC-TEST-0001',
    ...overrides,
  };
}

export const evidencePdf = {
  name: 'test-evidence.pdf',
  type: 'application/pdf',
  data: 'JVBERi0xLjQK', // PDF 1.4 header, enough to exercise type and access checks.
};
