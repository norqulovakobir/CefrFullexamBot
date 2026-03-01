# Telegram Subscription Bot

Node.js da yozilgan Telegram bot majburiy kanal obunasi bilan. Localda polling, serverda webhook rejimida ishlaydi.

## Xususiyatlari

- ✅ Majburiy kanal obunasi tekshiruvi
- 📝 Test topshirish uchun mini-app (Web App)
- 🔗 Dostlarga ulashish funksiyasi
- 👨‍💻 Admin bilan bog'lanish
- 🎨 Chiroyli va zamonaviy interfeys
- 🔄 Dual mode: Polling (local) + Webhook (server)
- 🔐 Environment variables bilan xavfsizlik

## O'rnatish

1. Paketlarni o'rnatish:
```bash
npm install
```

2. Environment variables sozlash:
```bash
cp .env.example .env
```

`.env` fayliga o'zingizning ma'lumotlaringizni kiriting:
```
BOT_TOKEN=your_bot_token_here
CHANNEL_USERNAME=@your_channel
ADMIN_NAME=Your Name
ADMIN_PHONE=+998901234567
ADMIN_TELEGRAM=https://t.me/your_username
WEBHOOK_URL=https://your-app.onrender.com
PORT=3000
NODE_ENV=development  # local uchun, serverda "production"
```

## Ishga tushurish

### Local development (Polling mode):
```bash
npm start
```

### Server deployment (Webhook mode):
Render yoki boshqa platformaga yuklashdan oldin:
1. `NODE_ENV=production` deb o'rnating
2. `WEBHOOK_URL` ni to'g'ri kiriting
3. Platformaning portidan foydalaning (odatda `process.env.PORT`)

## Rejimlar

### 🏠 Local (Polling)
- `NODE_ENV=development`
- Bot polling orqali ishlaydi
- Test va development uchun qulay

### 🌐 Server (Webhook)
- `NODE_ENV=production`
- Avtomatik webhook o'rnatiladi
- Render/Heroku/Vercel kabi platformalar uchun
- Health check endpoint: `/health`

## Render uchun sozlash

1. Repositoryni GitHub'ga yuklang
2. Render.com da "New Web Service" yarating
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment Variables qo'shing:
   - `NODE_ENV=production`
   - `BOT_TOKEN=your_token`
   - `CHANNEL_USERNAME=@your_channel`
   - `WEBHOOK_URL=https://your-app.onrender.com`
   - `ADMIN_NAME=Your Name`
   - `ADMIN_PHONE=+998901234567`
   - `ADMIN_TELEGRAM=https://t.me/your_username`
   - `PORT=3000` (Render o'z portini beradi, lekin bu kerak)

## Bot funksiyalari

1. **Start komandasi** - Foydalanuvchi startni bossa, kanalga obuna bo'lish taklif qilinadi
2. **Obuna tekshiruvi** - Kanalga obuna bo'lish tekshiriladi
3. **Asosiy menyu** - Obuna tasdiqlangach asosiy menyu ochiladi:
   - 📝 Testni topshirish (Mini-app)
   - 🔗 Dostlarga ulashish
   - 👨‍💻 Admin bilan bog'lanish

## API Endpoints

- `POST /webhook` - Telegram webhook (faqat production mode)
- `GET /health` - Server holatini tekshirish

## Xavfsizlik

- Barcha敏感 ma'lumotlar `.env` faylda saqlanadi
- `.gitignore` ga `.env` qo'shilgan
- Environment variables orqali konfiguratsiya
