'use strict';

require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const express    = require('express');
const fs         = require('fs');

// ─── Environment variables ─────────────────────────────────────────────────────

const {
    BOT_TOKEN:        TOKEN,
    WEBHOOK_URL:      BASE_URL,
    CHANNEL_USERNAME,
    PORT:             ENV_PORT,
    TEST_APP_URL      = 'https://test.com',
    WRITINGLAP_URL    = 'https://writinglap.com',
    SPEAKLAP_URL      = 'https://speaklap.com',
    ADMIN_NAME        = 'Admin',
    ADMIN_PHONE       = '+998000000000',
    ADMIN_TELEGRAM    = 'https://t.me/admin',
} = process.env;

// If WEBHOOK_URL already contains /webhook, use it directly
// Otherwise, construct the full webhook URL
const WEBHOOK_PATH = `/webhook/${TOKEN}`;
const WEBHOOK_FULL_URL = BASE_URL.includes('/webhook') ? BASE_URL : `${BASE_URL}${WEBHOOK_PATH}`;

const PORT = ENV_PORT || 3000;

const ADMIN_INFO = {
    name:     ADMIN_NAME,
    phone:    ADMIN_PHONE,
    telegram: ADMIN_TELEGRAM,
};

// ─── Startup validation ────────────────────────────────────────────────────────

if (!TOKEN) {
    console.error('❌ BOT_TOKEN topilmadi!');
    process.exit(1);
}
if (!BASE_URL) {
    console.error('❌ BASE_URL topilmadi!');
    process.exit(1);
}
if (!CHANNEL_USERNAME) {
    console.error('❌ CHANNEL_USERNAME topilmadi!');
    process.exit(1);
}

// ─── Bot instance (webhook mode — polling: false) ──────────────────────

const bot = new TelegramBot(TOKEN, { polling: false });

// ─── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Telegram sends all updates to this endpoint
app.post(WEBHOOK_PATH, (req, res) => {
    if (!req.body) return res.sendStatus(400);
    try {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    } catch (err) {
        console.error('processUpdate xatolik:', err.message);
        res.sendStatus(500);
    }
});

// Health check — required by Render and uptime monitors
app.get('/health', (_req, res) => {
    res.status(200).json({
        status:    'OK',
        mode:      'webhook',
        timestamp: new Date().toISOString(),
    });
});

app.get('/', (_req, res) => res.redirect('/health'));

// ─── Start server FIRST, then register webhook ────────────────────────────────

app.listen(PORT, async () => {
    console.log(`🚀 Server ishga tushdi — port ${PORT}`);
    console.log(`📺 Kanal: ${CHANNEL_USERNAME}`);
    console.log(`👨‍💻 Admin: ${ADMIN_INFO.name}`);
    console.log(`🔗 Webhook URL: ${WEBHOOK_FULL_URL}`);

    try {
        // Remove any old webhook (avoids 409 Conflict)
        await bot.deleteWebHook();

        const ok = await bot.setWebHook(WEBHOOK_FULL_URL, {
            allowed_updates: ['message', 'callback_query', 'inline_query'],
        });

        // Token is intentionally NOT logged
        console.log(ok ? '✅ Webhook muvaffaqiyatli oʻrnatildi' : '❌ Webhook oʻrnatishda noma\'lum xatolik');
    } catch (err) {
        console.error('❌ Webhook oʻrnatishda xatolik:', err.message);
        console.error('❌ Full error:', err);
    }
});

// ─── Referral system ───────────────────────────────────────────────────────────

const REFERRAL_FILE = './referrals.json';

