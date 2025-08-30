require("dotenv").config();
const { Client: ExarotonClient } = require("exaroton");
const { Client: DiscordClient, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, ActivityType } = require("discord.js");
const express = require("express");
const fs = require("fs");
const path = require("path");

let fetch;

// Create Express app for keep-alive
const app = express();
const PORT = process.env.PORT || 3000;

// User data storage (in production, use a proper database)
const DATA_FILE = path.join(__dirname, 'userdata.json');
let userData = {};

const getEmoji = (name) => {
  try {
    // Check if bot is ready and application is available
    if (!discord.user || !discord.application) {
      console.log(`⚠️ Bot not ready or application not available for emoji: ${name}`);
      return name;
    }
    
    // Try to find the emoji in application emojis
    const emoji = discord.application.emojis?.cache?.find(e => e.name === name);
    if (emoji) {
      console.log(`✅ Found application emoji: ${name} -> ${emoji.toString()}`);
      return emoji.toString();
    }
    
    console.log(`⚠️ Application emoji not found: ${name}`);
    return name;
  } catch (error) {
    console.error(`❌ Error getting emoji ${name}:`, error.message);
    return name;
  }
};

// Load user data on startup
function loadUserData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      userData = JSON.parse(data);
      console.log(`✅ Loaded user data for ${Object.keys(userData).length} users`);
    } else {
      userData = {};
      console.log("📁 No existing user data file, starting fresh");
    }
  } catch (error) {
    console.error("❌ Error loading user data:", error.message);
    userData = {};
  }
}

// Save user data
function saveUserData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2));
  } catch (error) {
    console.error("❌ Error saving user data:", error.message);
  }
}

// Get or create user data
function getUser(userId) {
  if (!userData[userId]) {
    userData[userId] = {
      balance: 1000, // Starting balance
      totalWon: 0,
      totalLost: 0,
      gamesPlayed: 0,
      lastDaily: 0
    };
    saveUserData();
  }
  return userData[userId];
}

// Update user balance
function updateBalance(userId, amount) {
  const user = getUser(userId);
  user.balance += amount;
  if (amount > 0) user.totalWon += amount;
  if (amount < 0) user.totalLost += Math.abs(amount);
  user.gamesPlayed++;
  saveUserData();
  return user.balance;
}

// Gambling scenarios with different odds and payouts
const gamblingScenarios = [
  {
    id: 1,
    name: "Coin Flip",
    description: "heads... or tails...",
    options: ["Heads", "Tails"],
    winChance: 50,
    payout: 2.0,
    emoji: "🪙"
  },
  {
    id: 2,
    name: "Dice Roll",
    description: "Bet on high (4-6) or low (1-3)",
    options: ["High (4-6)", "Low (1-3)"],
    winChance: 50,
    payout: 2.0,
    emoji: "🎲"
  },
  {
    id: 3,
    name: "Lucky Number",
    description: "Pick a number 1-10",
    options: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    winChance: 10,
    payout: 9.0,
    emoji: "🔢"
  },
  {
    id: 4,
    name: "Fate",
    description: "Bet on Villager #21's fate",
    options: ["kill", "pit of death", "penetration 3000", "enslave"],
    winChance: 25,
    payout: 3.5,
    emoji: `${getEmoji('villager21')}`
  },
  {
    id: 5,
    name: "Slot Machine",
    description: "Three matching symbols",
    options: ["🍒 Cherry", "🍋 Lemon", "🍊 Orange", "🍇 Grape", "💎 Diamond"],
    winChance: 20,
    payout: 4.5,
    emoji: "🎰"
  },
  {
    id: 6,
    name: "lancer roulette",
    description: "hide from daddy lancer",
    options: ["closet", "Testificate Disguise TM", "dont hide i will outgoon him", "tree", "lancer's bed dedicated for his motorcycle TM", "toilet"],
    winChance: 83.33,
    payout: 1.2,
    emoji: `${getEmoji('lancer')}`
  }
];

// Keep-alive endpoint
app.get("/", (req, res) => {
  res.json({
    status: "Bot is running!",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    botStatus: discord.user
      ? `Logged in as ${discord.user.tag}`
      : "Not logged in",
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    discord: discord.user ? "connected" : "disconnected",
    uptime: process.uptime(),
  });
});

// Start the web server
app.listen(PORT, () => {
  console.log(`🌐 Keep-alive server running on port ${PORT}`);
});

