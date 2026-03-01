require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

// Environment variables
const TOKEN = process.env.BOT_TOKEN;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Mini app URLs from environment
const TEST_APP_URL = process.env.TEST_APP_URL || 'https://test.com';
const WRITINGLAP_URL = process.env.WRITINGLAP_URL || 'https://writinglap.com';
const SPEAKLAP_URL = process.env.SPEAKLAP_URL || 'https://speaklap.com';

// Admin information from environment
const ADMIN_INFO = {
    name: process.env.ADMIN_NAME || 'Admin',
    phone: process.env.ADMIN_PHONE || '+998000000000',
    telegram: process.env.ADMIN_TELEGRAM || 'https://t.me/admin'
};

// Validate required environment variables
if (!TOKEN) {
    console.error('❌ BOT_TOKEN topilmadi! .env faylini tekshiring.');
    process.exit(1);
}

// Create Express app — ALWAYS start server (Render requires open port)
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'OK',
        mode: NODE_ENV === 'production' ? 'webhook' : 'polling',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        mode: NODE_ENV === 'production' ? 'webhook' : 'polling',
        timestamp: new Date().toISOString()
    });
});

// Always start listening so Render detects open port
app.listen(PORT, () => {
    console.log('🚀 Server ishga tushdi, port:', PORT);
    console.log(`📺 Majburiy kanal: ${CHANNEL_USERNAME}`);
    console.log(`👨‍💻 Admin: ${ADMIN_INFO.name}`);
});

// Create bot instance
let bot;
if (NODE_ENV === 'production') {
    // Webhook mode — delete old webhook first to avoid 409 conflict
    bot = new TelegramBot(TOKEN, { polling: false });

    bot.deleteWebHook().then(() => {
        return bot.setWebHook(`${WEBHOOK_URL}/webhook`);
    }).then(() => {
        console.log('✅ Webhook o\'rnatildi:', `${WEBHOOK_URL}/webhook`);
    }).catch(error => {
        console.error('❌ Webhook o\'rnatishda xatolik:', error.message);
    });

    // Webhook endpoint
    app.post('/webhook', (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });
} else {
    // Polling mode for local development
    bot = new TelegramBot(TOKEN, { polling: true });
    console.log('🤖 Bot polling mode da ishga tushdi!');

    bot.on('polling_error', (error) => {
        console.error('Polling error:', error.message);
    });
}

// ─── Referral system ───────────────────────────────────────────────────────────

const REFERRAL_FILE = './referrals.json';