function loadReferrals() {
    try {
        if (fs.existsSync(REFERRAL_FILE)) {
            return JSON.parse(fs.readFileSync(REFERRAL_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('Referrallarni oʻqishda xatolik:', err.message);
    }
    return {};
}

function saveReferrals(data) {
    try {
        fs.writeFileSync(REFERRAL_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Referrallarni saqlashda xatolik:', err.message);
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
        const all  = loadReferrals();
        const list = all[userId] || [];
        let valid  = 0;
        for (const uid of list) {
            try {
                const m = await bot.getChatMember(CHANNEL_USERNAME, uid);
                if (['member', 'administrator', 'creator'].includes(m.status)) valid++;
            } catch (_) { /* user left or blocked */ }
        }
        return valid;
    } catch (err) {
        console.error('Referral soni xatolik:', err.message);
        return 0;
    }
}

async function checkInvitationRequirement(userId) {
    return (await getUserReferralCount(userId)) >= 7;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function checkSubscription(userId) {
    try {
        const m = await bot.getChatMember(CHANNEL_USERNAME, userId);
        return ['member', 'administrator', 'creator'].includes(m.status);
    } catch (err) {
        const code = err.response?.body?.error_code;
        if (code === 400) console.log(`⚠️ Foydalanuvchi ${userId} kanalda emas`);
        else if (code === 403) console.log('🚫 Bot kanalga kira olmaydi');
        else console.error('Obuna tekshirishda xatolik:', err.message);
        return false;
    }
}

// Escape all MarkdownV2 special characters — keeps dynamic data safe
function esc(text) {
    return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function errCode(err) {
    return err.response?.body?.error_code;
}

// ─── UI helpers ────────────────────────────────────────────────────────────────

async function sendSubscriptionMessage(chatId) {
    try {
        await bot.sendMessage(
            chatId,
            `👋 Assalomu alaykum\\!\n\n` +
            `Botdan to'liq foydalanish uchun quyidagi kanalga obuna bo'lishingiz shart:\n\n` +
            `📺 *${esc(CHANNEL_USERNAME)}*\n\n` +
            `Obuna bo'lgach, "Obunani tekshirish" tugmasini bosing\\!`,
            {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: '📺 Kanalga obuna bo\'lish',
                            url:  `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`,
                        },
                        {
                            text:          '✅ Obunani tekshirish',
                            callback_data: 'check_subscription',
                        },
                    ]],
                },
            }
        );
    } catch (err) {
        if (errCode(err) === 403) console.log(`🚫 ${chatId} botni bloklagan`);
        else console.error('sendSubscriptionMessage xatolik:', err.message);
    }
}

async function sendMainMenu(chatId) {
    try {
        const [hasEnough, referralCount, botInfo] = await Promise.all([
            checkInvitationRequirement(chatId),
            getUserReferralCount(chatId),
            bot.getMe(),
        ]);

        const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;
        const remaining    = Math.max(0, 7 - referralCount);

        // Each button can only have ONE action: web_app OR callback_data, never both
        const writinglapBtn = hasEnough
            ? { text: '✍️ Writinglap',    web_app: { url: WRITINGLAP_URL } }
            : { text: '✍️ Writinglap 🔒', callback_data: 'writinglap_status' };

        const speaklapBtn = hasEnough
            ? { text: '🎤 Speaklap',    web_app: { url: SPEAKLAP_URL } }
            : { text: '🎤 Speaklap 🔒', callback_data: 'speaklap_status' };

        const menuText = hasEnough
            ? `🎉 Tabriklayman\\! Barcha imkoniyatlar ochiq:\n\n` +
              `📝 *Testni topshirish* — mini\\-ilovani ochish\n` +
              `✍️ *Writinglap* — yozish mahoratini oshirish\n` +
              `🎤 *Speaklap* — speaking mahoratini oshirish\n` +
              `👨‍💻 *Admin bilan bog'lanish*\n\n` +
              `📊 *Takliflaringiz:* ${esc(referralCount)}/7 ✅\n` +
              `🔗 *Referral link:* ${esc(referralLink)}`
            : `👋 Xush kelibsiz\\!\n\n` +
              `📝 *Testni topshirish* — bepul\n` +
              `✍️ *Writinglap* — ${esc(remaining)} ta taklif qoldi 🔒\n` +
              `🎤 *Speaklap* — ${esc(remaining)} ta taklif qoldi 🔒\n\n` +
              `📊 *Takliflaringiz:* ${esc(referralCount)}/7\n` +
              `🔒 Ochish uchun *${esc(CHANNEL_USERNAME)}* kanaliga 7 ta inson taklif qiling\\!\n\n` +
              `🔗 *Referral link:* ${esc(referralLink)}`;

        await bot.sendMessage(chatId, menuText, {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📝 Testni topshirish', web_app: { url: TEST_APP_URL } }],
                    [{ text: '🔗 Dostlarga ulashish', callback_data: 'share_bot' }],
                    [writinglapBtn],
                    [speaklapBtn],
                    [{ text: '👨‍💻 Admin bilan bog\'lanish', callback_data: 'contact_admin' }],
                ],
            },
        });
    } catch (err) {
        if (errCode(err) === 403) console.log(`🚫 ${chatId} botni bloklagan`);
        else console.error('sendMainMenu xatolik:', err.message);
    }
}

