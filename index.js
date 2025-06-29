require("dotenv").config();
const { Client: ExarotonClient } = require("exaroton");
const { Client: DiscordClient, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, ActivityType } = require("discord.js");
const express = require("express");

let fetch;

// Create Express app for keep-alive
const app = express();
const PORT = process.env.PORT || 3000;

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

      // Execute the time command
      console.log("⚡ Executing time command...");
      await server.executeCommand("time query day");
      console.log("⌛ Command sent. Waiting for output...");

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

          // Debug: Show recent log content
          console.log("🔍 Recent log content (last 500 chars):");
          console.log(logs.slice(-500));

          // Look for time information in the logs
          const timeMatch = logs.match(/\[.*?\] \[.*?\]: The time is (\d+)/);

          if (timeMatch) {
            const day = timeMatch[1];
            console.log(`✅ Found day: ${day}`);
            message.reply(`*TESTIFICATE INFO:* Dzień na APG: **${day}**`);
          } else {
            console.log('⚠️ No "The time is" found in logs');

            // Also try a broader search pattern
            const broadTimeMatch = logs.match(/The time is (\d+)/);
            if (broadTimeMatch) {
              const day = broadTimeMatch[1];
              console.log(`✅ Found day with broad search: ${day}`);
              message.reply(`*TESTIFICATE INFO:* Dzień na APG: **${day}**`);
            } else {
              // Show what we did find to help debug
              const recentLogs = logs.split("\n").slice(-10).join("\n");
              console.log("⚠️ Recent log lines:", recentLogs);
              message.reply(
                '⚠️ Could not find "The time is" in server logs. The command may not have executed or the server may be too busy. Try again in a moment.',
              );
            }
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
      }, 5000); // Increased timeout to 5 seconds
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
