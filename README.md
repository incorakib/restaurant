# Grill Restaurant – Food Ordering & Management System
SE331 Software Engineering Design Capstone – Assessment 2

Zero-dependency web app: **Node.js** backend (built-in `http` module), **vanilla HTML/CSS/JS** front-end, JSON-file database.
No `npm install` needed.

## Run
```
node server.js
```
- Customer site: http://localhost:3000
- Admin panel:   http://localhost:3000/admin   (username `admin`, password `admin123`)

Requires Node.js 16+. The database file `data/db.json` is created automatically with sample data on first run (delete it to reset).

## Feature checklist (marks)
| Feature | Where |
|---|---|
| Display food menu (7) | Menu grid, `GET /api/foods` |
| Food category filtering (5) | Category chips, `?category=` |
| Search food items (5) | Search bar, `?q=` |
| Add items to shopping cart (10) | "Add to cart" (cart is kept in localStorage) |
| Increase/decrease quantities (5) | +/- buttons in "My Order", trash icon removes |
| Calculate total bill (7) | Items / Discount / Total Amount panel (server re-calculates) |
| Place an order (8) | Checkout -> name/phone (+address for Delivery) -> `POST /api/orders` |
| Order tracking (8) | Track view, live status stepper (auto-refresh 5 s) |
| Admin food management (8) | Admin -> Food Management (add / edit / delete / hide) |
| Discount coupon (5) | Coupon box; admin manages coupons. Try `WELCOME10`, `SAVE5` |
| Order status management (5) | Admin -> Orders: Pending -> Preparing -> Ready -> Completed / Cancelled |
| Daily sales report (5) | Admin -> Daily Sales Report (pick date, printable) |
| Customer order history (5) | My Orders (by phone number) |
| Bonus: recommendations (5) | "Goes well with your order" box - popular items + complementary drinks/desserts |

## Project structure
```
server.js          REST API + static file server
data/db.json       auto-generated database
public/index.html  customer UI      public/app.js    customer logic
public/admin.html  admin UI         public/admin.js  admin logic
public/style.css   shared styles
```

## API summary
Public: `GET /api/foods`, `GET /api/categories`, `POST /api/coupons/validate`, `POST /api/orders`, `GET /api/orders/:id`, `GET /api/orders?phone=`, `GET /api/recommendations?ids=`
Admin (header `x-admin-token`): `POST /api/admin/login`, CRUD `/api/admin/foods`, `/api/admin/orders`, `PATCH /api/admin/orders/:id/status`, `/api/admin/coupons`, `GET /api/admin/report?date=`

Team: Mahajabin Moon, Miskat Hossain, Md. Rakibul Islam