// ─── /help ─────────────────────────────────────────────────────────────────────

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        await bot.sendMessage(
            chatId,
            `🤖 *Bot haqida yordam*\n\n` +
            `📝 *Testni topshirish* — CEFR imtihonini topshirish\n` +
            `✍️ *Writinglap* — yozish \\(7 ta taklif kerak\\)\n` +
            `🎤 *Speaklap* — speaking \\(7 ta taklif kerak\\)\n` +
            `👨‍💻 *Admin bilan bog'lanish*\n\n` +
            `📺 Botdan foydalanish uchun ${esc(CHANNEL_USERNAME)} kanaliga obuna bo'ling\\.\n\n` +
            `🔗 Boshlash: /start`,
            {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🚀 Boshlash',  callback_data: 'start_menu'    },
                        { text: '📞 Admin',     callback_data: 'contact_admin' },
                    ]],
                },
            }
        );
    } catch (err) {
        console.error('/help xatolik:', err.message);
    }
});

// ─── /start ────────────────────────────────────────────────────────────────────

bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId     = msg.chat.id;
    const userId     = msg.from.id;
    const referrerId = match[1]?.trim() || null;

    const isSubscribed = await checkSubscription(userId);
    if (!isSubscribed) {
        await sendSubscriptionMessage(chatId);
        return;
    }

    if (referrerId && referrerId !== String(userId)) {
        const isNew = addReferral(referrerId, String(userId));
        if (isNew) {
            try {
                const count = await getUserReferralCount(referrerId);
                await bot.sendMessage(
                    referrerId,
                    `🎉 Yangi taklif\\!\n\n` +
                    `Referral linkingiz orqali yangi foydalanuvchi qoʻshildi\\!\n\n` +
                    `📊 Takliflaringiz: *${esc(count)}/7*\n` +
                    `🎯 Qolgan: *${esc(Math.max(0, 7 - count))} ta*\n\n` +
                    `${count >= 7
                        ? '🎉 Barcha mini\\-applar ochilgan\\!'
                        : `🔒 Yana ${esc(7 - count)} ta inson taklif qiling\\.`}`,
                    {
                        parse_mode: 'MarkdownV2',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📊 Statusni tekshirish', callback_data: 'check_status' },
                            ]],
                        },
                    }
                );
            } catch (_) { /* referrer may have blocked bot */ }
        }
    }

    await sendMainMenu(chatId);
});

