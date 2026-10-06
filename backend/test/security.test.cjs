const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const session = require('express-session');
const request = require('supertest');
const mongoose = require('mongoose');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');

const database = `security_test_${randomUUID().replaceAll('-', '')}`;
const mongo = process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27019';
process.env.DB_ADDRESS = `${mongo}/${database}`;
process.env.NODE_ENV = 'test';
process.env.TRUST_PROXY = '0';
const { createApp } = require('../dist/app');
const { apiLimiter, authLimiter, uploadLimiter } = require('../dist/middlewares/rate-limit');
const User = require('../dist/models/user').default;
const Product = require('../dist/models/product').default;
const Order = require('../dist/models/order').default;
const { REFRESH_TOKEN, TEMP_ROOT, PUBLIC_ROOT } = require('../dist/config');
const jwt = require('jsonwebtoken');
let app, admin, customer, other, product;

before(async () => {
    await mongoose.connect(process.env.DB_ADDRESS, { serverSelectionTimeoutMS: 10000 });
    await Promise.all([User.init(), Product.init(), Order.init()]);
    app = createApp(new session.MemoryStore());
    [admin, customer, other] = await Promise.all([
        User.create({ name: 'Admin', email: 'admin@example.test', password: 'password', roles: ['admin'] }),
        User.create({ name: 'Alice', email: 'alice@example.test', password: 'password' }),
        User.create({ name: 'Bob', email: 'bob@example.test', password: 'password' }),
    ]);
    product = await Product.create({ title: 'Sample', price: 100, description: 'Sample item', category: 'другое', image: { fileName: '/images/Shell.png', originalName: 'Shell.png' } });
});
after(async () => {
    await mongoose.connection.dropDatabase(); // Only the unique database created by this test file.
    await mongoose.disconnect();
});
beforeEach(() => {
    for (const limiter of [apiLimiter, authLimiter, uploadLimiter]) {
        limiter.resetKey('::ffff:127.0.0.1'); limiter.resetKey('127.0.0.1'); limiter.resetKey('::/56');
    }
});
async function client(user = customer) {
    const agent = request.agent(app);
    const response = await agent.get('/auth/csrf-token').expect(200);
    const csrf = response.body.csrfToken;
    const cookie = response.headers['set-cookie'].find(value => value.startsWith('_csrf=')).split(';')[0];
    return { agent, csrf, cookie, token: user.generateAccessToken() };
}
function write(client, method, url) {
    return client.agent[method](url).set('X-CSRF-Token', client.csrf).set('Authorization', `Bearer ${client.token}`);
}
const orderBody = () => ({ items: [String(product._id)], total: 100, payment: 'online', email: 'alice@example.test', phone: '+7 (999) 123 45 67', address: 'Moscow, 1', comment: '' });