// Load user data on startup
loadUserData();

// Webhook keep-alive function
const WEBHOOK_URL = process.env.WEBHOOK; // Add this to your .env file

// Initialize Discord and Exaroton clients
const exa = new ExarotonClient(process.env.EXAROTON_TOKEN);
const discord = new DiscordClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Fixed getEmoji function - now references application emojis from Discord Developer Portal


async function pingWebhook(message) {
  if (!WEBHOOK_URL) {
    console.log("⚠️ No webhook URL configured");
    return;
  }

  try {
    // Dynamically import fetch if not already imported
    if (!fetch) {
      const { default: nodeFetch } = await import("node-fetch");
      fetch = nodeFetch;
    }

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: message,
        username: "TestificateInfo Keep-Alive",
      }),
    });

    if (response.ok) {
      console.log(`✅ Webhook ping successful: ${message}`);
    } else {
      console.log(
        `❌ Webhook ping failed: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.log(`❌ Webhook ping error: ${error.message}`);
  }
}

// Initialize fetch and start the bot
async function initializeBot() {
  try {
    // Import node-fetch
    const { default: nodeFetch } = await import("node-fetch");
    fetch = nodeFetch;

    // Send initial webhook message immediately
    await pingWebhook(
      `🚀 TestificateInfo bot started at ${new Date().toISOString()}`,
    );

    // Set up interval to ping webhook every 5 minutes
    setInterval(
      () => {
        const now = new Date().toISOString();
        pingWebhook(`🏓 Keep-alive ping - ${now}`);
      },
      5 * 60 * 1000,
    ); // 5 minutes
  } catch (error) {
    console.error("❌ Failed to initialize fetch:", error);
  }
}

// Helper function to format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Helper function to get status emoji and color
function getStatusDisplay(status) {
  const statusMap = {
    0: { name: "offline", emoji: "🔴", color: 0xff0000 },
    1: { name: "online", emoji: "🟢", color: 0x00ff00 },
    2: { name: "starting", emoji: "🟡", color: 0xffff00 },
    3: { name: "stopping", emoji: "🟠", color: 0xff8000 },
    4: { name: "restarting", emoji: "🔄", color: 0x0080ff },
    5: { name: "saving", emoji: "💾", color: 0x8000ff },
    6: { name: "loading", emoji: "⏳", color: 0x80ff00 },
    7: { name: "crashed", emoji: "💥", color: 0x800000 },
  };
  
  return statusMap[status] || { name: `unknown (${status})`, emoji: "❓", color: 0x808080 };
}

// Fixed status update function
async function updateBotStatus() {
  try {
    // Check if bot is ready
    if (!discord.user) {
      console.log("⚠️ Bot not ready, skipping status update");
      return;
    }

    const server = exa.server(process.env.EXAROTON_SERVER_ID);
    const serverInfo = await server.get();
    const statusDisplay = getStatusDisplay(serverInfo.status);
    
    const statusMessages = {
      0: { text: 'Server Offline | t!help', type: ActivityType.Watching },
      1: { text: `${serverInfo.playerCount || 0}/${serverInfo.maxPlayerCount || 0} players | t!help`, type: ActivityType.Watching },
      2: { text: 'Server Starting... | t!help', type: ActivityType.Watching },
      3: { text: 'Server Stopping... | t!help', type: ActivityType.Watching },
      4: { text: 'Server Restarting... | t!help', type: ActivityType.Watching },
      5: { text: 'Server Saving... | t!help', type: ActivityType.Watching },
      6: { text: 'Server Loading... | t!help', type: ActivityType.Watching },
      7: { text: 'Server Crashed | t!help', type: ActivityType.Watching },
    };
    
    const statusInfo = statusMessages[serverInfo.status] || { 
      text: 'Unknown Status | t!help', 
      type: ActivityType.Watching 
    };
    
    // Use the correct method for setting activity
    await discord.user.setPresence({
      activities: [{
        name: statusInfo.text,
        type: statusInfo.type
      }],
      status: 'online'
    });
    
    console.log(`🎯 Bot status updated: ${statusInfo.text}`);
    
  } catch (err) {
    console.error("❌ Failed to update bot status:", err.message);
    
    // Fallback to default status
    if (discord.user) {
      try {
        await discord.user.setPresence({
          activities: [{
            name: 'Latest News from APG | t!help',
            type: ActivityType.Watching
          }],
          status: 'online'
        });
        console.log("🎯 Set fallback status");
      } catch (fallbackErr) {
        console.error("❌ Failed to set fallback status:", fallbackErr.message);
      }
    }
  }
}

discord.once("ready", async () => {
  console.log(`✅ Logged in as ${discord.user.tag}`);

  // Load application emojis
  try {
    console.log("🎭 Loading application emojis...");
    if (discord.application) {
      await discord.application.emojis.fetch();
      console.log(`✅ Loaded ${discord.application.emojis.cache.size} application emojis`);
      
      // Debug: List all available application emojis
      discord.application.emojis.cache.forEach(emoji => {
        console.log(`📍 Available emoji: ${emoji.name} (${emoji.id})`);
      });
    } else {
      console.log("⚠️ Application not available for emoji loading");
    }
  } catch (err) {
    console.error("❌ Failed to load application emojis:", err.message);
  }

  // Wait a moment for the bot to fully initialize
  setTimeout(async () => {
    try {
      console.log("🎯 Setting initial bot status...");
      
      // Set initial status
      await discord.user.setPresence({
        activities: [{
          name: 'APG Server | t!help',
          type: ActivityType.Watching
        }],
        status: 'online'
      });
     
      
      console.log("🎯 Initial bot status set successfully");
      
      // Then update with dynamic status if enabled
      if (process.env.DYNAMIC_STATUS === 'true') {
        console.log("🔄 Dynamic status enabled, updating...");
        await updateBotStatus();
      }
      
    } catch (err) {
      console.error("❌ Failed to set bot status:", err.message);
    }
  }, 2000); // Wait 2 seconds

  // Test server connection on startup
  try {
    const server = exa.server(process.env.EXAROTON_SERVER_ID);
    const serverInfo = await server.get();
    const statusDisplay = getStatusDisplay(serverInfo.status);
    console.log(
      `🔗 Connected to server: ${serverInfo.name} (Status: ${statusDisplay.name})`,
    );
  } catch (err) {
    console.error(
      "❌ Failed to connect to Exaroton server on startup:",
      err.message,
    );
  }
});

discord.on("messageCreate", async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // t!balance - Check user balance
 if (message.content === "t!balance" || message.content === "t!bal") {
  const user = await getUser(message.author.id);
  if (!user) return message.reply("❌ Error accessing your account!");
  
  const embed = new EmbedBuilder()
    .setTitle("apg wallet 3000")
    .setColor(0xffd700)
    .addFields(
      { name: "Current Balance", value: `${getEmoji('VIPCOIN')} **${user.balance.toLocaleString()}** VIPCOIN Stock`, inline: false },
      { name: "Games Played", value: `${user.gamesPlayed}`, inline: true },
      { name: "Total Won", value: `${user.totalWon.toLocaleString()}`, inline: true },
      { name: "Total Lost", value: `${user.totalLost.toLocaleString()}`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "villager #21's casino" });
  
  message.reply({ embeds: [embed] });
}

  // t!daily - Daily free coins
  if (message.content === "t!daily") {
    const user = getUser(message.author.id);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    if (now - user.lastDaily < oneDay) {
      const timeLeft = oneDay - (now - user.lastDaily);
      const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      
      return message.reply(`⏰ You already claimed your daily stock! Come back in **${hoursLeft}h ${minutesLeft}m**.`);
    }
    
    const dailyAmount = 500;
    user.balance += dailyAmount;
    user.lastDaily = now;
    saveUserData();
    
    const embed = new EmbedBuilder()
      .setTitle("🎁 Daily Reward Claimed!")
      .setDescription(`You received **${dailyAmount}** VIPCOINS!`)
      .setColor(0x00ff00)
      .addFields(
        { name: "New Balance", value: `${getEmoji('VIPCOIN')} **${user.balance.toLocaleString()}** VIPCOINS`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: "Come back tomorrow for more!" });
    
    message.reply({ embeds: [embed] });
  }

  // t!gamble - Show gambling scenarios
  if (message.content === "t!gamble") {
    const embed = new EmbedBuilder()
      .setTitle(`${getEmoji('villager21')} villager #21's casino`)
      .setDescription("pick a gamble thinge. higher risk, higher reward!!")
      .setColor(0xff6b6b);
    
    gamblingScenarios.forEach(scenario => {
      embed.addFields({
        name: `${scenario.emoji} ${scenario.name} (Scenario ${scenario.id})`,
        value: `${scenario.description}\n**Win Chance:** ${scenario.winChance}% | **Payout:** ${scenario.payout}x\n*Usage:* \`t!bet ${scenario.id} [amount] [choice]\``,
        inline: false
      });
    });
    
    embed.addFields({
      name: "💡 How to Play",
      value: "Use `t!bet [scenario] [amount] [choice]`\nExample: `t!bet 1 100 Heads`\nCheck your balance with `t!balance`\nGet daily stock with `t!daily`",
      inline: false
    });
    
    message.reply({ embeds: [embed] });
  }

  // t!bet [scenario] [amount] [choice] - Place a bet
  if (message.content.startsWith("t!bet ")) {
    const args = message.content.slice(6).trim().split(' ');
    
    if (args.length < 3) {
      return message.reply("❌ Usage: `t!bet [scenario] [amount] [choice]`\nExample: `t!bet 1 100 Heads`\nUse `t!gamble` to see all scenarios.");
    }
    
    const scenarioId = parseInt(args[0]);
    const betAmount = parseInt(args[1]);
    const userChoice = args.slice(2).join(' ');
    
    // Validate scenario
    const scenario = gamblingScenarios.find(s => s.id === scenarioId);
    if (!scenario) {
      return message.reply("❌ Invalid scenario! Use `t!gamble` to see available scenarios (1-6).");
    }
    
    // Validate bet amount
    if (isNaN(betAmount) || betAmount < 1) {
      return message.reply("❌ Invalid bet amount! Must be a positive number.");
    }
    
    // Check user balance
    const user = getUser(message.author.id);
    if (user.balance < betAmount) {
      return message.reply(`❌ Insufficient funds! You have **${user.balance.toLocaleString()}** coins but tried to bet **${betAmount.toLocaleString()}**.`);
    }
    
    // Validate choice
    const validChoice = scenario.options.find(option => 
      option.toLowerCase().includes(userChoice.toLowerCase()) || 
      userChoice.toLowerCase().includes(option.toLowerCase())
    );
    
    if (!validChoice) {
      return message.reply(`❌ Invalid choice for ${scenario.name}!\nValid options: ${scenario.options.join(', ')}`);
    }
    
    // Execute the gamble
    const isWin = Math.random() * 100 < scenario.winChance;
    const winAmount = Math.floor(betAmount * scenario.payout);
    
    let resultMessage = "";
    let resultColor = 0xff0000;
    
    if (isWin) {
      updateBalance(message.author.id, winAmount - betAmount);
      resultMessage = `🎉 **YOU WON!** You won **${(winAmount - betAmount).toLocaleString()}** coins!`;
      resultColor = 0x00ff00;
    } else {
      updateBalance(message.author.id, -betAmount);
      resultMessage = `💸 **YOU LOST!** You lost **${betAmount.toLocaleString()}** coins.`;
    }
    
    // Generate result based on scenario
    let outcomeDescription = "";
    switch (scenario.id) {
      case 1: // Coin Flip
        const coinResult = Math.random() < 0.5 ? "Heads" : "Tails";
        outcomeDescription = `${getEmoji('VIPCOIN')} the coin landed on... **${coinResult}**!`;
        break;
      case 2: // Dice Roll
        const diceNum = Math.floor(Math.random() * 6) + 1;
        const diceCategory = diceNum >= 4 ? "High (4-6)" : "Low (1-3)";
        outcomeDescription = `🎲 you rolled a... **${diceNum}** (${diceCategory})!`;
        break;
      case 3: // Lucky Number
        const luckyNum = Math.floor(Math.random() * 10) + 1;
        outcomeDescription = `🔢 The lucky number was **${luckyNum}**!`;
        break;
      case 4: // Color Wheel
        const colors = ["kill", "pit of death", "penetration 3000", "enslave"];
        const wheelResult = colors[Math.floor(Math.random() * colors.length)];
        outcomeDescription = `villager #21 is be **${wheelResult}**!`;
        break;
      case 5: // Slot Machine
        const symbols = ["🍒", "🍋", "🍊", "🍇", "💎"];
        const slot1 = symbols[Math.floor(Math.random() * symbols.length)];
        const slot2 = symbols[Math.floor(Math.random() * symbols.length)];
        const slot3 = symbols[Math.floor(Math.random() * symbols.length)];
        outcomeDescription = `🎰 Slots: ${slot1} ${slot2} ${slot3}`;
        break;
      case 6: // Russian Roulette
        const chamber = Math.floor(Math.random() * 6) + 1;
        const isBullet = Math.random() < (1/6);
        outcomeDescription = `daddy lancer was in: ${chamber}: ${isBullet ? "AHHHHHHHHHHHHHHHHHHHHHH 🗿🗿🗿🗿🗿🗿☠️☠️💀🔥🔥 BRO IS COOKED 🙏🙏🙏☠️☠️ DADDY LANCER FOUND YOU... 🤫🤫🤫💀🗿🗿🗿🗿🙏🔥🙏☠️☠️" : "daddy lancer couldn't find you..."}`;
        break;
    }
    
    const newBalance = getUser(message.author.id).balance;
    
    const embed = new EmbedBuilder()
      .setTitle(`${scenario.emoji} ${scenario.name} - Bet Results`)
      .setDescription(outcomeDescription)
      .setColor(resultColor)
      .addFields(
        { name: "Your Choice", value: userChoice, inline: true },
        { name: "Bet Amount", value: `${betAmount.toLocaleString()} coins`, inline: true },
        { name: "Result", value: resultMessage, inline: false },
        { name: "New Balance", value: `${getEmoji('VIPCOIN')} **${newBalance.toLocaleString()}** VIPCOIN Stock`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: "villager 21's casino" });
    
    message.reply({ embeds: [embed] });
  }

  // t!lancerstatus command
  if (message.content === "t!lancerstatus") {
    console.log("🐎 Lancer status command received");
    
    try {
      // Create a simple lancer image URL (you can replace this with your own image)
      const lancerImageUrl = "https://cdn.discordapp.com/attachments/1387880532137869324/1388909600677298299/alivelancer.png?ex=6862b25d&is=686160dd&hm=fefb1351e6529c8a169466003ae6d5982c7e5c6d01f02dcd417297fe0470c73a&"; // Replace with actual image URL
      
      const embed = new EmbedBuilder()
        .setTitle("is bouncy little pumpkin aliv?")
        .setDescription("**Lancer Status: ALIVE**")
        .setColor(0x00ff00)
        .setImage(lancerImageUrl)
        .setTimestamp()
        .setFooter({ text: "TestificateInfo Bot" });
      
      // If you don't have a hosted image, we'll just send text
     message.reply({ embeds: [embed] });
      
    } catch (err) {
      console.error("❌ Error with lancer status:", err.message);
      message.reply("**LANCER STATUS: ALIVE** (but image failed to load)");
    }
  }
  
if (message.content.toLowerCase().includes("massive")) {
  console.log("M..M-MASSIVE?? EXECUTING ORDER 42143");
  
  try {
    // Replace this URL with your actual Discord CDN image link
    const massiveImageUrl = "https://cdn.discordapp.com/attachments/1387880532137869324/1389221393518039120/MASSIVELOWTAPRERFADE.png?ex=6863d4be&is=6862833e&hm=b26c3130ba502fd2467c5e1310fb015cc4e251152715aa63cfa0d614e8991e2f&";
    
    // Send the image (not as a reply, just a regular message)
    await message.channel.send(massiveImageUrl);
    
  } catch (err) {
    console.error("❌ Error sending massive image:", err.message);
  }
}
  
  // t!help command - Show all available commands
  if (message.content === "t!help") {
    const embed = new EmbedBuilder()
      .setTitle("🤖 TestificateInfo Bot Commands")
      .setDescription("her ar al the avalable commands:")
      .setColor(0x0099ff)
      .addFields(
        { name: "t!time", value: "get the current day on APG", inline: false },
        { name: "t!lancerstatus", value: "check up on lancer", inline: false },
        { name: "t!ask", value: "ask a yes or no question", inline: false },
        { name: "@TESTIFICATE MAN IS THIS TRUE?????", value: "simulate the feeling of being a chronically online twitter user", inline: false },
        { name: "t!help", value: "show dis mesage", inline: false }
      )
      .setTimestamp()
      .setFooter({ text: "TestificateInfo Bot" });

    message.reply({ embeds: [embed] });
  }
   if (message.content === "initiate command 10398293203209 testificate man") {
    const embed = new EmbedBuilder()
      .setTitle("happy")
      .setDescription("birthday")
      .setColor(0x0099ff)
      .addFields(
        { name: "to:", value: "@kacper!!!!!!", inline: false }
      )
      .setTimestamp()
      .setFooter({ text: "i have been paid to say this please free me" });

    message.reply({ embeds: [embed] });
  }
  

  
  if (message.mentions.users.has(discord.user.id) && 
    message.content.toLowerCase().includes("is this true")) {
  
  console.log("📊 Fact check request received");
  
  // Fact check responses with different categories
  const factCheckResponses = {
    confirmed: [
      "✅ **TRUE** - this has been verified by multiple enterprises on APG.",
      "✅ **CONFIRMED** - according to big justice, this is confirmed.",
      "✅ **VERIFIED** - verified information!!!",
      "✅ **FACTUAL** - 100% of villagers confirm this is a fact.",
      "✅ **ACCURATE** - Testificate Man™ himself approves.",
      "✅ **LEGITIMATE** - the apg testificate court approves of this."
    ],
    
    denied: [
      "❌ **FALSE** - this contradicts established dr trayaurus kknowledge.",
      "❌ **DEBUNKED** - yes this is DEBUNKED its FAKE do not belive this.",
      "❌ **MISINFORMATION** - with the APG TM data that we have, this is misinformation.",
      "❌ **INACCURATE** - multiplie sources dispute this claim.",
      "❌ **FABRICATED** - no credible TESTIFICAT sources support this.",
      "❌ **DISPUTED** - with the evidenc that we hav, this is very false."
    ],
    
    uncertain: [
      `${getEmoji('boat')} **UNVERIFIED** - insuficient data on this topic so probly idk`,
      `${getEmoji('boat')} **UNCLEAR** - we don know`,
      `${getEmoji('boat')} **INCONCLUSIVE** - more investigation is needed by testificate exeperts`,
      `${getEmoji('boat')} **MIXED** - some sourcs say that it corect, some NOT.`,
      `${getEmoji('boat')} **UNDER REVIEW** - currently under review becauz um we dont pay our workers and they ned time to fact check but probly no`,
      `${getEmoji('boat')} **PARTIALLY TRUE** - idk bro i think it true beased on my SOURCES`
    ],
    
    sassy: [
      "😡 **OBVIOUSLY FALSE** - least obvius RAGE BIAT!!!! MODS BAN HIM!!!! tis so obivous bro it false",
      `😡 **shut up** - fuck off use yur BRAIN`,
      `${getEmoji('sybau')} **CLEARLY WRONG** -90% of interviewed say that this info is FAKE`
    ],
    
    meme: [
      "low taper fade is stil masvive"
    ]
  };
  
  // Weighted random selection (similar to your ask command style)
  function getFactCheckResponse() {
    const rand = Math.random() * 100;
    
    if (rand < 30) {
      // 30% chance - confirmed/denied (split evenly)
      const isConfirmed = Math.random() < 0.5;
      const category = isConfirmed ? 'confirmed' : 'denied';
      return factCheckResponses[category][Math.floor(Math.random() * factCheckResponses[category].length)];
    } else if (rand < 60) {
      // 30% chance - uncertain
      return factCheckResponses.uncertain[Math.floor(Math.random() * factCheckResponses.uncertain.length)];
    } else if (rand < 85) {
      // 25% chance - sassy
      return factCheckResponses.sassy[Math.floor(Math.random() * factCheckResponses.sassy.length)];
    } else {
      // 15% chance - meme response
      return factCheckResponses.meme[Math.floor(Math.random() * factCheckResponses.meme.length)];
    }
  }
  
  // Get random response
  const response = getFactCheckResponse();
  
  // Footer options
  const footers = [
    "— Testificate Info™ Fact Checking Technology",
    "— Verified by VIP Enterprises",
    "APG Testificate Court - i aproves",
  ];
  
  const randomFooter = footers[Math.floor(Math.random() * footers.length)];
  
  console.log("Fact check: Random response selected");
  
  // Send simple message with footer
  message.reply(`${response}\n\n*${randomFooter}*`);
}
  
if (message.content.startsWith("t!ask ")) {
    const question = message.content.slice(6).trim(); // Remove "t!ask " prefix
    
    if (!question) {
      return message.reply("ASK ME A YES OR NO QUESTION. EXAMPLE. t!ask are your balls hairy");
    }
    
    // Array of randomized responses
    const responses = [
      "yes",
      "probably",
      "idk",
      "never",
      "no",
      "100% yes",
      "definitely not",
      "maybe",
      "doubt it",
      "most likely",
      "fuck off",
      "very unlikely"
    ];
    
    // Pick a random response
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    console.log(`Ask command: "${question}" -> "${randomResponse}"`);
    
    // Create embed response
    const embed = new EmbedBuilder()
      .setTitle("bep bop getting info straight from APG and Testificate Man TM...")
      .addFields(
        { name: "Question:", value: question, inline: false },
        { name: "Answer verified by Testificate Info ™:", value: `**${randomResponse}**`, inline: false }
      )
      .setColor(0x9932cc)
      .setTimestamp()
      .setFooter({ text: "TestificateInfo ™ 2025" });
    
    message.reply({ embeds: [embed] });
  }
  // Original t!time command (keeping your existing implementation)
  if (message.content === "t!time") {
  console.log("🕐 Time command received");

  // Check if environment variables are set
  if (!process.env.EXAROTON_SERVER_ID || !process.env.EXAROTON_TOKEN) {
    console.error("❌ Missing environment variables");
    return message.reply(
      "❌ Bot configuration error: Missing server credentials.",
    );
  }

  const server = exa.server(process.env.EXAROTON_SERVER_ID);

  try {
    // First, check server status
    const serverInfo = await server.get();
    console.log(`📊 Server status: ${serverInfo.status}`);

    const statusDisplay = getStatusDisplay(serverInfo.status);
    console.log(`📊 Readable status: ${statusDisplay.name}`);

    if (serverInfo.status !== 1) {
      // 1 = online
      return message.reply(
        `⚠️ Server is currently **${statusDisplay.name}**. The server must be online to check the time.`,
      );
    }

    // Generate a unique identifier for this command execution
    const commandId = Date.now();
    const uniqueComment = `time-check-${commandId}`;
    
    // Execute the time command with a unique comment to identify our request
    console.log(`⚡ Executing time command with ID: ${commandId}...`);
    await server.executeCommand(`say testificate info checking time.......`);
    await server.executeCommand("time query day");
    console.log("⌛ Commands sent. Waiting for output...");

    // Wait for the command to execute and then fetch console output
    setTimeout(async () => {
      try {
        console.log("🔍 Attempting to fetch server logs...");
        const logs = await server.getLogs();

        console.log("📝 Server logs received");
        console.log("📊 Logs structure:", {
          hasContent: !!logs,
          contentType: typeof logs,
          contentLength: logs ? logs.length : 0,
        });

        if (!logs || logs.length === 0) {
          console.log("⚠️ No server logs available");
          return message.reply(
            "⚠️ No server logs available. The server might not be generating logs or may need to be restarted.",
          );
        }

        // Split logs into lines and process from newest to oldest
        const logLines = logs.split('\n');
        console.log(`🔍 Processing ${logLines.length} log lines...`);

        // Find our unique comment to know when our command was executed
        let commandTimestamp = null;
        for (let i = logLines.length - 1; i >= 0; i--) {
          if (logLines[i].includes(uniqueComment)) {
            commandTimestamp = i;
            console.log(`✅ Found our command execution at line ${i}`);
            break;
          }
        }

        // Look for the most recent time information AFTER our command was executed
        let timeMatch = null;
        if (commandTimestamp !== null) {
          // Search from our command timestamp onwards (newer logs)
          for (let i = commandTimestamp; i < logLines.length; i++) {
            const match = logLines[i].match(/The time is (\d+)/);
            if (match) {
              timeMatch = match;
              console.log(`✅ Found time at line ${i}: ${match[1]}`);
              break;
            }
          }
        }

        // Fallback: search the most recent logs if we didn't find our command marker
        if (!timeMatch) {
          console.log("⚠️ Command marker not found, searching recent logs...");
          // Look at the last 50 lines for any time information
          const recentLines = logLines.slice(-50);
          for (let i = recentLines.length - 1; i >= 0; i--) {
            const match = recentLines[i].match(/The time is (\d+)/);
            if (match) {
              timeMatch = match;
              console.log(`✅ Found fallback time: ${match[1]}`);
              break;
            }
          }
        }

        if (timeMatch) {
          const day = parseInt(timeMatch[1]);
          console.log(`✅ Final day result: ${day}`);
          
          // Check if it's day 1000 and celebrate!
          if (day === 999) {
            console.log("🎉 DAY 1000 DETECTED! Executing celebration...");
            
            try {
              // Send big title to all players
              await server.executeCommand('title @a title {"text":"DAY 1000","color":"gold","bold":true}');
              await server.executeCommand('title @a subtitle {"text":"massive news GGS","color":"yellow"}');
              
              // Send chat message to all players
              await server.executeCommand('say §6§lWE ARE BACK CHAT DAY 1000');
              
              console.log("✅ Day 1000 celebration commands executed!");
              
              // Special Discord message for day 1000
              const celebrationEmbed = new EmbedBuilder()
                .setTitle("DAY 1000")
                .setDescription("**APG IS STILL MASSIVE ❗❗❗❗⏰⏰⏰🚨🚨🎆🎆🎉🎉🎉✨**")
                .setColor(0xffd700)
                .addFields(
                  { name: "Dzień na APG", value: `**${day}**`, inline: true },
                  { name: "Milestone", value: "1000", inline: true },
                  { name: "apg", value: "massive", inline: false }
                )
                .setImage("https://tenor.com/view/minecraft-villager-news-dance-gif-15374212") // Add a celebration GIF if you have one
                .setTimestamp()
                .setFooter({ text: "testificate man info 5000" });
              
              message.reply({ embeds: [celebrationEmbed] });
              
            } catch (celebrationErr) {
              console.error("❌ Error executing day 1000 celebration:", celebrationErr.message);
              message.reply(`*TESTIFICATE INFO:* Dzień na APG: **${day}** 🎉🎉🎉`);
            }
          } else {
            // Normal day response
            message.reply(`*TESTIFICATE INFO:* Dzień na APG: **${day}**`);
          }
        } else {
          console.log('⚠️ No "The time is" found in logs');
          
          // Debug: Show recent log content for troubleshooting
          const recentLogs = logLines.slice(-10).join("\n");
          console.log("⚠️ Recent log lines for debugging:", recentLogs);
          
          message.reply(
            '⚠️ Could not find time information in server logs. The time command may not have executed properly. Try again in a moment.',
          );
        }
      } catch (logsErr) {
        console.error("❌ Detailed logs error:", {
          message: logsErr.message,
          stack: logsErr.stack,
          name: logsErr.name,
        });

        if (logsErr.message.includes("403")) {
          message.reply(
            "❌ Permission denied when accessing logs. Check if your API token has log access permissions.",
          );
        } else if (logsErr.message.includes("404")) {
          message.reply(
            "❌ Server logs not found. The server might not have any logs yet.",
          );
        } else if (
          logsErr.message.includes("loading") ||
          logsErr.message.includes("stopping") ||
          logsErr.message.includes("saving")
        ) {
          message.reply(
            "⚠️ Cannot access logs while server is loading, stopping, or saving. Try again when the server is fully online.",
          );
        } else {
          message.reply(
            `❌ Error retrieving server logs: ${logsErr.message}`,
          );
        }
      }
    }, 6000); // Increased timeout to 6 seconds to allow more time for command execution
  } catch (err) {
    console.error("❌ Error with server operation:", err.message);

    // Provide more specific error messages
    if (err.message.includes("404")) {
      message.reply(
        "❌ Server not found. Please check the server ID configuration.",
      );
    } else if (err.message.includes("403")) {
      message.reply(
        "❌ Access denied. Please check the API token permissions.",
      );
    } else if (err.message.includes("401")) {
      message.reply("❌ Authentication failed. Please check the API token.");
    } else {
      message.reply(
        "❌ Failed to retrieve server information. Please try again later.",
      );
    }
  }
}
});

// Initialize the bot
initializeBot();

// Fixed interval for dynamic status updates
setInterval(async () => {
  if (process.env.DYNAMIC_STATUS === 'true') {
    console.log("🔄 Running scheduled status update...");
    await updateBotStatus();
  }
}, 2 * 60 * 1000); // 2 minutes

// Add error handling for the bot
discord.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

discord.on('warn', (warning) => {
  console.warn('⚠️ Discord client warning:', warning);
});

discord.login(process.env.DISCORD_TOKEN);
