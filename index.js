require("dotenv").config();
const { Client: ExarotonClient } = require("exaroton");
const { Client: DiscordClient, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require("discord.js");
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

const exa = new ExarotonClient(process.env.EXAROTON_TOKEN);
const discord = new DiscordClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

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
async function updateBotStatus() {
  try {
    const server = exa.server(process.env.EXAROTON_SERVER_ID);
    const serverInfo = await server.get();
    const statusDisplay = getStatusDisplay(serverInfo.status);
    
    const statusMessages = {
      0: { text: 'Server Offline | t!help', type: 'WATCHING' },
      1: { text: `${serverInfo.playerCount || 0}/${serverInfo.maxPlayerCount || 0} players | t!help`, type: 'WATCHING' },
      2: { text: 'Server Starting... | t!help', type: 'WATCHING' },
      3: { text: 'Server Stopping... | t!help', type: 'WATCHING' },
      4: { text: 'Server Restarting... | t!help', type: 'WATCHING' },
      5: { text: 'Server Saving... | t!help', type: 'WATCHING' },
      6: { text: 'Server Loading... | t!help', type: 'WATCHING' },
      7: { text: 'Server Crashed | t!help', type: 'WATCHING' },
    };
    
    const statusInfo = statusMessages[serverInfo.status] || { text: 'Unknown Status | t!help', type: 'WATCHING' };
    
    discord.user.setActivity(statusInfo.text, { type: statusInfo.type });
    console.log(`🎯 Bot status updated: ${statusInfo.text}`);
    
  } catch (err) {
    console.error("❌ Failed to update bot status:", err.message);
    // Fallback to default status
    discord.user.setActivity('Latest News from APG | t!help', { type: 'WATCHING' });
  }
}
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

discord.once("ready", async () => {
  console.log(`✅ Logged in as ${discord.user.tag}`);

  // Set custom bot status
  try {
    // Option 1: Simple status
    discord.user.setActivity('APG Server | t!help', { type: 'WATCHING' });
    
    // Option 2: Dynamic status based on server status (uncomment to use)
    await updateBotStatus();
    
    console.log("🎯 Bot status set successfully");
  } catch (err) {
    console.error("❌ Failed to set bot status:", err.message);
  }

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
      const lancerImageUrl = "https://imgur.com/a/kZvXA1P"; // Replace with actual image URL
      
      const embed = new EmbedBuilder()
        .setTitle("LANCER STATUS CHECK (AKA THE GOAT)")
        .setDescription("**Lancer Status: ALIVE**")
        .setColor(0x00ff00)
        .setImage(lancerImageUrl)
        .setTimestamp()
        .setFooter({ text: "TestificateInfo Bot" });
      
      // If you don't have a hosted image, we'll just send text
      message.reply("**LANCER STATUS: ALIVE**");
      
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
        { name: "❓ t!help", value: "show dis mesage", inline: false }
      )
      .setTimestamp()
      .setFooter({ text: "TestificateInfo Bot" });

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

setInterval(async () => {
      if (process.env.DYNAMIC_STATUS === 'true') {
        await updateBotStatus();
      }
    }, 2 * 60 * 1000); // 2 minutes

discord.login(process.env.DISCORD_TOKEN);
