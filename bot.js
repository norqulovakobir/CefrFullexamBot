require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');
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

// Create Express app for webhook
const app = express();

// Use webhook in production, polling in development
const bot = NODE_ENV === 'production' 
    ? new TelegramBot(TOKEN) 
    : new TelegramBot(TOKEN, { polling: true });

// Referral system
const REFERRAL_FILE = './referrals.json';

// Load referrals data
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

// Save referrals data
function saveReferrals(data) {
    try {
        fs.writeFileSync(REFERRAL_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Referral faylini saqlashda xatolik:', error);
    }
}

// Generate referral link
function generateReferralLink(userId) {
    return `https://t.me/${(bot.getMe()).then(bot => bot.username)}?start=${userId}`;
}

// Check if user has invited 5 people to the channel
async function checkInvitationRequirement(userId) {
    try {
        const referrals = loadReferrals();
        const userReferrals = referrals[userId] || [];
        
        // Check each referred user if they are actually subscribed to the channel
        let validReferrals = 0;
        for (const referredUserId of userReferrals) {
            try {
                const chatMember = await bot.getChatMember(CHANNEL_USERNAME, referredUserId);
                if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
                    validReferrals++;
                }
            } catch (error) {
                // User not in channel or blocked
            }
        }
        
        return validReferrals >= 7;
    } catch (error) {
        console.error('Invitation tekshirishda xatolik:', error.message);
        return false;
    }
}

// Get user referral count
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
            } catch (error) {
                // User not in channel or blocked
            }
        }
        
        return validReferrals;
    } catch (error) {
        console.error('Referral count olishda xatolik:', error.message);
        return 0;
    }
}

// Add referral
function addReferral(referrerId, referredId) {
    const referrals = loadReferrals();
    
    if (!referrals[referrerId]) {
        referrals[referrerId] = [];
    }
    
    if (!referrals[referrerId].includes(referredId)) {
        referrals[referrerId].push(referredId);
        saveReferrals(referrals);
        return true;
    }
    
    return false;
}