// ─── Callback queries ──────────────────────────────────────────────────────────

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data   = query.data;

    await bot.answerCallbackQuery(query.id).catch(() => {});

    try {
        switch (data) {

            case 'check_subscription': {
                const ok = await checkSubscription(userId);
                if (ok) {
                    await bot.sendMessage(chatId, '✅ Obuna tasdiqlandi\\! Botdan foydalanishingiz mumkin\\.', { parse_mode: 'MarkdownV2' });
                    await sendMainMenu(chatId);
                } else {
                    await bot.sendMessage(chatId, '❌ Siz hali kanalga obuna boʻlmagansiz\\. Iltimos, avval obuna boʻling\\.', { parse_mode: 'MarkdownV2' });
                }
                break;
            }

            case 'start_menu': {
                const ok = await checkSubscription(userId);
                if (ok) await sendMainMenu(chatId);
                else     await sendSubscriptionMessage(chatId);
                break;
            }

            case 'share_bot': {
                const botInfo      = await bot.getMe();
                const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;
                const shareText    =
                    `🤖 Qiziqarli botni topdim! CEFR imtihonini topshirish, ` +
                    `Writinglap va Speaklap uchun ajoyib bot.\n\n👉 ${referralLink}`;

                // No parse_mode — URLs can contain underscores that break Markdown
                await bot.sendMessage(
                    chatId,
                    `🔗 Referral linkingiz:\n${referralLink}\n\n` +
                    `Ushbu linkni do'stlaringizga yuboring. Ular kanalga obuna bo'lganida sizga hisoblanadi!`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📱 Do\'stlarga yuborish', switch_inline_query: shareText },
                            ]],
                        },
                    }
                );
                break;
            }

            case 'writinglap_status': {
                const count   = await getUserReferralCount(chatId);
                const botInfo = await bot.getMe();
                const refLink = `https://t.me/${botInfo.username}?start=${chatId}`;

                if (count >= 7) {
                    await bot.sendMessage(
                        chatId,
                        `✍️ *Writinglap - Yozish mahoratini oshiring!*\n\n` +
                        `🎯 *Nima uchun Writinglap?*\n` +
                        `📝 Turli mavzularda insholar yozish\n` +
                        `🔤 Grammatik xatolarni tuzatish\n` +
                        `📈 Yozish ko'nikmalarini rivojlantirish\n` +
                        `🏆 CEFR darajasiga mos mashqlar\n\n` +
                        `🚀 *Hoziroq boshlang va ingliz tili yozish mahoratingizni oshiring!*`,
                        {
                            parse_mode: 'MarkdownV2',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '✍️ Writinglapni ochish', web_app: { url: WRITINGLAP_URL } },
                                        { text: '📱 Dostlarga ulashish', callback_data: 'share_writinglap' }
                                    ],
                                    [
                                        { text: '🔙 Orqaga', callback_data: 'start_menu' }
                                    ]
                                ]
                            }
                        }
                    );
                } else {
                    await bot.sendMessage(
                        chatId,
                        `✍️ *Writinglap - Yozish mahoratini oshiring!*\n\n` +
                        `🎯 *Nima uchun Writinglap?*\n` +
                        `📝 Turli mavzularda insholar yozish\n` +
                        `🔤 Grammatik xatolarni tuzatish\n` +
                        `📈 Yozish ko'nikmalarini rivojlantirish\n` +
                        `🏆 CEFR darajasiga mos mashqlar\n\n` +
                        `🔒 *Qulflangan*\\!\n\n` +
                        `📊 *Takliflaringiz:* ${esc(count)}/7\n` +
                        `🎯 *Qolgan:* ${esc(7 - count)} ta taklif\n\n` +
                        `🔗 *Referral link:* ${esc(refLink)}\\.\n\n` +
                        `📱 Do'stlaringizga ulashing va Writinglapni oching!`,
                        {
                            parse_mode: 'MarkdownV2',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '📱 Dostlarga ulashish', callback_data: 'share_writinglap' },
                                        { text: '🔄 Statusni tekshirish', callback_data: 'writinglap_status' }
                                    ],
                                    [
                                        { text: '🔙 Orqaga', callback_data: 'start_menu' }
                                    ]
                                ]
                            }
                        }
                    );
                }
                break;
            }

            case 'speaklap_status': {
                const count   = await getUserReferralCount(chatId);
                const botInfo = await bot.getMe();
                const refLink = `https://t.me/${botInfo.username}?start=${chatId}`;

                if (count >= 7) {
                    await bot.sendMessage(
                        chatId,
                        `🎤 *Speaklap - Speaking mahoratini oshiring!*\n\n` +
                        `🎯 *Nima uchun Speaklap?*\n` +
                        `🗣️ Onli nutq mashqlari\n` +
                        `🎧 Tinglash va tushunish ko'nikmalari\n` +
                        `📢 To'g'ri talaffuz o'rganish\n` +
                        `🏆 CEFR darajasiga mos suhbatlar\n` +
                        `🤖 AI bilan suhbat qilish imkoniyati\n\n` +
                        `🚀 *Hoziroq boshlang va ingliz tili speaking mahoratingizni oshiring!*`,
                        {
                            parse_mode: 'MarkdownV2',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '🎤 Speaklapni ochish', web_app: { url: SPEAKLAP_URL } },
                                        { text: '📱 Dostlarga ulashish', callback_data: 'share_speaklap' }
                                    ],
                                    [
                                        { text: '🔙 Orqaga', callback_data: 'start_menu' }
                                    ]
                                ]
                            }
                        }
                    );
                } else {
                    await bot.sendMessage(
                        chatId,
                        `🎤 *Speaklap - Speaking mahoratini oshiring!*\n\n` +
                        `🎯 *Nima uchun Speaklap?*\n` +
                        `🗣️ Onli nutq mashqlari\n` +
                        `🎧 Tinglash va tushunish ko'nikmalari\n` +
                        `📢 To'g'ri talaffuz o'rganish\n` +
                        `🏆 CEFR darajasiga mos suhbatlar\n` +
                        `🤖 AI bilan suhbat qilish imkoniyati\n\n` +
                        `🔒 *Qulflangan*\\!\n\n` +
                        `📊 *Takliflaringiz:* ${esc(count)}/7\n` +
                        `🎯 *Qolgan:* ${esc(7 - count)} ta taklif\n\n` +
                        `🔗 *Referral link:* ${esc(refLink)}\\.\n\n` +
                        `📱 Do'stlaringizga ulashing va Speaklapni oching!`,
                        {
                            parse_mode: 'MarkdownV2',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '� Dostlarga ulashish', callback_data: 'share_speaklap' },
                                        { text: '�🔄 Statusni tekshirish', callback_data: 'speaklap_status' }
                                    ],
                                    [
                                        { text: '🔙 Orqaga', callback_data: 'start_menu' }
                                    ]
                                ]
                            }
                        }
                    );
                }
                break;
            }

            case 'share_writinglap': {
                const botInfo      = await bot.getMe();
                const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;
                const shareText    =
                    `✍️ Writinglap - yozish mahoratini oshirish uchun ajoyib imkoniyat!\n` +
                    `📝 Insholar yozish, grammatikani tuzatish, CEFR mashqlari\n` +
                    `🚀 Hoziroq boshlang!\n\n👉 ${referralLink}`;

                await bot.sendMessage(
                    chatId,
                    `✍️ *Writinglapni do'stlaringizga ulashing!*\n\n` +
                    `📱 *Ulashish matni:*\n${shareText}\n\n` +
                    `🎯 *Do'stlaringiz ham yozish mahoratini oshirsin!*`,
                    {
                        parse_mode: 'MarkdownV2',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '📱 Do\'stlarga yuborish', switch_inline_query: shareText },
                                    { text: '🔙 Orqaga', callback_data: 'writinglap_status' }
                                ]
                            ]
                        }
                    }
                );
                break;
            }

            case 'share_speaklap': {
                const botInfo      = await bot.getMe();
                const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;
                const shareText    =
                    `🎤 Speaklap - speaking mahoratini oshirish uchun ajoyib imkoniyat!\n` +
                    `🗣️ Onli nutq mashqlari, to'g'ri talaffuz, AI bilan suhbat\n` +
                    `🚀 Hoziroq boshlang!\n\n👉 ${referralLink}`;

                await bot.sendMessage(
                    chatId,
                    `🎤 *Speaklapni do'stlaringizga ulashing!*\n\n` +
                    `📱 *Ulashish matni:*\n${shareText}\n\n` +
                    `🎯 *Do'stlaringiz ham speaking mahoratini oshirsin!*`,
                    {
                        parse_mode: 'MarkdownV2',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '📱 Do\'stlarga yuborish', switch_inline_query: shareText },
                                    { text: '🔙 Orqaga', callback_data: 'speaklap_status' }
                                ]
                            ]
                        }
                    }
                );
                break;
            }

            case 'check_status': {
                const hasEnough = await checkInvitationRequirement(chatId);
                if (hasEnough) {
                    await bot.sendMessage(
                        chatId,
                        `✅ Tabriklayman\\! Barcha xususiyatlar ochiq:\n\n✍️ Writinglap\n🎤 Speaklap`,
                        { parse_mode: 'MarkdownV2' }
                    );
                    await sendMainMenu(chatId);
                } else {
                    const count = await getUserReferralCount(chatId);
                    await bot.sendMessage(
                        chatId,
                        `⏳ Hali tayyor emas\n\nTakliflaringiz: ${count}/7\nQolgan: ${7 - count} ta\n\nDo'stlaringizga kanalning foydaliligini tushuntiring!`,
                        {
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '🔗 Do\'stlarga ulashish', callback_data: 'share_bot' },
                                ]],
                            },
                        }
                    );
                }
                break;
            }

            case 'contact_admin': {
                // No parse_mode — admin data may contain special chars
                await bot.sendMessage(
                    chatId,
                    `👨‍💻 Admin ma'lumotlari:\n\n` +
                    `👤 Ism: ${ADMIN_INFO.name}\n` +
                    `📞 Telefon: ${ADMIN_INFO.phone}\n` +
                    `📱 Telegram: ${ADMIN_INFO.telegram}`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📱 Telegram\'da yozish', url: ADMIN_INFO.telegram },
                            ]],
                        },
                    }
                );
                break;
            }

            default:
                console.log(`Noma'lum callback: ${data}`);
        }
    } catch (err) {
        if (errCode(err) === 403) console.log(`🚫 ${chatId} botni bloklagan`);
        else console.error(`callback_query [${data}] xatolik:`, err.message);
    }
});

// ─── Inline query ──────────────────────────────────────────────────────────────

bot.on('inline_query', async (query) => {
    try {
        const botInfo   = await bot.getMe();
        const shareText =
            `🤖 Qiziqarli botni topdim! CEFR imtihoni, Writinglap va Speaklap uchun ajoyib bot.\n\n` +
            `👉 https://t.me/${botInfo.username}`;

        await bot.answerInlineQuery(
            query.id,
            [{
                type:        'article',
                id:          'share_bot',
                title:       '🤖 Botni ulashish',
                description: 'Test topshirish va o\'rganish uchun ajoyib bot',
                input_message_content: { message_text: shareText },
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🚀 Botni ochish', url: `https://t.me/${botInfo.username}` },
                        { text: '📞 Admin',        url: ADMIN_INFO.telegram },
                    ]],
                },
            }],
            { cache_time: 0 }
        );
    } catch (err) {
        console.error('inline_query xatolik:', err.message);
    }
});

// ─── Global error handler ──────────────────────────────────────────────────────

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});