test('CSRF tokens are session-bound and required for login, registration and profile updates', async () => {
    const one = await client(); const two = await client();
    await request(app).post('/auth/login').send({ email: 'alice@example.test', password: 'password' }).expect(403);
    await two.agent.post('/auth/register').set('X-CSRF-Token', one.csrf).send({ email: 'fresh@example.test', password: 'password' }).expect(403);
    await one.agent.patch('/auth/me').set('Authorization', `Bearer ${one.token}`).send({ name: 'Updated' }).expect(403);
    const response = await one.agent.post('/auth/login').set('X-CSRF-Token', one.csrf).send({ email: 'alice@example.test', password: 'password' }).expect(200);
    assert.equal(response.body.user.email, 'alice@example.test');
    assert.equal(response.body.user.password, undefined);
    assert.equal(response.body.user.tokens, undefined);
    const cookies = response.headers['set-cookie'];
    assert.ok(cookies.some(value => value.includes('HttpOnly') && value.includes('SameSite=Strict')));
});
test('Input validation blocks NoSQL operators, unknown keys and overlong passwords', async () => {
    const c = await client();
    for (const body of [
        { email: { $ne: null }, password: 'password' },
        { email: 'alice@example.test', password: 'a'.repeat(1000) },
        { email: 'alice@example.test', password: 'Я'.repeat(50) },
    ]) await write(c, 'post', '/auth/login').send(body).expect(400);
    await write(c, 'post', '/auth/register').send({ email: 'new@example.test', password: 'password', roles: ['admin'] }).expect(400);
    await write(c, 'patch', '/auth/me').send({ roles: ['admin'] }).expect(400);
    assert.deepEqual((await User.findById(customer._id)).roles, ['customer']);
});
test('Normal registration hashes the password and creates only customer privileges', async () => {
    const c = await client();
    const response = await write(c, 'post', '/auth/register').send({ name: 'New user', email: 'new@example.test', password: 'password' }).expect(201);
    assert.equal(response.body.user.password, undefined);
    const stored = await User.findOne({ email: 'new@example.test' }).select('+password');
    assert.match(stored.password, /^\$2/);
    assert.notEqual(stored.password, 'password');
    assert.deepEqual(stored.roles, ['customer']);
});
test('Admin-only API routes reject customers, including file upload and catalog changes', async () => {
    const c = await client();
    await c.agent.get('/customers').set('Authorization', `Bearer ${c.token}`).expect(403);
    await c.agent.get('/order/all').set('Authorization', `Bearer ${c.token}`).expect(403);
    await write(c, 'post', '/product').send({}).expect(403);
    await write(c, 'post', '/upload').expect(403);
    await write(c, 'delete', `/product/${product._id}`).expect(403);
});
test('Order totals, IDs, duplicates and size are checked; rich comments are sanitized', async () => {
    const c = await client();
    for (const body of [
        { ...orderBody(), total: 1 }, { ...orderBody(), items: [String(product._id), String(product._id)] },
        { ...orderBody(), items: [{ $ne: null }] }, { ...orderBody(), phone: '1'.repeat(1000) },
        { ...orderBody(), address: 'x'.repeat(501) }, { ...orderBody(), items: [] },
    ]) await write(c, 'post', '/order').send(body).expect(400);
    const response = await write(c, 'post', '/order').send({ ...orderBody(), comment: '<b>Hello</b><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a>' }).expect(200);
    assert.ok(response.body.comment.includes('<b>Hello</b>'));
    assert.doesNotMatch(response.body.comment, /script|onerror|<img|javascript:/i);
    const storedUser = await User.findById(customer._id);
    assert.equal(storedUser.orderCount, 1);
    assert.equal(storedUser.totalAmount, 100);
    const stranger = await client(other);
    await stranger.agent.get(`/order/me/${response.body.orderNumber}`).set('Authorization', `Bearer ${stranger.token}`).expect(404);
    await c.agent.get(`/order/me/${response.body.orderNumber}`).set('Authorization', `Bearer ${c.token}`).expect(200);
});
test('Customer filters retain their conditions and treat regex input as literal text', async () => {
    const c = await client(admin);
    const response = await c.agent.get('/customers?name=Alice&limit=1000').set('Authorization', `Bearer ${c.token}`).expect(200);
    assert.equal(response.body.pagination.pageSize, 10);
    assert.equal(response.body.customers.length, 1);
    assert.equal(response.body.customers[0].name, 'Alice');
    assert.doesNotMatch(JSON.stringify(response.body), /"password"|"tokens"/);
    await c.agent.get('/customers').query({ search: '1+{}$()' }).set('Authorization', `Bearer ${c.token}`).expect(200);
    await c.agent.get('/customers?name[$ne]=Alice').set('Authorization', `Bearer ${c.token}`).expect(400);
    await c.agent.get('/customers?page=-1').set('Authorization', `Bearer ${c.token}`).expect(400);
    await c.agent.get('/customers?search=' + 'a'.repeat(101)).set('Authorization', `Bearer ${c.token}`).expect(400);
    await write(c, 'patch', `/customers/${customer._id}`).send({ password: 'plain', tokens: [], roles: ['admin'] }).expect(400);
});
test('Refresh rotation is atomic, prevents replay, and rejects a refresh token as an access token', async () => {
    const c = await client();
    const login = await c.agent.post('/auth/login').set('X-CSRF-Token', c.csrf).send({ email: 'alice@example.test', password: 'password' }).expect(200);
    const oldCookie = login.headers['set-cookie'].find(value => value.startsWith('refreshToken=')).split(';')[0];
    const oldToken = decodeURIComponent(oldCookie.slice('refreshToken='.length));
    await c.agent.get('/auth/user').set('Authorization', `Bearer ${oldToken}`).expect(401);
    const rotations = await Promise.all([0, 1].map(() => request(app).post('/auth/token').set('X-CSRF-Token', c.csrf).set('Cookie', [c.cookie, oldCookie])));
    assert.deepEqual(rotations.map(response => response.status).sort(), [200, 401]);
    await request(app).post('/auth/token').set('X-CSRF-Token', c.csrf).set('Cookie', [c.cookie, oldCookie]).expect(401);
    const forged = jwt.sign({ type: 'refresh', _id: String(customer._id) }, REFRESH_TOKEN.secret, { subject: String(customer._id), expiresIn: 100 });
    await request(app).post('/auth/token').set('X-CSRF-Token', c.csrf).set('Cookie', [c.cookie, `refreshToken=${forged}`]).expect(401);
    await c.agent.get('/auth/token').expect(404);
    await c.agent.get('/auth/logout').expect(404);
});
test('Image upload decodes actual pixels, returns a random path, and cleans temporary files', async () => {
    const c = await client(admin);
    const image = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#ff5533' } }).png({ compressionLevel: 0 }).toBuffer();
    const response = await write(c, 'post', '/upload').attach('file', image, { filename: 'test.png', contentType: 'image/png' }).expect(201);
    assert.match(response.body.fileName, /^\/images\/[a-f0-9-]{36}\.webp$/);
    await c.agent.get(response.body.fileName).expect(200);
    await write(c, 'post', '/upload').attach('file', Buffer.alloc(4096), { filename: 'fake.png', contentType: 'image/png' }).expect(400);
    await write(c, 'post', '/upload').attach('file', Buffer.alloc(10), { filename: 'small.png', contentType: 'image/png' }).expect(400);
    await write(c, 'post', '/upload').attach('file', Buffer.alloc(11 * 1024 * 1024), { filename: 'big.png', contentType: 'image/png' }).expect(413);
    assert.equal((await fs.readdir(TEMP_ROOT)).length, 0);
    await fs.unlink(path.join(PUBLIC_ROOT, response.body.fileName));
});
test('Path traversal cannot read configuration files and JSON size limits return a controlled error', async () => {
    const c = await client();
    for (const url of ['/images/%2e%2e/%2e%2e/package.json', '/images/.env', '/images/%2e%2e%2fconfig.ts']) {
        const response = await c.agent.get(url);
        assert.ok(response.status >= 400);
        assert.doesNotMatch(response.text, /AUTH_ACCESS_TOKEN_SECRET|weblarek_backend|ENOENT|bad-server\/backend/);
    }
    await write(c, 'post', '/order').send({ ...orderBody(), address: 'x'.repeat(40000) }).expect(413);
    let nested = { field: 'x' }; for (let i = 0; i < 15; i++) nested = { value: nested };
    await write(c, 'post', '/auth/register').send(nested).expect(400);
    await write(c, 'post', '/auth/login').set('Origin', 'https://attacker.example').send({ email: 'alice@example.test', password: 'password' }).expect(403);
});
test('Catalog caching avoids repeated reads and invalidates after catalog mutations', async () => {
    const c = await client(admin);
    const first = await c.agent.get('/product').expect(200);
    assert.equal(first.headers['cache-control'], 'public, max-age=30');
    const title = `New-${randomUUID().slice(0, 8)}`;
    const created = await write(c, 'post', '/product').send({ title, price: null, category: 'другое', description: 'New sample', image: { fileName: '/images/Shell.png', originalName: 'Shell.png' } }).expect(201);
    assert.equal(created.body.price, null);
    const second = await c.agent.get('/product').expect(200);
    assert.equal(second.body.pagination.totalProducts, first.body.pagination.totalProducts + 1);
    await write(c, 'patch', `/product/${created.body._id}`).send({ price: null }).expect(200);
    await write(c, 'delete', `/product/${created.body._id}`).expect(200);
    const final = await c.agent.get('/product').expect(200);
    assert.equal(final.body.pagination.totalProducts, first.body.pagination.totalProducts);
});
test('Concurrent requests trigger rate limiting even with forged proxy headers; health stays available', async () => {
    const responses = await Promise.all(Array.from({ length: 60 }, (_, index) => request(app).get('/product').set('X-Forwarded-For', `192.0.2.${index}`)));
    assert.ok(responses.some(response => response.status === 429));
    assert.ok(responses.every(response => response.status === 200 || response.status === 429));
    await request(app).get('/health').expect(200);
});
