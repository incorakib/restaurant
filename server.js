// Grill Restaurant - Food Ordering & Management System (Node.js, zero dependencies)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN = { user: 'admin', pass: 'admin123' };
const STATUSES = ['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
const BASE_CATEGORIES = ['Pizza', 'Fast Food', 'Noodle', 'Dessert', 'Sea Food', 'Sushi', 'Ramen', 'Drinks'];
const COMPLEMENT_CATS = ['Drinks', 'Dessert']; // suggested alongside main dishes

// ---------- Database (JSON file) ----------
function seed() {
  const f = (id, name, price, category, emoji, description = 'With Onion, cheese, Olives And many more...') =>
    ({ id, name, price, category, emoji, description, rating: 5.0, available: true });
  return {
    counter: 1000,
    nextFoodId: 19,
    foods: [
      f(1, 'Onion Pizza', 60, 'Pizza', '🍕'), f(2, 'Cheese Burst Pizza', 75, 'Pizza', '🍕'),
      f(3, 'Mix Veg', 85.1, 'Fast Food', '🥗'), f(4, 'Noodle Soup', 50, 'Noodle', '🍜'),
      f(5, 'Chicken Chowmein', 55, 'Noodle', '🍝'), f(6, 'Salad', 15, 'Fast Food', '🥗'),
      f(7, 'Makai Shorba', 65.5, 'Fast Food', '🍲'), f(8, 'Egg Corn', 45, 'Fast Food', '🌽'),
      f(9, 'Chocolate Lava Cake', 30, 'Dessert', '🍰', 'Warm, gooey and rich'),
      f(10, 'Ice Cream', 20, 'Dessert', '🍨', 'Three scoops of happiness'),
      f(11, 'Grilled Prawns', 95, 'Sea Food', '🦐'), f(12, 'Fish Fry', 70, 'Sea Food', '🐟'),
      f(13, 'Salmon Sushi', 80, 'Sushi', '🍣'), f(14, 'California Roll', 65, 'Sushi', '🍱'),
      f(15, 'Tonkotsu Ramen', 90, 'Ramen', '🍜'), f(16, 'Spicy Miso Ramen', 85, 'Ramen', '🍜'),
      f(17, 'Cold Coffee', 18, 'Drinks', '🥤', 'Chilled and creamy'),
      f(18, 'Lemon Mint Cooler', 12, 'Drinks', '🍹', 'Fresh and zesty'),
    ],
    coupons: [
      { code: 'WELCOME10', type: 'percent', value: 10, minOrder: 50, active: true },
      { code: 'SAVE5', type: 'flat', value: 5, minOrder: 30, active: true },
    ],
    orders: [],
  };
}
function save() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(seed(), null, 2));
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
let db = load();

// ---------- Helpers ----------
const round2 = n => Math.round(n * 100) / 100;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const categories = () => [...new Set([...BASE_CATEGORIES, ...db.foods.map(f => f.category)])].filter(c => db.foods.some(f => f.category === c));
const tokens = new Set();

function send(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
  });
}
function isAdmin(req) { return tokens.has(req.headers['x-admin-token']); }

function discountFor(coupon, subtotal) {
  if (!coupon || !coupon.active) return 0;
  if (subtotal < (coupon.minOrder || 0)) return 0;
  const d = coupon.type === 'percent' ? subtotal * coupon.value / 100 : coupon.value;
  return round2(Math.min(d, subtotal));
}
function findCoupon(code, subtotal) {
  const c = db.coupons.find(x => x.code.toLowerCase() === String(code || '').trim().toLowerCase());
  if (!c || !c.active) return { error: 'Invalid or inactive coupon code' };
  if (subtotal < (c.minOrder || 0)) return { error: `Minimum order $${c.minOrder} required for this coupon` };
  return { coupon: c };
}
function popularity() {
  const map = {};
  db.orders.filter(o => o.status !== 'Cancelled').forEach(o => o.items.forEach(i => { map[i.foodId] = (map[i.foodId] || 0) + i.qty; }));
  return map;
}

