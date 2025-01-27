require("dotenv").config();
const express = require("express");
const { Telegraf } = require("telegraf");
const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc, setDoc } = require("firebase/firestore");

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize Telegram bot
const bot = new Telegraf(process.env.BOT_TOKEN);
const appexpress = express();

// Set up webhook
const webhookPath = `/bot${process.env.BOT_TOKEN}`;
bot.telegram.setWebhook(`${process.env.SERVER_URL}${webhookPath}`);
appexpress.use(bot.webhookCallback(webhookPath));

// Handle /start command
bot.start(async (ctx) => {
  try {
    console.log("Start command initiated...");
    const { id, first_name, username } = ctx.from;
    console.log("User details:", { id, first_name, username });

    const referralId = ctx.startPayload || null;
    console.log("Referral ID:", referralId);

    const userRef = doc(db, "Users", id.toString());
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      console.log("New user detected. Creating profile...");
      const photos = await ctx.telegram.getUserProfilePhotos(ctx.from.id);
      let profilePicture = "";

      if (photos.total_count > 0) {
        const fileId = photos.photos[0][0].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        profilePicture = fileLink.href;
      }

      const newUser = {
        user_id: id,
        balance: 5000,
        user_name: username,
        first_name: first_name,
        avatar: profilePicture,
        referrals: [],
        referred_by: referralId || null,
        daily_reward: 1000,
        streak_claims: 0,
        streak_reward_amount: 5000,
        last_claimed: "",
        total_coins: 5000,
        friend_count: 10,
        createdAt: new Date().toISOString(),
      };

      if (referralId) {
        const referrerRef = doc(db, "Users", referralId);
        const referrerSnapshot = await getDoc(referrerRef);

        if (referrerSnapshot.exists()) {
          const referrerData = referrerSnapshot.data();

          await setDoc(
            referrerRef,
            {
              balance: (referrerData.balance || 0) + 1000,
              referrals: [...(referrerData.referrals || []), id.toString()],
            },
            { merge: true }
          );
        } else {
          console.log("Invalid referral ID:", referralId);
        }
      }

      await setDoc(userRef, newUser);
    } else {
      console.log("Returning user detected:", id);

      const userData = userSnapshot.data();
      if (userData.referred_by) {
        console.log(`User ${id} already referred by ${userData.referred_by}`);
      } else if (referralId) {
        console.log(`User ${id} is being referred by ${referralId}`);
        await setDoc(userRef, { referred_by: referralId }, { merge: true });

        const referrerRef = doc(db, "Users", referralId);
        const referrerSnapshot = await getDoc(referrerRef);

        if (referrerSnapshot.exists()) {
          const referrerData = referrerSnapshot.data();
          await setDoc(
            referrerRef,
            {
              balance: parseInt(referrerData.balance || 0) + 1000,
              referrals: [...(referrerData.referrals || []), id.toString()],
              total_coins: parseInt(referrerData.total_coins || 0) + 1000,
            },
            { merge: true }
          );
        }
      }
    }

    const description = `
Welcome ${first_name} to *DripCoinQuest*! 🎮💰

🌟 **Complete Quests**: Participate in fun tasks to earn coins and unlock rewards.
🎁 **Claim Daily Rewards**: Return each day for your free daily coins!
🔗 **Refer Friends**: Share your referral link and earn rewards when friends join.
💎 **Earn Streak Bonuses**: Log in daily to increase your rewards!
`;

    const buttons = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Start Quest",
              url: "https://t.me/DripCoinBot/DripCoinQuest",
            },
            { text: "Channel", url: "https://t.me/dripcoinofficialchannel" },
          ],
          [
            {
              text: "Share Referral Link",
              callback_data: "share_referral_link",
            },
          ],
        ],
      },
    };

    await ctx.replyWithPhoto(
      {
        url: "https://i.postimg.cc/wTZCz4WB/drip-f.png",
      },
      {
        caption: description,
        parse_mode: "Markdown",
        ...buttons,
      }
    );
  } catch (error) {
    console.error("Error in start command:", error);
    ctx.reply(
      "An error occurred while processing your request. Please try again."
    );
  }
});

// Handle "Share Referral Link" button click
bot.on("callback_query", async (ctx) => {
  const { id, first_name } = ctx.from;

  if (ctx.callbackQuery.data === "share_referral_link") {
    const referralLink = `https://t.me/DripCoinBot?start=${id}`;
    const shareMessage = `
Hey ${first_name}! 🎉
Here’s your referral link: ${referralLink}
Share it with your friends and earn exciting rewards! 🚀
`;
    await ctx.answerCbQuery();
    await ctx.reply(shareMessage);
  }
});

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

// Launch Express server
const PORT = process.env.PORT || 3000;
appexpress.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
