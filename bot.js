const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

// Bot tokenini shu yerga kiriting
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;
const FULL_EXAM_URL = process.env.FULL_EXAM_URL;
const SPEAKING_URL = process.env.SPEAKING_URL;
const WRITING_URL = process.env.WRITING_URL;
const ADMIN_URL = process.env.ADMIN_URL;
const TEST_URL = process.env.TEST_URL;
const BOT_USERNAME = process.env.BOT_USERNAME;

// Botni yaratish (polling uchun)
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Express server for web app
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running with polling!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Bot is running with polling mode');
});

// Kanalga obuna bo'lish tekshiruvi
async function checkSubscription(userId) {
  try {
    // Kanal username bo'sh bo'lsa, true qaytaramiz (tekshirmasdan)
    if (!CHANNEL_USERNAME || CHANNEL_USERNAME === 'your_channel') {
      return true;
    }
    const chatMember = await bot.getChatMember(CHANNEL_USERNAME, userId);
    return chatMember.status !== 'left' && chatMember.status !== 'kicked';
  } catch (error) {
    console.error('Obunani tekshirishda xatolik:', error);
    return true; // Xatolik bo'lsa ham davom etish uchun
  }
}

// Reply Keyboard - pastda doimiy knopkalar
function getReplyKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ['🧪 Testni boshlash', '🗣️ Speaking'],
        ['✍️ Writing', '📚 Full Exam'],
        ['👨‍💻 Admin bilan bog\'lanish', '🔗 Dostlarga ulashish'],
        ['❓ Yordam']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
}

// Dostlarga ulashish tugmasi
async function handleShare(chatId) {
  const shareText = `🎯 Ajoyib imkoniyat! Ushbu bot orqali:\n\n🧪 Testni boshlash\n🗣️ Speaking\n✍️ Writing\n📚 Full Exam\n👨‍💻 Admin bilan bog'lanish\n\nBotdan foydalanish uchun: ${BOT_USERNAME}`;
  
  await bot.sendMessage(chatId, shareText, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📤 Ulashish', url: `https://t.me/share/url?url=${encodeURIComponent(shareText)}` }
        ]
      ]
    }
  });
}

// Start komandasi
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    // Obunani tekshirish
    const isSubscribed = await checkSubscription(userId);
    
    if (!isSubscribed) {
      // Obuna bo'lmagan bo'lsa
      await bot.sendMessage(chatId, 
        `🚀 *Botdan to'liq foydalanish uchun kanalga obuna bo'ling!*\n\n` +
        `📢 Quyidagi tugmani bosib kanalga obuna bo'ling va keyin /start ni qayta bosing`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: `📺 Kanalga obuna bo'lish`, url: `https://t.me/${CHANNEL_USERNAME}` }
              ]
            ]
          }
        }
      );
    } else {
      // Obuna bo'lgan bo'lsa asosiy menuni ko'rsatish
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
    // Xatolik bo'lsa ham oddiy xabar yuborish
    await bot.sendMessage(chatId, '👋 Salom! Bot ishga tushdi. /help yordam uchun.');
  }
});

// Text message handlers - Reply Keyboard tugmalari uchun
bot.onText(/🧪 Testni boshlash/, async (msg) => {
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId,
    '🧪 *Test bo\'limi*\n\n' +
    'Test uchun mini app ochilmoqda...',
    { parse_mode: 'Markdown' }
  );
  
  // Web app ochish
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
    '🗣️ *Speaking bo\'limi*\n\n' +
    'Gapirish mashqlari uchun mini app ochilmoqda...',
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
    '✍️ *Writing bo\'limi*\n\n' +
    'Yozish mashqlari uchun mini app ochilmoqda...',
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
    '📚 *Full Exam bo\'limi*\n\n' +
    'To\'liq imtihonlar uchun mini app ochilmoqda...',
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

bot.onText(/👨‍💻 Admin bilan bog\'lanish/, async (msg) => {
  const chatId = msg.chat.id;
  
  const adminInfo = `👨‍💻 *Admin ma\'lumotlari*\n\n` +
    `👤 *Ism familiya:* Akobir Norqulov\n` +
    `📱 *Telefon raqami:* +998 88 128 33 43\n` +
    `🔗 *Telegram username:* @developerslar\n\n` +
    `📞 *Admin bilan bog\'lanish uchun:* [Telegram orqali yozish](https://t.me/developerslar)`;
  
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
  
  const shareText = `🎯 Ajoyib imkoniyat! Ushbu bot orqali:\n\n🧪 Testni boshlash\n🗣️ Speaking\n✍️ Writing\n📚 Full Exam\n👨‍💻 Admin bilan bog'lanish\n\nBotdan foydalanish uchun: ${BOT_USERNAME}`;
  
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
  
  const helpText = `🤖 *Bot haqida ma\'lumot*\n\n` +
    `Bu bot sizga quyidagi imkoniyatlarni beradi:\n\n` +
    `🧪 *Testni boshlash* - Testlar yechish\n` +
    `🗣️ *Speaking* - Gapirish mashqlari\n` +
    `✍️ *Writing* - Yozish mashqlari\n` +
    `📚 *Full Exam* - To\'liq imtihonlar\n` +
    `👨‍💻 *Admin* - Admin bilan bog\'lanish\n` +
    `🔗 *Ulashish* - Dostlarga ulashish\n\n` +
    `Botdan foydalanish uchun pastdagi tugmalardan foydalaning!`;
  
  await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// Callback query lar - agar kerak bo'lsa saqlanadi
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  bot.answerCallbackQuery(callbackQuery.id);
  
  if (data === 'share_friends') {
    await handleShare(chatId);
  }
});

// Help komandasi
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

console.log('Bot ishga tushdi...');