// Check if user is subscribed to channel
async function checkSubscription(userId) {
    try {
        const chatMember = await bot.getChatMember(CHANNEL_USERNAME, userId);
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (error) {
        if (error.response && error.response.body.error_code === 400) {
            console.log(`⚠️ Foydalanuvchi ${userId} kanalda a'zo emas yoki kanal topilmadi`);
        } else if (error.response && error.response.body.error_code === 403) {
            console.log(`🚫 Bot ${CHANNEL_USERNAME} kanaliga a'zo emas`);
        } else {
            console.error('Obunani tekshirishda xatolik:', error.message);
        }
        return false;
    }
}

// Send subscription message
async function sendSubscriptionMessage(chatId) {
    try {
        const keyboard = {
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
        };

        await bot.sendMessage(chatId, 
            `👋 Assalomu alaykum!\n\n` +
            `Botdan to'liq foydalanish uchun quyidagi kanalga obuna bo'lishingiz shart:\n\n` +
            `📺 *${CHANNEL_USERNAME}*\n\n` +
            `Obuna bo'lgach, "Obunani tekshirish" tugmasini bosing!`, 
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [
                        [
                            {
                                text: '📺 Kanalga obuna bo\'lish',
                                url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`
                            },
                            {
                                text: '✅ Obunani tekshirish',
                                callback_data: 'check_subscription'
                            }
                        ]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            }
        );
    } catch (error) {
        if (error.response && error.response.body.error_code === 403) {
            console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
        } else {
            console.error('Xatolik (sendSubscriptionMessage):', error.message);
        }
    }
}

// Send main menu
async function sendMainMenu(chatId) {
    try {
        // Check invitation requirement
        const hasInvitedEnough = await checkInvitationRequirement(chatId);
        const referralCount = await getUserReferralCount(chatId);
        const botInfo = await bot.getMe();
        const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;
        
        const keyboard = {
            inline_keyboard: [
                [
                    {
                        text: '📝 Testni topshirish',
                        web_app: { url: 'https://test.com' }
                    }
                ],
                [
                    {
                        text: '🔗 Dostlarga ulashish',
                        callback_data: 'share_bot'
                    }
                ],
                [
                    {
                        text: `✍️ Writinglap ${hasInvitedEnough ? '' : '🔒'}`,
                        web_app: hasInvitedEnough ? { url: WRITINGLAP_URL } : undefined,
                        callback_data: hasInvitedEnough ? undefined : 'writinglap_status'
                    }
                ],
                [
                    {
                        text: `🎤 Speaklap ${hasInvitedEnough ? '' : '🔒'}`,
                        web_app: hasInvitedEnough ? { url: SPEAKLAP_URL } : undefined,
                        callback_data: hasInvitedEnough ? undefined : 'speaklap_status'
                    }
                ],
                [
                    {
                        text: '👨‍💻 Admin bilan bog\'lanish',
                        callback_data: 'contact_admin'
                    }
                ]
            ]
        };

        const menuText = hasInvitedEnough 
            ? `🎉 Tabriklayman! Endi botning barcha imkoniyatlaridan foydalanishingiz mumkin:\n\n` +
              `📝 *Testni topshirish* - Test topshirish uchun mini-ilovani ochish\n` +
              `🔗 *Dostlarga ulashish* - Botni do'stlaringizga ulashish\n` +
              `🔗 *Referral link* - Do'stlaringizni taklif qiling\n` +
              `✍️ *Writinglap* - Yozish mahoratini oshirish\n` +
              `🎤 *Speaklap* - Speaking mahoratini oshirish\n` +
              `👨‍💻 *Admin bilan bog'lanish* - Admin bilan bog'lanish\n\n` +
              `📊 *Sizning takliflaringiz:* ${referralCount}/5 ✅`
            : `🎉 Tabriklayman! Endi botning barcha imkoniyatlaridan foydalanishingiz mumkin:\n\n` +
              `📝 *Testni topshirish* - Test topshirish uchun mini-ilovani ochish\n` +
              `🔗 *Dostlarga ulashish* - Botni do'stlaringizga ulashish\n` +
              `🔗 *Referral link* - Do'stlaringizni taklif qiling\n` +
              `✍️ *Writinglap* - Yozish mahoratini oshirish (${7 - referralCount} ta taklif kerak)\n` +
              `🎤 *Speaklap* - Speaking mahoratini oshirish (${7 - referralCount} ta taklif kerak)\n` +
              `👨‍💻 *Admin bilan bog'lanish* - Admin bilan bog'lanish\n\n` +
              `📊 *Sizning takliflaringiz:* ${referralCount}/7\n` +
              `🎯 *Qolgan:* ${7 - referralCount} ta\n\n` +
              `🔒 *Writinglap va Speaklapni ochish uchun @studyneedfuture kanaliga 7 ta inson taklif qiling!*`;

        await bot.sendMessage(chatId, menuText, 
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '📝 Testni topshirish',
                                web_app: { url: TEST_APP_URL }
                            }
                        ],
                        [
                            {
                                text: '🔗 Dostlarga ulashish',
                                callback_data: 'share_bot'
                            }
                        ],
                        [
                            {
                                text: `✍️ Writinglap ${hasInvitedEnough ? '' : '🔒'}`,
                                web_app: hasInvitedEnough ? { url: WRITINGLAP_URL } : undefined,
                                callback_data: hasInvitedEnough ? undefined : 'writinglap_status'
                            }
                        ],
                        [
                            {
                                text: `🎤 Speaklap ${hasInvitedEnough ? '' : '🔒'}`,
                                web_app: hasInvitedEnough ? { url: SPEAKLAP_URL } : undefined,
                                callback_data: hasInvitedEnough ? undefined : 'speaklap_status'
                            }
                        ],
                        [
                            {
                                text: '👨‍💻 Admin bilan bog\'lanish',
                                callback_data: 'contact_admin'
                            }
                        ]
                    ]
                }
            }
        );
    } catch (error) {
        if (error.response && error.response.body.error_code === 403) {
            console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
        } else {
            console.error('Xatolik (sendMainMenu):', error.message);
        }
    }
}

