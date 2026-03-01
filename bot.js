'use strict';

require('dotenv').config();

const TelegramBot  = require('node-telegram-bot-api');
const express      = require('express');
const fs           = require('fs');

// ─── Env ──────────────────────────────────────────────────────────────────────

const TOKEN            = process.env.BOT_TOKEN;
const BASE_URL         = process.env.BASE_URL;          // faqat production'da kerak
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;
const PORT             = process.env.PORT || 3000;
const IS_PROD          = process.env.NODE_ENV === 'production';

const TEST_APP_URL   = process.env.TEST_APP_URL   || 'https://test.com';
const WRITINGLAP_URL = process.env.WRITINGLAP_URL || 'https://writinglap.com';
const SPEAKLAP_URL   = process.env.SPEAKLAP_URL   || 'https://speaklap.com';

const ADMIN = {
    name:     process.env.ADMIN_NAME     || 'Admin',
    phone:    process.env.ADMIN_PHONE    || '+998000000000',
    telegram: process.env.ADMIN_TELEGRAM || 'https://t.me/admin',
};

// ─── Validation ───────────────────────────────────────────────────────────────

if (!TOKEN) {
    console.error('❌ BOT_TOKEN topilmadi!');
    process.exit(1);
}
if (!CHANNEL_USERNAME) {
    console.error('❌ CHANNEL_USERNAME topilmadi!');
    process.exit(1);
}
if (IS_PROD && !BASE_URL) {
    console.error('❌ Production modeda BASE_URL topilmadi!');
    process.exit(1);
}

// ─── Bot instance ─────────────────────────────────────────────────────────────
//
//   LOCAL  (NODE_ENV != production) → polling: true
//   RENDER (NODE_ENV = production)  → polling: false + webhook
//
const bot = IS_PROD
    ? new TelegramBot(TOKEN, { polling: false })
    : new TelegramBot(TOKEN, { polling: true });

// ─── Express (har doim ishga tushadi — Render port talab qiladi) ──────────────

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'OK',
        mode:   IS_PROD ? 'webhook' : 'polling',
        ts:     new Date().toISOString(),
    });
});

app.get('/', (_req, res) => res.redirect('/health'));

// ─── Webhook endpoint (faqat production) ─────────────────────────────────────

const WEBHOOK_PATH = IS_PROD ? `/webhook/${TOKEN}` : null;

if (IS_PROD) {
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
}

// ─── Server start ─────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
    console.log(`\n🤖 Bot ishga tushdi`);
    console.log(`📌 Rejim: ${IS_PROD ? '🌐 Webhook (Production)' : '🔄 Polling (Local)'}`);
    console.log(`🚀 Server port: ${PORT}`);
    console.log(`📺 Kanal: ${CHANNEL_USERNAME}`);
    console.log(`👨‍💻 Admin: ${ADMIN.name}\n`);

    if (IS_PROD) {
        const WEBHOOK_URL = `${BASE_URL.replace(/\/$/, '')}${WEBHOOK_PATH}`;
        try {
            await bot.deleteWebHook();
            const ok = await bot.setWebHook(WEBHOOK_URL, {
                allowed_updates: ['message', 'callback_query', 'inline_query'],
            });
            // Token loglarga chiqmaydi — faqat BASE_URL loglanadi
            console.log(`🌐 Base URL: ${BASE_URL}`);
            console.log(ok ? '✅ Webhook oʻrnatildi\n' : '❌ Webhook oʻrnatilmadi\n');
        } catch (err) {
            console.error('❌ setWebHook xatolik:', err.message);
        }
    } else {
        // Local — eski webhook'ni o'chiramiz (oldin deploy qilingan bo'lsa conflict bo'lmasin)
        try {
            await bot.deleteWebHook();
            console.log('🔄 Polling rejimida ishlayapti...\n');
        } catch (_) {}
    }
});

// ─── Polling errors (faqat local) ────────────────────────────────────────────

