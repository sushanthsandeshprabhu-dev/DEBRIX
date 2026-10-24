import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';
import { bookingFixture, evidencePdf, receiptFixture, recoveryFixture } from './fixtures/workflow.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const staff = {
  operator: { username: 'ops.test', passcode: 'operator-test-passcode-2026' },
  transporter: { username: 'driver.test', passcode: 'transporter-test-passcode-2026' },
  other: { role: 'transporter', username: 'driver.other', passcode: 'another-driver-test-passcode' },
  recycler: { username: 'facility.test', passcode: 'recycler-test-passcode-2026' },
};
let dataDir;
let baseUrl;
let child;
const cookies = new Map();

async function request(path, { role = 'citizen', user = 'Demo Citizen', body, cookie = '', access, method } = {}) {
  const headers = { 'x-demo-role': role, 'x-demo-user': user };
  if (cookie) headers.cookie = cookie;
  if (access) headers['x-debrix-access'] = JSON.stringify(access);
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(new URL(path, baseUrl), {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const type = response.headers.get('content-type') || '';
  return { response, result: type.includes('application/json') ? await response.json() : await response.text() };
}
async function signIn(role, account = staff[role]) {
  const response = await fetch(new URL('/api/session', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, username: account.username, passcode: account.passcode }),
  });
  const result = await response.json();
  assert.equal(response.status, 200, 'Sign-in failed: ' + JSON.stringify(result));
  const cookie = (response.headers.get('set-cookie') || '').split(';')[0];
  assert.match(cookie, /^debrix_admin=/);
  cookies.set(role + ':' + account.username, cookie);
}
async function staffRequest(path, role, body, username = staff[role].username) {
  const cookie = cookies.get(role + ':' + username);
  assert.ok(cookie, 'Missing signed staff session');
  return request(path, { role, user: username, cookie, body,
    method: body === undefined ? 'GET' : path === '/api/products' ? 'POST' : 'PATCH' });
}

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'debrix-workflow-'));
  const accounts = [
    { role: 'operator', ...staff.operator },
    { role: 'transporter', ...staff.transporter },
    staff.other,
    { role: 'recycler', ...staff.recycler },
  ];
  child = spawn(process.execPath, [join(root, 'server.mjs')], {
    cwd: root,
    env: { ...process.env, PORT: '0', DEBRIX_DATA_DIR: join(dataDir, 'data'),
      DEBRIX_STAFF_ACCOUNTS_JSON: JSON.stringify(accounts),
      DEBRIX_SESSION_SECRET: 'workflow-test-session-signing-key-2026' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server readiness timed out: ' + output)), 15000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/DEBRIX running at http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      if (!baseUrl) { clearTimeout(timer); reject(new Error('Server exited (' + code + '): ' + output)); }
    });
  });
  baseUrl = 'http://127.0.0.1:' + port;
  await signIn('operator');
  await signIn('transporter');
  await signIn('transporter', staff.other);
  await signIn('recycler');
});
after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test('enforces staff roles and persists the complete pickup-to-recovery workflow', async () => {
  const home = await request('/');
  assert.equal(home.response.status, 200);
  assert.match(home.result, /leaflet/i);
  assert.doesNotMatch(home.result, /AIRWISE/i);
  assert.equal((await request('/api/air')).response.status, 404);
  assert.equal((await request('/api/summary', { role: 'operator' })).response.status, 401);

  const escalated = await request('/api/summary', {
    role: 'transporter', user: staff.transporter.username,
    cookie: cookies.get('operator:' + staff.operator.username),
  });
  assert.equal(escalated.response.status, 401);
  const badLogin = await request('/api/session', {
    body: { role: 'recycler', username: staff.recycler.username, passcode: staff.operator.passcode },
  });
  assert.equal(badLogin.response.status, 401);

  const noPin = await request('/api/bookings', { body: bookingFixture({ latitude: null, longitude: null }) });
  assert.equal(noPin.response.status, 400);
  assert.match(noPin.result.error, /pickup point/i);
  const created = await request('/api/bookings', { body: bookingFixture() });
  assert.equal(created.response.status, 201);
  const id = created.result.item.id;
  const access = { bookings: { [id]: created.result.access_token } };
  assert.equal(created.result.item.status, 'requested');
  assert.equal(created.result.item.pickup_latitude, 12.9116);
  assert.equal(created.result.item.pickup_longitude, 77.6389);
  assert.equal(created.result.item.demo, 0);
  assert.equal((await request('/api/bookings', { user: 'Different Citizen' })).result.items.some(b => b.id === id), false);
  assert.equal((await request('/api/bookings', { access })).result.items.some(b => b.id === id), true);

  const missingFields = await staffRequest('/api/bookings/' + id + '/status', 'operator', { status: 'assigned' });
  assert.equal(missingFields.response.status, 400, JSON.stringify(missingFields.result));
  const assigned = await staffRequest('/api/bookings/' + id + '/status', 'operator', {
    status: 'assigned', operator_name: staff.transporter.username, vehicle_id: 'KA-TEST-01',
    facility_id: 'FAC-TEST-01', facility_name: 'DEBRIX Test Facility',
    scheduled_date: created.result.item.preferred_date, note: 'Workflow test assignment.',
  });
  assert.equal(assigned.response.status, 200);
  assert.equal(assigned.result.item.operator_name, staff.transporter.username);
  assert.equal(assigned.result.item.facility_id, 'FAC-TEST-01');
  assert.equal(assigned.result.item.scheduled_date, created.result.item.preferred_date);
  assert.equal((await staffRequest('/api/bookings', 'transporter')).result.items.some(b => b.id === id), true);
  assert.equal((await staffRequest('/api/bookings', 'transporter', undefined, staff.other.username)).result.items.some(b => b.id === id), false);
  assert.equal((await staffRequest('/api/bookings/' + id + '/status', 'transporter', { status: 'picked_up' }, staff.other.username)).response.status, 404);
  assert.ok((await staffRequest('/api/bookings/' + id + '/status', 'operator', { status: 'picked_up' })).response.status >= 400);

  for (const status of ['picked_up', 'in_transit']) {
    const update = await staffRequest('/api/bookings/' + id + '/status', 'transporter', { status });
    assert.equal(update.response.status, 200);
    assert.equal(update.result.item.status, status);
  }
  const gps = await staffRequest('/api/bookings/' + id + '/location', 'transporter', {
    latitude: 12.914, longitude: 77.641, accuracy_m: 12,
  });
  assert.equal(gps.response.status, 200);
  assert.match(gps.result.item.location.source, /transporter opted in/);

  const noNote = await staffRequest('/api/bookings/' + id + '/receipt', 'recycler', { ...receiptFixture() });
  assert.equal(noNote.response.status, 400);
  const badFile = await staffRequest('/api/bookings/' + id + '/receipt', 'recycler', {
    ...receiptFixture({ discrepancy_note: 'Scale weight differs from the estimate.' }),
    evidence_file: { ...evidencePdf, data: 'bm90cGRm' },
  });
  assert.equal(badFile.response.status, 400);
  const wrongFacility = await staffRequest('/api/bookings/' + id + '/receipt', 'recycler', {
    ...receiptFixture({ facility_id: 'FAC-OTHER', discrepancy_note: 'Weight differs from estimate.' }),
    evidence_file: evidencePdf,
  });
  assert.ok(wrongFacility.response.status >= 400);
  const receipt = await staffRequest('/api/bookings/' + id + '/receipt', 'recycler', {
    ...receiptFixture({ discrepancy_note: 'Measured load was lower than customer estimate.' }),
    evidence_file: evidencePdf,
  });
  assert.equal(receipt.response.status, 200);
  assert.equal(receipt.result.item.status, 'received');
  assert.equal(receipt.result.item.received_tonnes, 1.8);
  const evidence = receipt.result.item.evidence.find(file => file.kind === 'receipt');
  assert.ok(evidence && evidence.id);

  assert.equal((await staffRequest('/api/bookings/' + id + '/status', 'recycler', { status: 'processing' })).response.status, 200);
  const unbalanced = await staffRequest('/api/bookings/' + id + '/processing', 'recycler', {
    ...recoveryFixture({ residual_tonnes: 0.4 }),
  });
  assert.equal(unbalanced.response.status, 400);
  const recovery = await staffRequest('/api/bookings/' + id + '/processing', 'recycler', {
    ...recoveryFixture(), evidence_file: evidencePdf,
  });
  assert.equal(recovery.response.status, 200);
  assert.equal(recovery.result.item.status, 'recovered');
  assert.equal(recovery.result.item.recycled_tonnes + recovery.result.item.reused_tonnes + recovery.result.item.residual_tonnes, 1.8);
  assert.equal(recovery.result.item.evidence.length, 2);

  const file = await request('/api/bookings/' + id + '/evidence/' + evidence.id, { access });
  assert.equal(file.response.status, 200);
  assert.match(file.response.headers.get('content-type') || '', /application\/pdf/);
  assert.match(file.result, /^%PDF-/);
  assert.equal((await request('/api/bookings/' + id + '/evidence/' + evidence.id, { user: 'Different Citizen' })).response.status, 404);

  const closed = await staffRequest('/api/bookings/' + id + '/status', 'recycler', { status: 'closed' });
  assert.equal(closed.response.status, 200);
  const final = (await request('/api/bookings', { access })).result.items.find(b => b.id === id);
  assert.equal(final.status, 'closed');
  assert.equal(final.evidence.length, 2);
  assert.ok(final.events.some(event => event.event_type === 'recovery_recorded'));
  assert.ok(final.events.some(event => event.event_type === 'picked_up' && event.actor_name === staff.transporter.username));
});

test('operators can reject a requested pickup with a recorded reason', async () => {
  const created = await request('/api/bookings', {
    body: bookingFixture({ citizen_name: 'Second Demo Citizen' }),
  });
  assert.equal(created.response.status, 201);
  const id = created.result.item.id;
  const access = { bookings: { [id]: created.result.access_token } };
  const rejected = await staffRequest('/api/bookings/' + id + '/status', 'operator', {
    status: 'rejected', note: 'Outside the service area.',
  });
  assert.equal(rejected.response.status, 200, JSON.stringify(rejected.result));
  assert.equal(rejected.result.item.status, 'rejected');
  const item = (await request('/api/bookings', { access })).result.items.find(b => b.id === id);
  assert.equal(item.status, 'rejected');
  assert.ok(item.events.some(event => event.event_type === 'rejected' && event.actor_name === staff.operator.username));
});