// Handle /help command
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const helpMessage = 
            `🤖 *Bot haqida yordam*\n\n` +
            `Bu bot CEFR imtihonini o'tkazish uchun ishlab chiqilgan. Botdan to'liq foydalanish uchun quyidagi qadamlarni bajaring:\n\n` +
            `📋 *Asosiy funksiyalar:*\n\n` +
            `📝 *Testni topshirish* - CEFR imtihonini topshirish uchun mini-ilovani ochish\n` +
            `🔗 *Dostlarga ulashish* - Botni do'stlaringizga ulashish\n` +
            `✍️ *Writinglap* - Yozish mahoratini oshirish (7 ta inson taklif qiling)\n` +
            `🎤 *Speaklap* - Speaking mahoratini oshirish (7 ta inson taklif qiling)\n` +
            `👨‍💻 *Admin bilan bog'lanish* - Admin bilan bog'lanish\n\n` +
            `📺 *Majburiy talab:*\n` +
            `Botdan foydalanish uchun @studyneedfuture kanaliga obuna bo'lish shart.\n\n` +
            `🎯 *Qo'shimcha imkoniyatlar:*\n` +
            `• Referral system - do'stlaringizni taklif qiling\n` +
            `• Mini-app lar - Writinglap va Speaklap\n` +
            `• Real vaqtda status tekshirish\n\n` +
            `📞 *Yordam kerak bo'lsa:*\n` +
            `Admin bilan bog'laning: ${ADMIN_INFO.telegram}\n\n` +
            `🔗 *Boshlash uchun:* /start`;
        
        await bot.sendMessage(chatId, helpMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🚀 Boshlash',
                        callback_data: 'start_menu'
                    },
                    {
                        text: '📞 Admin bilan bog\'lanish',
                        callback_data: 'contact_admin'
                    }
                ]]
            }
        });
    } catch (error) {
        if (error.response && error.response.body.error_code === 403) {
            console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
        } else {
            console.error('Xatolik (help):', error.message);
        }
    }
});