if (!IS_PROD) {
    bot.on('polling_error', (err) => {
        console.error('Polling xatolik:', err.message);
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// UTIL
// ═════════════════════════════════════════════════════════════════════════════

// MarkdownV2 uchun barcha maxsus belgilarni escape qiladi
function esc(text) {
    return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function getErrCode(err) {
    return err?.response?.body?.error_code;
}

// ═════════════════════════════════════════════════════════════════════════════
// REFERRAL
// ═════════════════════════════════════════════════════════════════════════════

const REFERRAL_FILE = './referrals.json';

function loadRefs() {
    try {
        if (fs.existsSync(REFERRAL_FILE))
            return JSON.parse(fs.readFileSync(REFERRAL_FILE, 'utf8'));
    } catch (e) { console.error('Referral read:', e.message); }
    return {};
}

function saveRefs(data) {
    try { fs.writeFileSync(REFERRAL_FILE, JSON.stringify(data, null, 2)); }
    catch (e) { console.error('Referral save:', e.message); }
}

function addReferral(referrerId, referredId) {
    const refs = loadRefs();
    if (!refs[referrerId]) refs[referrerId] = [];
    if (!refs[referrerId].includes(referredId)) {
        refs[referrerId].push(referredId);
        saveRefs(refs);
        return true;
    }
    return false;
}

async function getReferralCount(userId) {
    try {
        const list = loadRefs()[userId] || [];
        let valid  = 0;
        for (const uid of list) {
            try {
                const m = await bot.getChatMember(CHANNEL_USERNAME, uid);
                if (['member', 'administrator', 'creator'].includes(m.status)) valid++;
            } catch (_) {}
        }
        return valid;
    } catch (e) {
        console.error('getReferralCount:', e.message);
        return 0;
    }
}

async function hasEnoughReferrals(userId) {
    return (await getReferralCount(userId)) >= 7;
}

// ═════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION
// ═════════════════════════════════════════════════════════════════════════════

async function isSubscribed(userId) {
    try {
        const m = await bot.getChatMember(CHANNEL_USERNAME, userId);
        return ['member', 'administrator', 'creator'].includes(m.status);
    } catch (err) {
        const code = getErrCode(err);
        if (code === 400) console.log(`⚠️ ${userId} kanalda emas`);
        else if (code === 403) console.log('🚫 Bot kanalga kira olmaydi');
        else console.error('isSubscribed xatolik:', err.message);
        return false;
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// UI
// ═════════════════════════════════════════════════════════════════════════════

async function sendSubRequired(chatId) {
    try {
        await bot.sendMessage(chatId,
            `👋 Assalomu alaykum\\!\n\n` +
            `Botdan foydalanish uchun kanalga obuna bo'lishingiz shart:\n\n` +
            `📺 *${esc(CHANNEL_USERNAME)}*\n\n` +
            `Obuna bo'lgach ✅ tugmasini bosing\\.`,
            {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '📺 Kanalga obuna bo\'lish', url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` },
                        { text: '✅ Tekshirish', callback_data: 'check_subscription' },
                    ]],
                },
            }
        );
    } catch (err) {
        if (getErrCode(err) !== 403) console.error('sendSubRequired:', err.message);
    }
}

async function sendMainMenu(chatId) {
    try {
        const [enough, count, info] = await Promise.all([
            hasEnoughReferrals(chatId),
            getReferralCount(chatId),
            bot.getMe(),
        ]);

        const refLink   = `https://t.me/${info.username}?start=${chatId}`;
        const remaining = Math.max(0, 7 - count);

        // Bir tugmada faqat BITTA action: web_app YOKI callback_data
        const writingBtn = enough
            ? { text: '✍️ Writinglap',    web_app: { url: WRITINGLAP_URL } }
            : { text: '✍️ Writinglap 🔒', callback_data: 'writinglap_status' };

        const speakBtn = enough
            ? { text: '🎤 Speaklap',    web_app: { url: SPEAKLAP_URL } }
            : { text: '🎤 Speaklap 🔒', callback_data: 'speaklap_status' };

        const text = enough
            ? `🎉 *Barcha imkoniyatlar ochiq\\!*\n\n` +
              `📝 Testni topshirish\n` +
              `✍️ Writinglap — yozish mahorati\n` +
              `🎤 Speaklap — speaking mahorati\n\n` +
              `📊 *Takliflaringiz:* ${esc(count)}/7 ✅\n` +
              `🔗 *Ref link:* ${esc(refLink)}`
            : `👋 *Xush kelibsiz\\!*\n\n` +
              `📝 Testni topshirish — bepul\n` +
              `✍️ Writinglap — ${esc(remaining)} ta taklif kerak 🔒\n` +
              `🎤 Speaklap — ${esc(remaining)} ta taklif kerak 🔒\n\n` +
              `📊 *Takliflaringiz:* ${esc(count)}/7\n` +
              `🔒 *${esc(CHANNEL_USERNAME)}* kanaliga *7 ta* inson taklif qiling\\!\n\n` +
              `🔗 *Ref link:* ${esc(refLink)}`;

        await bot.sendMessage(chatId, text, {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📝 Testni topshirish', web_app: { url: TEST_APP_URL } }],
                    [{ text: '🔗 Referral link olish', callback_data: 'share_bot' }],
                    [writingBtn],
                    [speakBtn],
                    [{ text: '👨‍💻 Admin', callback_data: 'contact_admin' }],
                ],
            },
        });
    } catch (err) {
        if (getErrCode(err) !== 403) console.error('sendMainMenu:', err.message);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// COMMANDS
// ═════════════════════════════════════════════════════════════════════════════

bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId     = msg.chat.id;
    const userId     = msg.from.id;
    const referrerId = match[1]?.trim() || null;

    const subbed = await isSubscribed(userId);
    if (!subbed) { await sendSubRequired(chatId); return; }

    if (referrerId && referrerId !== String(userId)) {
        const isNew = addReferral(referrerId, String(userId));
        if (isNew) {
            try {
                const c = await getReferralCount(referrerId);
                await bot.sendMessage(referrerId,
                    `🎉 *Yangi taklif\\!*\n\n` +
                    `Referral linkingiz orqali yangi foydalanuvchi qoʻshildi\\!\n\n` +
                    `📊 Takliflaringiz: *${esc(c)}/7*\n` +
                    `🎯 Qolgan: *${esc(Math.max(0, 7 - c))} ta*\n\n` +
                    (c >= 7
                        ? '🎉 Barcha mini\\-applar ochildi\\!'
                        : `🔒 Yana ${esc(7 - c)} ta taklif qiling\\.`),
                    {
                        parse_mode: 'MarkdownV2',
                        reply_markup: { inline_keyboard: [[
                            { text: '📊 Statusni tekshirish', callback_data: 'check_status' },
                        ]]},
                    }
                );
            } catch (_) {}
        }
    }

    await sendMainMenu(chatId);
});

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        await bot.sendMessage(chatId,
            `🤖 *Bot haqida*\n\n` +
            `📝 *Testni topshirish* — CEFR imtihoni\n` +
            `✍️ *Writinglap* — yozish \\(7 ta taklif\\)\n` +
            `🎤 *Speaklap* — speaking \\(7 ta taklif\\)\n` +
            `👨‍💻 *Admin* — yordam\n\n` +
            `📺 Kanal: ${esc(CHANNEL_USERNAME)}\n` +
            `▶️ /start`,
            {
                parse_mode: 'MarkdownV2',
                reply_markup: { inline_keyboard: [[
                    { text: '🚀 Boshlash', callback_data: 'start_menu' },
                    { text: '👨‍💻 Admin',  callback_data: 'contact_admin' },
                ]]},
            }
        );
    } catch (err) { console.error('/help:', err.message); }
});

// ═════════════════════════════════════════════════════════════════════════════
// CALLBACK QUERIES
// ═════════════════════════════════════════════════════════════════════════════

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data   = query.data;

    await bot.answerCallbackQuery(query.id).catch(() => {});

    try {
        switch (data) {

            case 'check_subscription': {
                const ok = await isSubscribed(userId);
                if (ok) {
                    await bot.sendMessage(chatId,
                        '✅ Obuna tasdiqlandi\\! Davom eting\\.',
                        { parse_mode: 'MarkdownV2' }
                    );
                    await sendMainMenu(chatId);
                } else {
                    await bot.sendMessage(chatId,
                        '❌ Hali obuna boʻlmagansiz\\. Avval obuna boʻling\\.',
                        { parse_mode: 'MarkdownV2' }
                    );
                }
                break;
            }

            case 'start_menu': {
                const ok = await isSubscribed(userId);
                if (ok) await sendMainMenu(chatId);
                else    await sendSubRequired(chatId);
                break;
            }

            case 'share_bot': {
                const info    = await bot.getMe();
                const refLink = `https://t.me/${info.username}?start=${chatId}`;
                const shareText =
                    `🤖 CEFR imtihonini topshirish, Writinglap va Speaklap uchun ajoyib bot!\n\n👉 ${refLink}`;

                // parse_mode YO'Q — URL ichidagi _ Markdown'ni buzadi
                await bot.sendMessage(chatId,
                    `🔗 Sizning referral linkingiz:\n\n${refLink}\n\n` +
                    `Ushbu linkni do'stlaringizga yuboring.\n` +
                    `Ular kanalga obuna bo'lganda sizga hisoblanadi!`,
                    {
                        reply_markup: { inline_keyboard: [[
                            { text: '📤 Do\'stlarga yuborish', switch_inline_query: shareText },
                            { text: '🔙 Orqaga', callback_data: 'start_menu' },
                        ]]},
                    }
                );
                break;
            }

            case 'writinglap_status': {
                const count   = await getReferralCount(chatId);
                const info    = await bot.getMe();
                const refLink = `https://t.me/${info.username}?start=${chatId}`;
                const enough  = count >= 7;

                const text = enough
                    ? `✍️ *Writinglap — Yozish mahorati\\!*\n\n` +
                      `📝 Turli mavzularda insholar\n` +
                      `🔤 Grammatik xatolarni tuzatish\n` +
                      `📈 CEFR darajasiga mos mashqlar\n\n` +
                      `🚀 *Hoziroq boshlang\\!*`
                    : `✍️ *Writinglap — Yozish mahorati\\!*\n\n` +
                      `📝 Turli mavzularda insholar\n` +
                      `🔤 Grammatik xatolarni tuzatish\n` +
                      `📈 CEFR darajasiga mos mashqlar\n\n` +
                      `🔒 *Qulflangan*\n\n` +
                      `📊 *Takliflaringiz:* ${esc(count)}/7\n` +
                      `🎯 *Qolgan:* ${esc(7 - count)} ta\n\n` +
                      `🔗 *Ref link:* ${esc(refLink)}`;

                const keyboard = enough
                    ? [[
                        { text: '✍️ Writinglapni ochish', web_app: { url: WRITINGLAP_URL } },
                        { text: '🔙 Orqaga', callback_data: 'start_menu' },
                      ]]
                    : [[
                        { text: '📤 Do\'stlarga ulashish', callback_data: 'share_bot' },
                        { text: '🔄 Tekshirish', callback_data: 'writinglap_status' },
                      ],[
                        { text: '🔙 Orqaga', callback_data: 'start_menu' },
                      ]];

                await bot.sendMessage(chatId, text, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: { inline_keyboard: keyboard },
                });
                break;
            }

            case 'speaklap_status': {
                const count   = await getReferralCount(chatId);
                const info    = await bot.getMe();
                const refLink = `https://t.me/${info.username}?start=${chatId}`;
                const enough  = count >= 7;

                const text = enough
                    ? `🎤 *Speaklap — Speaking mahorati\\!*\n\n` +
                      `🗣️ Onli nutq mashqlari\n` +
                      `🎧 Tinglash va tushunish\n` +
                      `📢 To'g'ri talaffuz\n` +
                      `🤖 AI bilan suhbat\n\n` +
                      `🚀 *Hoziroq boshlang\\!*`
                    : `🎤 *Speaklap — Speaking mahorati\\!*\n\n` +
                      `🗣️ Onli nutq mashqlari\n` +
                      `🎧 Tinglash va tushunish\n` +
                      `📢 To'g'ri talaffuz\n` +
                      `🤖 AI bilan suhbat\n\n` +
                      `🔒 *Qulflangan*\n\n` +
                      `📊 *Takliflaringiz:* ${esc(count)}/7\n` +
                      `🎯 *Qolgan:* ${esc(7 - count)} ta\n\n` +
                      `🔗 *Ref link:* ${esc(refLink)}`;

                const keyboard = enough
                    ? [[
                        { text: '🎤 Speaklapni ochish', web_app: { url: SPEAKLAP_URL } },
                        { text: '🔙 Orqaga', callback_data: 'start_menu' },
                      ]]
                    : [[
                        { text: '📤 Do\'stlarga ulashish', callback_data: 'share_bot' },
                        { text: '🔄 Tekshirish', callback_data: 'speaklap_status' },
                      ],[
                        { text: '🔙 Orqaga', callback_data: 'start_menu' },
                      ]];

                await bot.sendMessage(chatId, text, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: { inline_keyboard: keyboard },
                });
                break;
            }

            case 'check_status': {
                const enough = await hasEnoughReferrals(chatId);
                if (enough) {
                    await bot.sendMessage(chatId,
                        `✅ *Tabriklayman\\!* Barcha xususiyatlar ochiq:\n\n✍️ Writinglap\n🎤 Speaklap`,
                        { parse_mode: 'MarkdownV2' }
                    );
                    await sendMainMenu(chatId);
                } else {
                    const count = await getReferralCount(chatId);
                    await bot.sendMessage(chatId,
                        `⏳ Hali tayyor emas\n\n` +
                        `Takliflaringiz: ${count}/7\n` +
                        `Qolgan: ${7 - count} ta\n\n` +
                        `Do'stlaringizga linkni yuboring!`,
                        { reply_markup: { inline_keyboard: [[
                            { text: '🔗 Referral link', callback_data: 'share_bot' },
                            { text: '🔙 Orqaga', callback_data: 'start_menu' },
                        ]]}}
                    );
                }
                break;
            }

            case 'contact_admin': {
                // parse_mode YO'Q — telefon/telegram maxsus belgi bo'lishi mumkin
                await bot.sendMessage(chatId,
                    `👨‍💻 Admin ma'lumotlari:\n\n` +
                    `👤 Ism: ${ADMIN.name}\n` +
                    `📞 Telefon: ${ADMIN.phone}\n` +
                    `📱 Telegram: ${ADMIN.telegram}`,
                    { reply_markup: { inline_keyboard: [[
                        { text: '📱 Telegram\'da yozish', url: ADMIN.telegram },
                        { text: '🔙 Orqaga', callback_data: 'start_menu' },
                    ]]}}
                );
                break;
            }

            default:
                console.log(`Noma'lum callback: ${data}`);
        }
    } catch (err) {
        if (getErrCode(err) === 403) console.log(`🚫 ${chatId} botni bloklagan`);
        else console.error(`callback [${data}] xatolik:`, err.message);
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// INLINE QUERY
// ═════════════════════════════════════════════════════════════════════════════

bot.on('inline_query', async (query) => {
    try {
        const info = await bot.getMe();
        const text =
            `🤖 CEFR imtihonini topshirish, Writinglap va Speaklap uchun ajoyib bot!\n\n` +
            `👉 https://t.me/${info.username}`;

        await bot.answerInlineQuery(query.id, [{
            type:        'article',
            id:          'share_bot',
            title:       '🤖 Botni do\'stlarga ulashish',
            description: 'CEFR, Writinglap, Speaklap — hammasi bir joyda',
            input_message_content: { message_text: text },
            reply_markup: { inline_keyboard: [[
                { text: '🚀 Botni ochish', url: `https://t.me/${info.username}` },
                { text: '📞 Admin',        url: ADMIN.telegram },
            ]]},
        }], { cache_time: 0 });
    } catch (err) {
        console.error('inline_query:', err.message);
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLER
// ═════════════════════════════════════════════════════════════════════════════

process.on('unhandledRejection', (reason) => {
    console.error('UnhandledRejection:', reason);
});