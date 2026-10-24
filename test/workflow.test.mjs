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
const passcode = 'test-only-passcode-7d7de5b7';
let dataDir;
let baseUrl;
let child;
let adminCookie;

async function request(path, { role = 'citizen', user = 'Demo Citizen', body, cookie = '', access } = {}) {
  const headers = { 'x-demo-role': role, 'x-demo-user': user };
  if (cookie) headers.cookie = cookie;
  if (access) headers['x-debrix-access'] = JSON.stringify(access);
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(new URL(path, baseUrl), {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, result };
}

async function adminRequest(path, role, body, access) {
  const headers = { 'x-demo-role': role, 'x-demo-user': 'DEBRIX Test Admin', cookie: adminCookie };
  if (access) headers['x-debrix-access'] = JSON.stringify(access);
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(new URL(path, baseUrl), {
    method: body === undefined ? 'GET' : path === '/api/products' ? 'POST' : 'PATCH',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, result };
}

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'debrix-workflow-'));
  child = spawn(process.execPath, [join(root, 'server.mjs')], {
    cwd: root,
    env: { ...process.env, PORT: '0', DEBRIX_DATA_DIR: join(dataDir, 'data'), DEBRIX_ADMIN_PASSCODE: passcode },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const ready = new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error('DEBRIX server did not become ready. ' + output)), 15000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/DEBRIX running at http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolveReady(Number(match[1]));
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { clearTimeout(timer); rejectReady(error); });
    child.once('exit', code => {
      if (!baseUrl) { clearTimeout(timer); rejectReady(new Error('DEBRIX exited before startup (' + code + '). ' + output)); }
    });
  });
  const port = await ready;
  baseUrl = 'http://127.0.0.1:' + port;
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test('runs the complete pickup, evidence, recovery and recycled-product journey', async () => {
  const home = await request('/');
  assert.equal(home.response.status, 200);
  assert.match(home.result, /leaflet/i);
  assert.doesNotMatch(home.result, /AIRWISE/i);
  const airRoute = await request('/api/air');
  assert.equal(airRoute.response.status, 404);
  const unauthed = await fetch(new URL('/api/summary', baseUrl), { headers: { 'x-demo-role': 'operator' } });
  assert.equal(unauthed.status, 401);

  const login = await fetch(new URL('/api/session', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  assert.equal(login.status, 200);
  adminCookie = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.match(adminCookie, /^debrix_admin=/);

  const noPin = await request('/api/bookings', { body: bookingFixture({ latitude: null, longitude: null }) });
  assert.equal(noPin.response.status, 400);
  assert.match(noPin.result.error, /pickup point/i);

  const created = await request('/api/bookings', { body: bookingFixture() });
  assert.equal(created.response.status, 201);
  const booking = created.result.item;
  const bookingId = booking.id;
  const bookingAccess = { bookings: { [bookingId]: created.result.access_token } };
  assert.equal(booking.status, 'requested');
  assert.equal(booking.pickup_latitude, 12.9116);
  assert.equal(booking.pickup_longitude, 77.6389);
  assert.equal(booking.demo, 0);

  const unseen = await request('/api/bookings', { user: 'Different Citizen' });
  assert.equal(unseen.response.status, 200);
  assert.equal(unseen.result.items.some(item => item.id === bookingId), false);
  const visible = await request('/api/bookings', { access: bookingAccess });
  assert.equal(visible.result.items.some(item => item.id === bookingId), true);

  const skip = await adminRequest('/api/bookings/' + bookingId + '/status', 'operator', { status: 'in_transit' });
  assert.equal(skip.response.status, 409);
  const assignment = await adminRequest('/api/bookings/' + bookingId + '/status', 'operator', {
    status: 'assigned', operator_name: 'Test Operator', vehicle_id: 'KA-TEST-01',
  });
  assert.equal(assignment.response.status, 200);
  for (const status of ['picked_up', 'in_transit']) {
    const update = await adminRequest('/api/bookings/' + bookingId + '/status', 'operator', { status });
    assert.equal(update.response.status, 200);
    assert.equal(update.result.item.status, status);
  }
  const gps = await adminRequest('/api/bookings/' + bookingId + '/location', 'operator', {
    latitude: 12.914, longitude: 77.641, accuracy_m: 12,
  });
  assert.equal(gps.response.status, 200);
  assert.equal(gps.result.item.location.source, 'Browser device GPS · operator opted in');

  const invalidEvidence = await adminRequest('/api/bookings/' + bookingId + '/receipt', 'recycler', {
    ...receiptFixture(), evidence_file: { ...evidencePdf, data: 'bm90cGRm' },
  });
  assert.equal(invalidEvidence.response.status, 400);
  const receipt = await adminRequest('/api/bookings/' + bookingId + '/receipt', 'recycler', {
    ...receiptFixture(), evidence_file: evidencePdf,
  });
  assert.equal(receipt.response.status, 200);
  assert.equal(receipt.result.item.status, 'received');
  const receiptFile = receipt.result.item.evidence.find(file => file.kind === 'receipt');
  assert.ok(receiptFile?.id);

  const started = await adminRequest('/api/bookings/' + bookingId + '/status', 'recycler', { status: 'processing' });
  assert.equal(started.response.status, 200);
  const unbalanced = await adminRequest('/api/bookings/' + bookingId + '/processing', 'recycler', {
    ...recoveryFixture({ residual_tonnes: 0.4 }),
  });
  assert.equal(unbalanced.response.status, 400);
  const recovered = await adminRequest('/api/bookings/' + bookingId + '/processing', 'recycler', {
    ...recoveryFixture(), evidence_file: evidencePdf,
  });
  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.result.item.status, 'recovered');
  assert.equal(recovered.result.item.recycled_tonnes + recovered.result.item.reused_tonnes + recovered.result.item.residual_tonnes, 1.8);
  assert.equal(recovered.result.item.evidence.length, 2);

  const privateFile = await request('/api/bookings/' + bookingId + '/evidence/' + receiptFile.id, { access: bookingAccess });
  assert.equal(privateFile.response.status, 200);
  assert.match(privateFile.response.headers.get('content-type') || '', /application\/pdf/);
  assert.match(privateFile.result, /^%PDF-/);
  const deniedFile = await request('/api/bookings/' + bookingId + '/evidence/' + receiptFile.id, { user: 'Different Citizen' });
  assert.equal(deniedFile.response.status, 404);

  const closed = await adminRequest('/api/bookings/' + bookingId + '/status', 'recycler', { status: 'closed' });
  assert.equal(closed.response.status, 200);
  assert.equal(closed.result.item.status, 'closed');
  const citizenFinal = await request('/api/bookings', { access: bookingAccess });
  const finalBooking = citizenFinal.result.items.find(item => item.id === bookingId);
  assert.equal(finalBooking.status, 'closed');
  assert.equal(finalBooking.evidence.length, 2);
  assert.ok(finalBooking.events.some(event => event.event_type === 'recovery_recorded'));

  const product = await adminRequest('/api/products', 'recycler', {
    name: 'Test recycled concrete aggregate',
    material_type: 'Recycled concrete aggregate',
    inventory_tonnes: 5,
    facility_name: 'DEBRIX Test Facility',
    quality_note: 'Test batch; independent test report not supplied.',
  });
  assert.equal(product.response.status, 201);
  const order = await request('/api/orders', {
    body: {
      product_id: product.result.item.id, citizen_name: 'Demo Citizen', phone: '+919876543210',
      quantity_tonnes: 1, intended_use: 'Test wall footing', member_opt_in: true,
    },
  });
  assert.equal(order.response.status, 201);
  const orderAccess = { orders: { [order.result.item.id]: order.result.access_token } };
  const confirmed = await adminRequest('/api/orders/' + order.result.item.id, 'recycler', { status: 'confirmed' });
  assert.equal(confirmed.response.status, 200);
  const delivered = await adminRequest('/api/orders/' + order.result.item.id, 'recycler', { status: 'delivered' });
  assert.equal(delivered.response.status, 200);
  const inUse = await adminRequest('/api/orders/' + order.result.item.id, 'citizen', { status: 'in_use' }, orderAccess);
  assert.equal(inUse.response.status, 200);
  assert.equal(inUse.result.item.status, 'in_use');
  const inventory = await adminRequest('/api/products', 'recycler');
  assert.equal(inventory.response.status, 200);
  assert.equal(inventory.result.items.find(item => item.id === product.result.item.id).inventory_tonnes, 4);
  const memberRecords = await adminRequest('/api/orders', 'recycler');
  assert.ok(memberRecords.result.items.some(item => item.id === order.result.item.id && item.member_opt_in && item.status === 'in_use'));
});