// Handle /start command
bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const referrerId = match[1] ? match[1].trim() : null;
    
    // Check subscription first
    const isSubscribed = await checkSubscription(userId);
    
    if (!isSubscribed) {
        sendSubscriptionMessage(chatId);
        return;
    }
    
    // Handle referral
    if (referrerId && referrerId !== userId.toString()) {
        const isNewReferral = addReferral(referrerId, userId.toString());
        
        if (isNewReferral) {
            try {
                // Notify referrer
                const referrerCount = await getUserReferralCount(referrerId);
                await bot.sendMessage(referrerId, 
                    `🎉 *Yangi taklif!*\n\n` +
                    `Sizning referral linkingiz orqali yangi foydalanuvchi kanalga qo'shildi!\n\n` +
                    `📊 *Sizning takliflaringiz:* ${referrerCount}/7\n` +
                    `🎯 *Qolgan:* ${7 - referrerCount} ta\n\n` +
                    `${referrerCount >= 5 ? '🎉 Barcha mini-app lar ochilgan!' : '🔒 Mini-app larni ochish uchun yana ' + (5 - referrerCount) + ' ta inson taklif qiling.'}`, 
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                {
                                    text: '📊 Statusni tekshirish',
                                    callback_data: 'check_status'
                                }
                            ]]
                        }
                    }
                );
            } catch (error) {
                console.log('Referrerga xabar yuborishda xatolik:', error.message);
            }
        }
    }
    
    sendMainMenu(chatId);
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    // Answer callback query
    bot.answerCallbackQuery(callbackQuery.id);

    if (data === 'check_subscription') {
        const isSubscribed = await checkSubscription(userId);
        
        if (isSubscribed) {
            try {
                await bot.sendMessage(chatId, '✅ Obuna tasdiqlandi! Botdan foydalanishingiz mumkin.');
                await sendMainMenu(chatId);
            } catch (error) {
                if (error.response && error.response.body.error_code === 403) {
                    console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
                } else {
                    console.error('Xatolik (check_subscription):', error.message);
                }
            }
        } else {
            try {
                await bot.sendMessage(chatId, '❌ Siz hali kanalga obuna bo\'lmagansiz. Iltimos, avval obuna bo\'ling!');
            } catch (error) {
                if (error.response && error.response.body.error_code === 403) {
                    console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
                } else {
                    console.error('Xatolik (check_subscription false):', error.message);
                }
            }
        }
    } else if (data === 'share_bot') {
        try {
            const botInfo = await bot.getMe();
            const shareText = `🤖 Qiziqarli botni topdim\\! Test topshirish, o\\'rganish va ko\\'p narsalar uchun ajoyib imkoniyatlar\\.\n\nBot linki: https://t\\.me/${botInfo.username}`;
            
            // Contactlardan ulashish uchun inline keyboard
            await bot.sendMessage(chatId, 
                `🔗 Do'stlaringizga ulashing:\n\n${shareText.replace(/\\/g, '')}\n\n👇 Quyidagi tugmalardan birini tanlang:`, 
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: '📱 Contactdan tanlash',
                                    switch_inline_query: shareText.replace(/\\/g, '')
                                }
                            ],
                            [
                                {
                                    text: '📋 Matnni nusxa olish',
                                    callback_data: 'copy_share_text'
                                }
                            ]
                        ]
                    }
                }
            );
        } catch (error) {
            if (error.response && error.response.body.error_code === 403) {
                console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
            } else {
                console.error('Xatolik (share_bot):', error.message);
            }
        }
    } else if (data === 'copy_share_text') {
        try {
            const botInfo = await bot.getMe();
            const shareText = `🤖 Qiziqarli kanalni topdim\\! CEFR imtihonini topshirish, o'rganish va Speaking Writing uchun zor kanal ekan, qoshilib olgin tez !\\.\\n\\nBot linki: https://t\\.me/${botInfo.username}`;
            
            await bot.sendMessage(chatId, '📋 Matn nusxalandi! Endi uni do\'stlaringizga yuborishingiz mumkin.');
        } catch (error) {
            if (error.response && error.response.body.error_code === 403) {
                console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
            } else {
                console.error('Xatolik (copy_share_text):', error.message);
            }
        }
    } else if (data === 'writinglap_status') {
        try {
            const referralCount = await getUserReferralCount(chatId);
            const botInfo = await bot.getMe();
            const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;
            
            if (referralCount >= 5) {
                await bot.sendMessage(chatId, '✅ Writinglap ochilgan! Platformadan foydalanishingiz mumkin.', {
                    reply_markup: {
                        inline_keyboard: [[
                            {
                                text: '✍️ Writinglapni ochish',
                                web_app: { url: WRITINGLAP_URL }
                            }
                        ]]
                    }
                });
            } else {
                await bot.sendMessage(chatId, 
                    `🔒 Writinglap qulfi\n\n` +
                    `Bu platformadan foydalanish uchun @studyneedfuture kanaliga 7 ta inson taklif qilishingiz kerak.\n\n` +
                    `📊 Sizning takliflaringiz: ${referralCount}/7\n` +
                    `🎯 Qolgan: ${7 - referralCount} ta\n\n` +
                    `🔗 Sizning referral linkingiz:\n${referralLink}\n\n` +
                    `📋 Ushbu linkni do\'stlaringizga yuboring va ular kanalga obuna bo\'lishlarini so\'rang!`, 
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: '📋 Linkni nusxa olish',
                                        callback_data: 'copy_referral_link'
                                    }
                                ],
                                [
                                    {
                                        text: '🔄 Statusni tekshirish',
                                        callback_data: 'writinglap_status'
                                    }
                                ]
                            ]
                        }
                    }
                );
            }
        } catch (error) {
            if (error.response && error.response.body.error_code === 403) {
                console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
            } else {
                console.error('Xatolik (writinglap_status):', error.message);
            }
        }
    } else if (data === 'speaklap_status') {
        try {
            const referralCount = await getUserReferralCount(chatId);
            const botInfo = await bot.getMe();
            const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;
            
            if (referralCount >= 5) {
                await bot.sendMessage(chatId, '✅ Speaklap ochilgan! Platformadan foydalanishingiz mumkin.', {
                    reply_markup: {
                        inline_keyboard: [[
                            {
                                text: '🎤 Speaklapni ochish',
                                web_app: { url: SPEAKLAP_URL }
                            }
                        ]]
                    }
                });
            } else {
                await bot.sendMessage(chatId, 
                    `🔒 Speaklap qulfi\n\n` +
                    `Bu platformadan foydalanish uchun @studyneedfuture kanaliga 7 ta inson taklif qilishingiz kerak.\n\n` +
                    `📊 Sizning takliflaringiz: ${referralCount}/7\n` +
                    `🎯 Qolgan: ${7 - referralCount} ta\n\n` +
                    `🔗 Sizning referral linkingiz:\n${referralLink}\n\n` +
                    `📋 Ushbu linkni do\'stlaringizga yuboring va ular kanalga obuna bo\'lishlarini so\'rang!`, 
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: '📋 Linkni nusxa olish',
                                        callback_data: 'copy_referral_link'
                                    }
                                ],
                                [
                                    {
                                        text: '🔄 Statusni tekshirish',
                                        callback_data: 'speaklap_status'
                                    }
                                ]
                            ]
                        }
                    }
                );
            }
        } catch (error) {
            if (error.response && error.response.body.error_code === 403) {
                console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
            } else {
                console.error('Xatolik (speaklap_status):', error.message);
            }
        }
    } else if (data === 'copy_referral_link') {
        try {
            const botInfo = await bot.getMe();
            const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;
            
            await bot.sendMessage(chatId, '📋 *Referral link nusxalandi!* Endi uni do\'stlaringizga yuborishingiz mumkin.');
        } catch (error) {
            if (error.response && error.response.body.error_code === 403) {
                console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
            } else {
                console.error('Xatolik (copy_referral_link):', error.message);
            }
        }
    } else if (data === 'check_status') {
        try {
            const hasInvitedEnough = await checkInvitationRequirement(chatId);
            
            if (hasInvitedEnough) {
                await bot.sendMessage(chatId, 
                    `✅ *Tabriklayman!*\n\n` +
                    `Siz @studyneedfuture kanaliga yetarlicha inson taklif qildingiz!\n\n` +
                    `🎉 Endi barcha xususiyatlar ochiq:\n` +
                    `✍️ Writinglap - Yozish mahoratini oshirish\n` +
                    `🎤 Speaklap - Speaking mahoratini oshirish\n\n` +
                    `👇 Asosiy menyu yangilandi:`, 
                    {
                        parse_mode: 'Markdown'
                    }
                );
                await sendMainMenu(chatId);
            } else {
                await bot.sendMessage(chatId, 
                    `⏳ *Hali tayyor emas*\n\n` +
                    `@studyneedfuture kanaliga hali yetarlicha inson taklif qilinmagan.\n\n` +
                    `📊 *Qilingan ish:*\n` +
                    `🔗 Do'stlaringizga ulashishda davom eting\n` +
                    `📱 Kanalga 7 ta inson taklif qiling\n\n` +
                    `💡 *Maslahat:* Do'stlaringizga kanalning foydaliligini tushuntiring!`, 
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                {
                                    text: '🔗 Do\'stlarga ulashish',
                                    callback_data: 'share_bot'
                                }
                            ]]
                        }
                    }
                );
            }
        } catch (error) {
            if (error.response && error.response.body.error_code === 403) {
                console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
            } else {
                console.error('Xatolik (check_status):', error.message);
            }
        }
    } else if (data === 'contact_admin') {
        try {
            const adminMessage = 
                `👨‍💻 *Admin ma\'lumotlari:*\n\n` +
                `👤 *Ism familiya:* ${ADMIN_INFO.name}\n` +
                `📞 *Telefon:* ${ADMIN_INFO.phone}\n` +
                `📱 *Telegram:* ${ADMIN_INFO.telegram}\n\n` +
                `Agar savollaringiz bo'lsa, admin bilan bog'lanishingiz mumkin!`;
            
            await bot.sendMessage(chatId, adminMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: '📱 Telegram\'da yozish',
                            url: ADMIN_INFO.telegram
                        }
                    ]]
                }
            });
        } catch (error) {
            if (error.response && error.response.body.error_code === 403) {
                console.log(`🚫 Foydalanuvchi ${chatId} botni bloklagan`);
            } else {
                console.error('Xatolik (contact_admin):', error.message);
            }
        }
    }
});