// ---------- API ----------
async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  let match;

  // ----- Public: menu -----
  if (m === 'GET' && p === '/api/categories') return send(res, 200, categories());
  if (m === 'GET' && p === '/api/foods') {
    const cat = url.searchParams.get('category'), q = (url.searchParams.get('q') || '').toLowerCase().trim();
    let list = db.foods.filter(f => f.available);
    if (cat && cat !== 'All') list = list.filter(f => f.category === cat);
    if (q) list = list.filter(f => (f.name + ' ' + f.category + ' ' + f.description).toLowerCase().includes(q));
    return send(res, 200, list);
  }

  // ----- Public: recommendations (bonus) -----
  if (m === 'GET' && p === '/api/recommendations') {
    const ids = (url.searchParams.get('ids') || '').split(',').map(Number).filter(Boolean);
    const pop = popularity();
    const avail = db.foods.filter(f => f.available && !ids.includes(f.id));
    const byPop = (a, b) => (pop[b.id] || 0) - (pop[a.id] || 0) || b.rating - a.rating;
    if (!ids.length) return send(res, 200, { reason: 'Popular right now', items: avail.sort(byPop).slice(0, 4) });
    const cartCats = db.foods.filter(f => ids.includes(f.id)).map(f => f.category);
    const wantDrink = !cartCats.includes('Drinks'), wantDessert = !cartCats.includes('Dessert');
    const comp = avail.filter(f => (f.category === 'Drinks' && wantDrink) || (f.category === 'Dessert' && wantDessert)).sort(byPop);
    const rest = avail.filter(f => !COMPLEMENT_CATS.includes(f.category) && cartCats.includes(f.category)).sort(byPop);
    return send(res, 200, { reason: 'Goes well with your order', items: [...comp, ...rest].slice(0, 4) });
  }

  // ----- Public: coupons -----
  if (m === 'POST' && p === '/api/coupons/validate') {
    const b = await readBody(req);
    const r = findCoupon(b.code, Number(b.subtotal) || 0);
    if (r.error) return send(res, 400, { error: r.error });
    const c = r.coupon;
    return send(res, 200, { code: c.code, type: c.type, value: c.value, minOrder: c.minOrder });
  }

  // ----- Public: place order -----
  if (m === 'POST' && p === '/api/orders') {
    const b = await readBody(req);
    const name = String(b.customerName || '').trim(), phone = String(b.phone || '').trim();
    if (!name) return send(res, 400, { error: 'Customer name is required' });
    if (!/^[0-9+\-\s]{6,20}$/.test(phone)) return send(res, 400, { error: 'Enter a valid phone number' });
    if (!Array.isArray(b.items) || !b.items.length) return send(res, 400, { error: 'Cart is empty' });
    const items = [];
    for (const it of b.items) {
      const food = db.foods.find(f => f.id === Number(it.foodId));
      const qty = Math.floor(Number(it.qty));
      if (!food || !food.available) return send(res, 400, { error: 'An item in your cart is no longer available' });
      if (!(qty >= 1 && qty <= 50)) return send(res, 400, { error: 'Invalid quantity' });
      items.push({ foodId: food.id, name: food.name, price: food.price, qty });
    }
    const subtotal = round2(items.reduce((s, i) => s + i.price * i.qty, 0));
    let discount = 0, couponCode = null;
    if (b.coupon) {
      const r = findCoupon(b.coupon, subtotal);
      if (r.error) return send(res, 400, { error: r.error });
      discount = discountFor(r.coupon, subtotal); couponCode = r.coupon.code;
    }
    const now = new Date();
    const order = {
      id: 'ORD-' + (++db.counter), customerName: name, phone,
      type: ['Dine', 'Pick Up', 'Delivery'].includes(b.type) ? b.type : 'Dine',
      payment: ['Cash', 'Debit', 'E-Wallet'].includes(b.payment) ? b.payment : 'Cash',
      address: b.type === 'Delivery' ? String(b.address || '').trim() : '',
      items, subtotal, discount, coupon: couponCode, total: round2(subtotal - discount),
      status: 'Pending', date: today(), createdAt: now.toISOString(),
      history: [{ status: 'Pending', at: now.toISOString() }],
    };
    db.orders.push(order); save();
    return send(res, 201, order);
  }

  // ----- Public: tracking & history -----
  if (m === 'GET' && (match = p.match(/^\/api\/orders\/(ORD-\d+)$/i))) {
    const o = db.orders.find(x => x.id === match[1].toUpperCase());
    return o ? send(res, 200, o) : send(res, 404, { error: 'Order not found' });
  }
  if (m === 'GET' && p === '/api/orders') {
    const phone = (url.searchParams.get('phone') || '').trim();
    if (!phone) return send(res, 400, { error: 'Phone number is required' });
    return send(res, 200, db.orders.filter(o => o.phone === phone).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  // ----- Admin -----
  if (m === 'POST' && p === '/api/admin/login') {
    const b = await readBody(req);
    if (b.username === ADMIN.user && b.password === ADMIN.pass) {
      const t = crypto.randomBytes(24).toString('hex'); tokens.add(t); return send(res, 200, { token: t });
    }
    return send(res, 401, { error: 'Wrong username or password' });
  }
  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });

    // Food management (CRUD)
    if (m === 'GET' && p === '/api/admin/foods') return send(res, 200, db.foods);
    if ((m === 'POST' && p === '/api/admin/foods') || (m === 'PUT' && (match = p.match(/^\/api\/admin\/foods\/(\d+)$/)))) {
      const b = await readBody(req);
      const name = String(b.name || '').trim(), price = Number(b.price), category = String(b.category || '').trim();
      if (!name || !category || !(price > 0)) return send(res, 400, { error: 'Name, category and a price above 0 are required' });
      const data = {
        name, price: round2(price), category, emoji: String(b.emoji || '🍽️').slice(0, 4),
        description: String(b.description || '').trim(), rating: Math.min(5, Math.max(0, Number(b.rating) || 5)),
        available: b.available !== false,
      };
      if (m === 'POST') { const food = { id: db.nextFoodId++, ...data }; db.foods.push(food); save(); return send(res, 201, food); }
      const food = db.foods.find(x => x.id === Number(match[1]));
      if (!food) return send(res, 404, { error: 'Food not found' });
      Object.assign(food, data); save(); return send(res, 200, food);
    }
    if (m === 'DELETE' && (match = p.match(/^\/api\/admin\/foods\/(\d+)$/))) {
      const i = db.foods.findIndex(x => x.id === Number(match[1]));
      if (i < 0) return send(res, 404, { error: 'Food not found' });
      db.foods.splice(i, 1); save(); return send(res, 200, { ok: true });
    }

    // Order status management
    if (m === 'GET' && p === '/api/admin/orders') {
      const st = url.searchParams.get('status');
      let list = [...db.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (st && st !== 'All') list = list.filter(o => o.status === st);
      return send(res, 200, list);
    }
    if (m === 'PATCH' && (match = p.match(/^\/api\/admin\/orders\/(ORD-\d+)\/status$/))) {
      const b = await readBody(req);
      const o = db.orders.find(x => x.id === match[1]);
      if (!o) return send(res, 404, { error: 'Order not found' });
      if (!STATUSES.includes(b.status)) return send(res, 400, { error: 'Invalid status' });
      o.status = b.status; o.history.push({ status: b.status, at: new Date().toISOString() }); save();
      return send(res, 200, o);
    }

    // Coupons
    if (m === 'GET' && p === '/api/admin/coupons') return send(res, 200, db.coupons);
    if (m === 'POST' && p === '/api/admin/coupons') {
      const b = await readBody(req);
      const code = String(b.code || '').trim().toUpperCase(), value = Number(b.value);
      if (!code || !(value > 0) || !['percent', 'flat'].includes(b.type)) return send(res, 400, { error: 'Code, type and value are required' });
      if (b.type === 'percent' && value > 100) return send(res, 400, { error: 'Percent cannot exceed 100' });
      if (db.coupons.some(c => c.code === code)) return send(res, 400, { error: 'Coupon code already exists' });
      const c = { code, type: b.type, value, minOrder: Number(b.minOrder) || 0, active: true };
      db.coupons.push(c); save(); return send(res, 201, c);
    }
    if (m === 'PATCH' && (match = p.match(/^\/api\/admin\/coupons\/([^/]+)$/))) {
      const c = db.coupons.find(x => x.code === decodeURIComponent(match[1]));
      if (!c) return send(res, 404, { error: 'Coupon not found' });
      c.active = !c.active; save(); return send(res, 200, c);
    }
    if (m === 'DELETE' && (match = p.match(/^\/api\/admin\/coupons\/([^/]+)$/))) {
      db.coupons = db.coupons.filter(x => x.code !== decodeURIComponent(match[1])); save(); return send(res, 200, { ok: true });
    }

    // Daily sales report
    if (m === 'GET' && p === '/api/admin/report') {
      const date = url.searchParams.get('date') || today();
      const day = db.orders.filter(o => o.date === date);
      const valid = day.filter(o => o.status !== 'Cancelled');
      const items = {}, payments = {}, statuses = {};
      day.forEach(o => { statuses[o.status] = (statuses[o.status] || 0) + 1; });
      valid.forEach(o => {
        payments[o.payment] = round2((payments[o.payment] || 0) + o.total);
        o.items.forEach(i => {
          items[i.name] = items[i.name] || { name: i.name, qty: 0, revenue: 0 };
          items[i.name].qty += i.qty; items[i.name].revenue = round2(items[i.name].revenue + i.qty * i.price);
        });
      });
      const revenue = round2(valid.reduce((s, o) => s + o.total, 0));
      return send(res, 200, {
        date, totalOrders: day.length, validOrders: valid.length, cancelled: day.length - valid.length,
        grossSales: round2(valid.reduce((s, o) => s + o.subtotal, 0)),
        discounts: round2(valid.reduce((s, o) => s + o.discount, 0)), revenue,
        avgOrder: valid.length ? round2(revenue / valid.length) : 0,
        topItems: Object.values(items).sort((a, b) => b.qty - a.qty), payments, statuses,
      });
    }
  }
  return send(res, 404, { error: 'Not found' });
}

// ---------- Static files + server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let file = url.pathname === '/' ? '/index.html' : url.pathname === '/admin' ? '/admin.html' : url.pathname;
    const full = path.normalize(path.join(PUBLIC_DIR, file));
    if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  } catch (e) { send(res, 400, { error: e.message || 'Bad request' }); }
}).listen(PORT, () => {
  console.log(`\n  Grill Restaurant is running`);
  console.log(`  Customer site : http://localhost:${PORT}`);
  console.log(`  Admin panel   : http://localhost:${PORT}/admin   (admin / admin123)\n`);
});
