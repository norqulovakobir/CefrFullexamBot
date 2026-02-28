const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g. https://your-app.onrender.com
const PORT = process.env.PORT || 3000;
const FULL_EXAM_URL = process.env.FULL_EXAM_URL;
const SPEAKING_URL = process.env.SPEAKING_URL;
const WRITING_URL = process.env.WRITING_URL;
const ADMIN_URL = process.env.ADMIN_URL;
const TEST_URL = process.env.TEST_URL;
const BOT_USERNAME = process.env.BOT_USERNAME;

// Botni webhook rejimida yaratish
const bot = new TelegramBot(BOT_TOKEN, { webHook: true });

// Express server
const app = express();
app.use(express.json());

// Webhook yo'li - TOKEN ishlatish xavfsizlik uchun
const WEBHOOK_PATH = `/bot${BOT_TOKEN}`;

// Webhookni o'rnatish
async function setupWebhook() {
  try {
    const webhookFullUrl = `${WEBHOOK_URL}${WEBHOOK_PATH}`;
    await bot.setWebHook(webhookFullUrl);
    console.log(`✅ Webhook o'rnatildi: ${webhookFullUrl}`);
  } catch (error) {
    console.error('❌ Webhook o\'rnatishda xatolik:', error);
  }
}

// Express Telegram update larni qabul qiladi
app.post(WEBHOOK_PATH, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Health check - Render uchun muhim
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Bot is running with webhook!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Webhook info ko'rish
app.get('/webhook-info', async (req, res) => {
  try {
    const info = await bot.getWebHookInfo();
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serverni ishga tushirish
app.listen(PORT, async () => {
  console.log(`🚀 Server port ${PORT} da ishga tushdi`);
  console.log('📡 Webhook rejimi...');
  await setupWebhook();
});

// ─────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────

async function checkSubscription(userId) {
  try {
    if (!CHANNEL_USERNAME || CHANNEL_USERNAME === 'your_channel') {
      return true;
    }
    const chatMember = await bot.getChatMember(CHANNEL_USERNAME, userId);
    return chatMember.status !== 'left' && chatMember.status !== 'kicked';
  } catch (error) {
    console.error('Obunani tekshirishda xatolik:', error);
    return true;
  }
}

function getReplyKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ['🧪 Testni boshlash', '🗣️ Speaking'],
        ['✍️ Writing', '📚 Full Exam'],
        ["👨‍💻 Admin bilan bog'lanish", '🔗 Dostlarga ulashish'],
        ['❓ Yordam']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
}

// ─────────────────────────────────────────
// COMMANDS
// ─────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const isSubscribed = await checkSubscription(userId);

    if (!isSubscribed) {
      await bot.sendMessage(chatId,
        `🚀 *Botdan to'liq foydalanish uchun kanalga obuna bo'ling!*\n\n` +
        `📢 Quyidagi tugmani bosib kanalga obuna bo'ling va keyin /start ni qayta bosing`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: `📺 Kanalga obuna bo'lish`, url: `https://t.me/${CHANNEL_USERNAME}` }]
            ]
          }
        }
      );
    } else {
      await bot.sendMessage(chatId,
        `🎉 *Xush kelibsiz!*\n\n` +
        `👇 Quyidagi bo'limlardan birini tanlang:`,
        {
          parse_mode: 'Markdown',
          ...getReplyKeyboard()
        }
      );
    }
  } catch (error) {
    console.error('Start komandasida xatolik:', error);
    await bot.sendMessage(chatId, '👋 Salom! Bot ishga tushdi. /help yordam uchun.');
  }
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendMessage(chatId,
      `🤖 *Bot haqida ma'lumot*\n\n` +
      `Bu bot sizga quyidagi imkoniyatlarni beradi:\n\n` +
      `🧪 *Testni boshlash* - Testlar yechish\n` +
      `🗣️ *Speaking* - Gapirish mashqlari\n` +
      `✍️ *Writing* - Yozish mashqlari\n` +
      `📚 *Full Exam* - To'liq imtihonlar\n` +
      `👨‍💻 *Admin* - Admin bilan bog'lanish\n` +
      `🔗 *Ulashish* - Dostlarga ulashish\n\n` +
      `Botdan foydalanish uchun avval kanalga obuna bo'ling!`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Help komandasida xatolik:', error);
    await bot.sendMessage(chatId, '🤖 Bot haqida ma\'lumot: /start dan foydalaning!');
  }
});

// ─────────────────────────────────────────
// REPLY KEYBOARD HANDLERS
// ─────────────────────────────────────────

