const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

// Environment variables validation
const requiredEnvVars = ['BOT_TOKEN', 'BASE_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;
const FULL_EXAM_URL = process.env.FULL_EXAM_URL;
const SPEAKING_URL = process.env.SPEAKING_URL;
const WRITING_URL = process.env.WRITING_URL;
const ADMIN_URL = process.env.ADMIN_URL;
const TEST_URL = process.env.TEST_URL;
const BOT_USERNAME = process.env.BOT_USERNAME;

// Initialize Express app
const app = express();
app.use(express.json());

// Webhook path configuration
const WEBHOOK_PATH = `/webhook/${BOT_TOKEN}`;
const WEBHOOK_URL = `${BASE_URL}${WEBHOOK_PATH}`;

// Initialize Telegram bot with webhook
const bot = new TelegramBot(BOT_TOKEN, { webHook: true });

// Setup webhook after server starts
async function setupWebhook() {
  try {
    const webhookInfo = await bot.getWebHookInfo();
    
    // Only set webhook if it's different from current
    if (webhookInfo.url !== WEBHOOK_URL) {
      await bot.setWebHook(WEBHOOK_URL);
      console.log(`✅ Webhook updated: ${WEBHOOK_URL.replace(BOT_TOKEN, '***')}`);
    } else {
      console.log('✅ Webhook already configured correctly');
    }
  } catch (error) {
    console.error('❌ Failed to setup webhook:', error.message);
    process.exit(1);
  }
}

// Webhook endpoint
app.post(WEBHOOK_PATH, (req, res) => {
  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error processing update:', error);
    res.sendStatus(500);
  }
});

// Health check endpoints
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Telegram Bot is running with webhook!',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString()
  });
});

// Webhook info endpoint (debug)
app.get('/webhook-info', async (req, res) => {
  try {
    const info = await bot.getWebHookInfo();
    // Hide token in response
    const safeInfo = {
      ...info,
      url: info.url.replace(BOT_TOKEN, '***')
    };
    res.json(safeInfo);
  } catch (error) {
    console.error('❌ Error getting webhook info:', error);
    res.status(500).json({ error: 'Failed to get webhook info' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`📡 Webhook mode enabled`);
  
  // Setup webhook after server is ready
  await setupWebhook();
  
  console.log('🤖 Bot is ready to receive updates');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  try {
    await bot.deleteWebHook();
    console.log('✅ Webhook deleted');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  try {
    await bot.deleteWebHook();
    console.log('✅ Webhook deleted');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
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
    console.error('❌ Error checking subscription:', error.message);
    return true; // Allow access if check fails
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
// COMMAND HANDLERS
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
    console.error('❌ Error in /start command:', error.message);
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
    console.error('❌ Error in /help command:', error.message);
    await bot.sendMessage(chatId, '🤖 Bot haqida ma\'lumot: /start dan foydalaning!');
  }
});

// ─────────────────────────────────────────
// REPLY KEYBOARD HANDLERS
// ─────────────────────────────────────────

bot.onText(/🧪 Testni boshlash/, async (msg) => {
  const chatId = msg.chat.id;
  try {
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
  } catch (error) {
    console.error('❌ Error in test handler:', error.message);
    await bot.sendMessage(chatId, '❌ Testni ochishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
});

bot.onText(/🗣️ Speaking/, async (msg) => {
  const chatId = msg.chat.id;
  try {
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
  } catch (error) {
    console.error('❌ Error in speaking handler:', error.message);
    await bot.sendMessage(chatId, '❌ Speakingni ochishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
});

bot.onText(/✍️ Writing/, async (msg) => {
  const chatId = msg.chat.id;
  try {
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
  } catch (error) {
    console.error('❌ Error in writing handler:', error.message);
    await bot.sendMessage(chatId, '❌ Writingni ochishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
});

bot.onText(/📚 Full Exam/, async (msg) => {
  const chatId = msg.chat.id;
  try {
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
  } catch (error) {
    console.error('❌ Error in full exam handler:', error.message);
    await bot.sendMessage(chatId, '❌ Full Examni ochishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
});

bot.onText(/👨‍💻 Admin bilan bog'lanish/, async (msg) => {
  const chatId = msg.chat.id;
  try {
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
  } catch (error) {
    console.error('❌ Error in admin handler:', error.message);
    await bot.sendMessage(chatId, '❌ Admin bilan bog\'lanishda xatolik yuz berdi.');
  }
});

bot.onText(/🔗 Dostlarga ulashish/, async (msg) => {
  const chatId = msg.chat.id;
  try {
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
  } catch (error) {
    console.error('❌ Error in share handler:', error.message);
    await bot.sendMessage(chatId, '❌ Ulashishda xatolik yuz berdi.');
  }
});

bot.onText(/❓ Yordam/, async (msg) => {
  const chatId = msg.chat.id;
  try {
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
  } catch (error) {
    console.error('❌ Error in help handler:', error.message);
    await bot.sendMessage(chatId, '❌ Yordam ko\'rsatishda xatolik yuz berdi.');
  }
});

// ─────────────────────────────────────────
// CALLBACK QUERY HANDLER
// ─────────────────────────────────────────

bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  try {
    await bot.answerCallbackQuery(callbackQuery.id);

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
  } catch (error) {
    console.error('❌ Error in callback query handler:', error.message);
  }
});

// ─────────────────────────────────────────
// ERROR HANDLERS
// ─────────────────────────────────────────

bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.message);
});

bot.on('webhook_error', (error) => {
  console.error('❌ Webhook error:', error.message);
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

console.log('🤖 Bot initialization complete...');