// Handle inline queries for sharing with contacts
bot.on('inline_query', async (query) => {
    const queryId = query.id;
    const userId = query.from.id;
    
    try {
        const botInfo = await bot.getMe();
        const shareText = `🤖 Qiziqarli botni topdim\\! Test topshirish, o'rganish va ko'p narsalar uchun ajoyib imkoniyatlar\\.\\n\\nBot linki: https://t\\.me/${botInfo.username}`;
        
        const results = [
            {
                type: 'article',
                id: 'share_bot',
                title: '🤖 Telegram Botni ulashish',
                description: 'Test topshirish va o\'rganish uchun ajoyib bot',
                input_message_content: {
                    message_text: shareText,
                    parse_mode: 'MarkdownV2'
                },
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: '🚀 Botni ochish',
                            url: `https://t.me/${botInfo.username}`
                        },
                        {
                            text: '📞 Admin bilan bog\'lanish',
                            url: ADMIN_INFO.telegram
                        },
                        {
                            text: '✍️ Writinglap',
                            url: WRITINGLAP_URL
                        },
                        {
                            text: '🎤 Speaklap',
                            url: SPEAKLAP_URL
                        }
                    ]]
                },
                thumb_url: 'https://cdn-icons-png.flaticon.com/512/4080/4080896.png'
            }
        ];
        
        await bot.answerInlineQuery(queryId, results, {
            cache_time: 0
        });
        
    } catch (error) {
        console.error('Inline query xatolik:', error.message);
    }
});

// Webhook setup for production
if (NODE_ENV === 'production') {
    // Webhook endpoint
    app.post('/webhook', (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });

    // Set webhook
    bot.setWebHook(WEBHOOK_URL).then(() => {
        console.log('✅ Webhook o\'rnatildi:', WEBHOOK_URL);
    }).catch(error => {
        console.error('❌ Webhook o\'rnatishda xatolik:', error);
    });
}

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        mode: NODE_ENV === 'production' ? 'webhook' : 'polling',
        timestamp: new Date().toISOString()
    });
});

// Start server for webhook mode
if (NODE_ENV === 'production') {
    app.listen(PORT, () => {
        console.log('🚀 Server ishga tushdi, port:', PORT);
        console.log(`📺 Majburiy kanal: ${CHANNEL_USERNAME}`);
        console.log(`👨‍💻 Admin: ${ADMIN_INFO.name}`);
        console.log(`🔗 Webhook: ${WEBHOOK_URL}`);
    });
} else {
    console.log('🤖 Bot ishga tushdi (Polling mode)!');
    console.log(`📺 Majburiy kanal: ${CHANNEL_USERNAME}`);
    console.log(`👨‍💻 Admin: ${ADMIN_INFO.name}`);
}
