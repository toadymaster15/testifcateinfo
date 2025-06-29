require("dotenv").config();
const { Client: ExarotonClient } = require("exaroton");
const { Client: DiscordClient, GatewayIntentBits } = require("discord.js");
const express = require("express");
// Use dynamic import for node-fetch instead of require
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

discord.once("ready", async () => {
  console.log(`✅ Logged in as ${discord.user.tag}`);

  // Test server connection on startup
  try {
    const server = exa.server(process.env.EXAROTON_SERVER_ID);
    const serverInfo = await server.get();
    const statusMap = {
      0: "offline",
      1: "online",
      2: "starting",
      3: "stopping",
      4: "restarting",
      5: "saving",
      6: "loading",
      7: "crashed",
    };
    const readableStatus =
      statusMap[serverInfo.status] || `unknown (${serverInfo.status})`;
    console.log(
      `🔗 Connected to server: ${serverInfo.name} (Status: ${readableStatus})`,
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

  // Check if message is the time command
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

      // Convert numeric status to readable format
      const statusMap = {
        0: "offline",
        1: "online",
        2: "starting",
        3: "stopping",
        4: "restarting",
        5: "saving",
        6: "loading",
        7: "crashed",
      };

      const readableStatus =
        statusMap[serverInfo.status] || `unknown (${serverInfo.status})`;
      console.log(`📊 Readable status: ${readableStatus}`);

      if (serverInfo.status !== 1) {
        // 1 = online
        return message.reply(
          `⚠️ Server is currently **${readableStatus}**. The server must be online to check the time.`,
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

discord.login(process.env.DISCORD_TOKEN);