function loadReferrals() {
    try {
        if (fs.existsSync(REFERRAL_FILE)) {
            return JSON.parse(fs.readFileSync(REFERRAL_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Referral faylini o\'qishda xatolik:', error);
    }
    return {};
}

function saveReferrals(data) {
    try {
        fs.writeFileSync(REFERRAL_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Referral faylini saqlashda xatolik:', error);
    }
}

function addReferral(referrerId, referredId) {
    const referrals = loadReferrals();
    if (!referrals[referrerId]) referrals[referrerId] = [];
    if (!referrals[referrerId].includes(referredId)) {
        referrals[referrerId].push(referredId);
        saveReferrals(referrals);
        return true;
    }
    return false;
}

async function getUserReferralCount(userId) {
    try {
        const referrals = loadReferrals();
        const userReferrals = referrals[userId] || [];
        let validReferrals = 0;
        for (const referredUserId of userReferrals) {
            try {
                const chatMember = await bot.getChatMember(CHANNEL_USERNAME, referredUserId);
                if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
                    validReferrals++;
                }
            } catch (_) { /* user left or blocked */ }
        }
        return validReferrals;
    } catch (error) {
        console.error('Referral count olishda xatolik:', error.message);
        return 0;
    }
}

async function checkInvitationRequirement(userId) {
    const count = await getUserReferralCount(userId);
    return count >= 7;
}

// ─── Subscription check ────────────────────────────────────────────────────────

async function checkSubscription(userId) {
    try {
        const chatMember = await bot.getChatMember(CHANNEL_USERNAME, userId);
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (error) {
        const code = error.response && error.response.body && error.response.body.error_code;
        if (code === 400) console.log(`⚠️ Foydalanuvchi ${userId} kanalda emas`);
        else if (code === 403) console.log(`🚫 Bot ${CHANNEL_USERNAME} kanaliga a'zo emas`);
        else console.error('Obunani tekshirishda xatolik:', error.message);
        return false;
    }
}

// ─── Messages ──────────────────────────────────────────────────────────────────

async function sendSubscriptionMessage(chatId) {
    try {
        await bot.sendMessage(chatId,
            `👋 Assalomu alaykum!\n\n` +
            `Botdan to'liq foydalanish uchun quyidagi kanalga obuna bo'lishingiz shart:\n\n` +
            `📺 *${CHANNEL_USERNAME}*\n\n` +
            `Obuna bo'lgach, "Obunani tekshirish" tugmasini bosing!`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: '📺 Kanalga obuna bo\'lish',
                            url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`
                        },
                        {
                            text: '✅ Obunani tekshirish',
                            callback_data: 'check_subscription'
                        }
                    ]]
                }
            }
        );
    } catch (error) {
        const code = error.response && error.response.body && error.response.body.error_code;
        if (code === 403) console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
        else console.error('Xatolik (sendSubscriptionMessage):', error.message);
    }
}

async function sendMainMenu(chatId) {
    try {
        const hasInvitedEnough = await checkInvitationRequirement(chatId);
        const referralCount = await getUserReferralCount(chatId);
        const botInfo = await bot.getMe();
        const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;

        // FIX: inline button cannot have both web_app and callback_data at the same time.
        // Locked buttons show only callback_data; unlocked show only web_app.
        const writinglapBtn = hasInvitedEnough
            ? { text: '✍️ Writinglap', web_app: { url: WRITINGLAP_URL } }
            : { text: '✍️ Writinglap 🔒', callback_data: 'writinglap_status' };

        const speaklapBtn = hasInvitedEnough
            ? { text: '🎤 Speaklap', web_app: { url: SPEAKLAP_URL } }
            : { text: '🎤 Speaklap 🔒', callback_data: 'speaklap_status' };

        // Escape function for MarkdownV2
        const esc = (text) => String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');

        const menuText = hasInvitedEnough
            ? `🎉 Tabriklayman\\! Endi botning barcha imkoniyatlaridan foydalanishingiz mumkin:\n\n` +
              `📝 *Testni topshirish* — Test topshirish uchun mini\\-ilovani ochish\n` +
              `✍️ *Writinglap* — Yozish mahoratini oshirish\n` +
              `🎤 *Speaklap* — Speaking mahoratini oshirish\n` +
              `👨‍💻 *Admin bilan boglanish* — Admin bilan boglanish\n\n` +
              `📊 *Sizning takliflaringiz:* ${esc(referralCount)}/7 ✅\n` +
              `🔗 *Referral linkingiz:*\n${esc(referralLink)}`
            : `👋 Xush kelibsiz\\!\n\n` +
              `📝 *Testni topshirish* — bepul foydalanish mumkin\n` +
              `✍️ *Writinglap* — 7 ta taklif kerak \\(${esc(7 - referralCount)} ta qoldi\\)\n` +
              `🎤 *Speaklap* — 7 ta taklif kerak \\(${esc(7 - referralCount)} ta qoldi\\)\n\n` +
              `📊 *Sizning takliflaringiz:* ${esc(referralCount)}/7\n\n` +
              `🔒 Writinglap va Speaklapni ochish uchun @studyneedfuture kanaliga *7 ta* inson taklif qiling\\!\n\n` +
              `🔗 *Sizning referral linkingiz:*\n${esc(referralLink)}`;

        await bot.sendMessage(chatId, menuText, {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📝 Testni topshirish', web_app: { url: TEST_APP_URL } }],
                    [{ text: '🔗 Dostlarga ulashish', callback_data: 'share_bot' }],
                    [writinglapBtn],
                    [speaklapBtn],
                    [{ text: '👨‍💻 Admin bilan bog\'lanish', callback_data: 'contact_admin' }]
                ]
            }
        });
    } catch (error) {
        const code = error.response && error.response.body && error.response.body.error_code;
        if (code === 403) console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
        else console.error('Xatolik (sendMainMenu):', error.message);
    }
}

// ─── Commands ──────────────────────────────────────────────────────────────────

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        await bot.sendMessage(chatId,
            `🤖 *Bot haqida yordam*\n\n` +
            `📋 *Asosiy funksiyalar:*\n\n` +
            `📝 *Testni topshirish* — CEFR imtihonini topshirish\n` +
            `🔗 *Dostlarga ulashish* — Botni do'stlaringizga ulashish\n` +
            `✍️ *Writinglap* — Yozish mahoratini oshirish (7 ta taklif)\n` +
            `🎤 *Speaklap* — Speaking mahoratini oshirish (7 ta taklif)\n` +
            `👨‍💻 *Admin bilan bog'lanish* — Admin bilan bog'lanish\n\n` +
            `📺 *Majburiy talab:*\n` +
            `Botdan foydalanish uchun @studyneedfuture kanaliga obuna bo'lish shart.\n\n` +
            `📞 *Yordam:* ${ADMIN_INFO.telegram}\n\n` +
            `🔗 Boshlash: /start`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🚀 Boshlash', callback_data: 'start_menu' },
                        { text: '📞 Admin', callback_data: 'contact_admin' }
                    ]]
                }
            }
        );
    } catch (error) {
        console.error('Xatolik (help):', error.message);
    }
});

bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const referrerId = match[1] ? match[1].trim() : null;

    const isSubscribed = await checkSubscription(userId);
    if (!isSubscribed) {
        await sendSubscriptionMessage(chatId);
        return;
    }

    // Handle referral
    if (referrerId && referrerId !== userId.toString()) {
        const isNewReferral = addReferral(referrerId, userId.toString());
        if (isNewReferral) {
            try {
                const referrerCount = await getUserReferralCount(referrerId);
                await bot.sendMessage(referrerId,
                    `🎉 *Yangi taklif!*\n\n` +
                    `Sizning referral linkingiz orqali yangi foydalanuvchi qo'shildi!\n\n` +
                    `📊 *Takliflaringiz:* ${referrerCount}/7\n` +
                    `🎯 *Qolgan:* ${Math.max(0, 7 - referrerCount)} ta\n\n` +
                    `${referrerCount >= 7 ? '🎉 Barcha mini-applar ochilgan!' : `🔒 Yana ${7 - referrerCount} ta inson taklif qiling.`}`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📊 Statusni tekshirish', callback_data: 'check_status' }
                            ]]
                        }
                    }
                );
            } catch (_) { /* referrer might have blocked bot */ }
        }
    }

    await sendMainMenu(chatId);
});

// ─── Callback queries ──────────────────────────────────────────────────────────

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

    try {
        if (data === 'check_subscription') {
            const isSubscribed = await checkSubscription(userId);
            if (isSubscribed) {
                await bot.sendMessage(chatId, '✅ Obuna tasdiqlandi! Botdan foydalanishingiz mumkin.');
                await sendMainMenu(chatId);
            } else {
                await bot.sendMessage(chatId, '❌ Siz hali kanalga obuna bo\'lmagansiz. Iltimos, avval obuna bo\'ling!');
            }

        } else if (data === 'start_menu') {
            const isSubscribed = await checkSubscription(userId);
            if (isSubscribed) await sendMainMenu(chatId);
            else await sendSubscriptionMessage(chatId);

        } else if (data === 'share_bot') {
            const botInfo = await bot.getMe();
            const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;
            const shareText = `🤖 Qiziqarli botni topdim! CEFR imtihonini topshirish, Writinglap va Speaklap uchun ajoyib bot.\n\n👉 ${referralLink}`;

            // No parse_mode here to avoid URL underscore issues
            await bot.sendMessage(chatId,
                `🔗 Referral linkingiz:\n${referralLink}\n\n` +
                `Ushbu linkni do'stlaringizga yuboring. Ular kanalga obuna bo'lganida sizga hisoblanadi!`,
                {
                    reply_markup: {
                        inline_keyboard: [[
                            {
                                text: '📱 Do\'stlarga yuborish',
                                switch_inline_query: shareText
                            }
                        ]]
                    }
                }
            );

        } else if (data === 'writinglap_status') {
            const referralCount = await getUserReferralCount(chatId);
            const botInfo = await bot.getMe();
            const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;

            if (referralCount >= 7) {
                await bot.sendMessage(chatId, '✅ Writinglap ochilgan!', {
                    reply_markup: {
                        inline_keyboard: [[{ text: '✍️ Writinglapni ochish', web_app: { url: WRITINGLAP_URL } }]]
                    }
                });
            } else {
                await bot.sendMessage(chatId,
                    `🔒 Writinglap qulfi\n\n` +
                    `7 ta inson taklif qilishingiz kerak.\n\n` +
                    `Takliflaringiz: ${referralCount}/7\n` +
                    `Qolgan: ${7 - referralCount} ta\n\n` +
                    `Referral linkingiz:\n${referralLink}`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔄 Statusni tekshirish', callback_data: 'writinglap_status' }
                            ]]
                        }
                    }
                );
            }

        } else if (data === 'speaklap_status') {
            const referralCount = await getUserReferralCount(chatId);
            const botInfo = await bot.getMe();
            const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;

            if (referralCount >= 7) {
                await bot.sendMessage(chatId, '✅ Speaklap ochilgan!', {
                    reply_markup: {
                        inline_keyboard: [[{ text: '🎤 Speaklapni ochish', web_app: { url: SPEAKLAP_URL } }]]
                    }
                });
            } else {
                await bot.sendMessage(chatId,
                    `🔒 Speaklap qulfi\n\n` +
                    `7 ta inson taklif qilishingiz kerak.\n\n` +
                    `Takliflaringiz: ${referralCount}/7\n` +
                    `Qolgan: ${7 - referralCount} ta\n\n` +
                    `Referral linkingiz:\n${referralLink}`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔄 Statusni tekshirish', callback_data: 'speaklap_status' }
                            ]]
                        }
                    }
                );
            }

        } else if (data === 'check_status') {
            const hasInvitedEnough = await checkInvitationRequirement(chatId);
            if (hasInvitedEnough) {
                await bot.sendMessage(chatId,
                    `✅ *Tabriklayman!* Barcha xususiyatlar ochiq:\n\n` +
                    `✍️ Writinglap\n🎤 Speaklap`,
                    { parse_mode: 'Markdown' }
                );
                await sendMainMenu(chatId);
            } else {
                const referralCount = await getUserReferralCount(chatId);
                await bot.sendMessage(chatId,
                    `⏳ *Hali tayyor emas*\n\n` +
                    `📊 Takliflaringiz: ${referralCount}/7\n` +
                    `🎯 Qolgan: ${7 - referralCount} ta\n\n` +
                    `💡 Do'stlaringizga kanalning foydaliligini tushuntiring!`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔗 Do\'stlarga ulashish', callback_data: 'share_bot' }
                            ]]
                        }
                    }
                );
            }

        } else if (data === 'contact_admin') {
            await bot.sendMessage(chatId,
                `👨‍💻 *Admin ma'lumotlari:*\n\n` +
                `👤 *Ism:* ${ADMIN_INFO.name}\n` +
                `📞 *Telefon:* ${ADMIN_INFO.phone}\n` +
                `📱 *Telegram:* ${ADMIN_INFO.telegram}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '📱 Telegram\'da yozish', url: ADMIN_INFO.telegram }
                        ]]
                    }
                }
            );
        }
    } catch (error) {
        const code = error.response && error.response.body && error.response.body.error_code;
        if (code === 403) console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
        else console.error(`Xatolik (${data}):`, error.message);
    }
});

// ─── Inline query ──────────────────────────────────────────────────────────────

bot.on('inline_query', async (query) => {
    try {
        const botInfo = await bot.getMe();
        const shareText = `🤖 Qiziqarli botni topdim! CEFR imtihoni, Writinglap va Speaklap uchun ajoyib bot.\n\n👉 https://t.me/${botInfo.username}`;

        await bot.answerInlineQuery(query.id, [
            {
                type: 'article',
                id: 'share_bot',
                title: '🤖 Botni ulashish',
                description: 'Test topshirish va o\'rganish uchun ajoyib bot',
                input_message_content: {
                    message_text: shareText
                },
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🚀 Botni ochish', url: `https://t.me/${botInfo.username}` },
                        { text: '📞 Admin', url: ADMIN_INFO.telegram }
                    ]]
                }
            }
        ], { cache_time: 0 });
    } catch (error) {
        console.error('Inline query xatolik:', error.message);
    }
});