bot.onText(/🧪 Testni boshlash/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId,
    '🧪 *Test bo\'limi*\n\nTest uchun mini app ochilmoqda...',
    { parse_mode: 'Markdown' }
  );
  await bot.sendMessage(chatId, '📱 Testni boshlash:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🧪 Testni ochish', web_app: { url: TEST_URL } }]
      ]
    }
  });
});

bot.onText(/🗣️ Speaking/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId,
    '🗣️ *Speaking bo\'limi*\n\nGapirish mashqlari uchun mini app ochilmoqda...',
    { parse_mode: 'Markdown' }
  );
  await bot.sendMessage(chatId, '📱 Speakingni ochish:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🗣️ Speakingni ochish', web_app: { url: SPEAKING_URL } }]
      ]
    }
  });
});

bot.onText(/✍️ Writing/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId,
    '✍️ *Writing bo\'limi*\n\nYozish mashqlari uchun mini app ochilmoqda...',
    { parse_mode: 'Markdown' }
  );
  await bot.sendMessage(chatId, '📱 Writingni ochish:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✍️ Writingni ochish', web_app: { url: WRITING_URL } }]
      ]
    }
  });
});

bot.onText(/📚 Full Exam/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId,
    '📚 *Full Exam bo\'limi*\n\nTo\'liq imtihonlar uchun mini app ochilmoqda...',
    { parse_mode: 'Markdown' }
  );
  await bot.sendMessage(chatId, '📱 Full Examni ochish:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📚 Full Examni ochish', web_app: { url: FULL_EXAM_URL } }]
      ]
    }
  });
});

bot.onText(/👨‍💻 Admin bilan bog'lanish/, async (msg) => {
  const chatId = msg.chat.id;
  const adminInfo =
    `👨‍💻 *Admin ma'lumotlari*\n\n` +
    `👤 *Ism familiya:* Akobir Norqulov\n` +
    `📱 *Telefon raqami:* +998 88 128 33 43\n` +
    `🔗 *Telegram username:* @developerslar\n\n` +
    `📞 *Admin bilan bog'lanish uchun:* [Telegram orqali yozish](https://t.me/developerslar)`;

  await bot.sendMessage(chatId, adminInfo, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📤 Admin ga yozish', url: 'https://t.me/developerslar' }]
      ]
    }
  });
});

bot.onText(/🔗 Dostlarga ulashish/, async (msg) => {
  const chatId = msg.chat.id;
  const shareText =
    `🎯 Ajoyib imkoniyat! Ushbu bot orqali:\n\n` +
    `🧪 Testni boshlash\n🗣️ Speaking\n✍️ Writing\n📚 Full Exam\n` +
    `👨‍💻 Admin bilan bog'lanish\n\nBotdan foydalanish uchun: ${BOT_USERNAME}`;

  await bot.sendMessage(chatId, '📤 *Ulashish uchun quyidagi tugmani bosing:*', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📤 Ulashish', url: `https://t.me/share/url?url=${encodeURIComponent(shareText)}` }]
      ]
    }
  });
});

bot.onText(/❓ Yordam/, async (msg) => {
  const chatId = msg.chat.id;
  const helpText =
    `🤖 *Bot haqida ma'lumot*\n\n` +
    `Bu bot sizga quyidagi imkoniyatlarni beradi:\n\n` +
    `🧪 *Testni boshlash* - Testlar yechish\n` +
    `🗣️ *Speaking* - Gapirish mashqlari\n` +
    `✍️ *Writing* - Yozish mashqlari\n` +
    `📚 *Full Exam* - To'liq imtihonlar\n` +
    `👨‍💻 *Admin* - Admin bilan bog'lanish\n` +
    `🔗 *Ulashish* - Dostlarga ulashish\n\n` +
    `Botdan foydalanish uchun pastdagi tugmalardan foydalaning!`;

  await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// ─────────────────────────────────────────
// CALLBACK QUERIES
// ─────────────────────────────────────────

bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  bot.answerCallbackQuery(callbackQuery.id);

  if (data === 'share_friends') {
    const shareText =
      `🎯 Ajoyib imkoniyat! Ushbu bot orqali:\n\n` +
      `🧪 Testni boshlash\n🗣️ Speaking\n✍️ Writing\n📚 Full Exam\n` +
      `👨‍💻 Admin bilan bog'lanish\n\nBotdan foydalanish uchun: ${BOT_USERNAME}`;

    await bot.sendMessage(chatId, shareText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📤 Ulashish', url: `https://t.me/share/url?url=${encodeURIComponent(shareText)}` }]
        ]
      }
    });
  }
});

// Xatolarni ushlash
bot.on('polling_error', (error) => {
  console.error('Polling xatosi:', error);
});

bot.on('webhook_error', (error) => {
  console.error('Webhook xatosi:', error);
});

console.log('🤖 Bot ishga tushdi (webhook rejimi)...');