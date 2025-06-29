require('dotenv').config();
const { Client: ExarotonClient } = require('exaroton');
const { Client: DiscordClient, GatewayIntentBits, VoiceChannel } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const express = require('express');
const fs = require('fs');
const path = require('path');
// Use dynamic import for node-fetch instead of require
let fetch;

// Create Express app for keep-alive
const app = express();
const PORT = process.env.PORT || 3000;

// Keep-alive endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'Bot is running!',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    botStatus: discord.user ? `Logged in as ${discord.user.tag}` : 'Not logged in'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    discord: discord.user ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// Start the web server
app.listen(PORT, () => {
  console.log(`🌐 Keep-alive server running on port ${PORT}`);
});

// Webhook keep-alive function
const WEBHOOK_URL = process.env.WEBHOOK;

async function pingWebhook(message) {
  if (!WEBHOOK_URL) {
    console.log('⚠️ No webhook URL configured');
    return;
  }

  try {
    if (!fetch) {
      const { default: nodeFetch } = await import('node-fetch');
      fetch = nodeFetch;
    }

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: message,
        username: 'TestificateInfo Keep-Alive'
      })
    });

    if (response.ok) {
      console.log(`✅ Webhook ping successful: ${message}`);
    } else {
      console.log(`❌ Webhook ping failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Webhook ping error: ${error.message}`);
  }
}

// Text-to-Speech function using Google TTS API (free)
async function generateTTS(text, filename) {
  try {
    if (!fetch) {
      const { default: nodeFetch } = await import('node-fetch');
      fetch = nodeFetch;
    }

    // Using Google Translate TTS (free, no API key needed)
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(text)}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`TTS API error: ${response.status}`);
    }

    const buffer = await response.buffer();
    fs.writeFileSync(filename, buffer);
    return true;
  } catch (error) {
    console.error('❌ TTS generation failed:', error);
    return false;
  }
}

// Voice connection storage
const voiceConnections = new Map();

// Initialize fetch and start the bot
async function initializeBot() {
  try {
    const { default: nodeFetch } = await import('node-fetch');
    fetch = nodeFetch;
    
    await pingWebhook(`🚀 TestificateInfo bot started at ${new Date().toISOString()}`);

    setInterval(() => {
      const now = new Date().toISOString();
      pingWebhook(`🏓 Keep-alive ping - ${now}`);
    }, 5 * 60 * 1000);

  } catch (error) {
    console.error('❌ Failed to initialize fetch:', error);
  }
}

const exa = new ExarotonClient(process.env.EXAROTON_TOKEN);
const discord = new DiscordClient({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates // Added for voice functionality
  ]
});

discord.once('ready', async () => {
  console.log(`✅ Logged in as ${discord.user.tag}`);

  // Test server connection on startup
  try {
    const server = exa.server(process.env.EXAROTON_SERVER_ID);
    const serverInfo = await server.get();
    const statusMap = {
      0: 'offline', 1: 'online', 2: 'starting', 3: 'stopping',
      4: 'restarting', 5: 'saving', 6: 'loading', 7: 'crashed'
    };
    const readableStatus = statusMap[serverInfo.status] || `unknown (${serverInfo.status})`;
    console.log(`🔗 Connected to server: ${serverInfo.name} (Status: ${readableStatus})`);
  } catch (err) {
    console.error('❌ Failed to connect to Exaroton server on startup:', err.message);
  }
});

discord.on('messageCreate', async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // EXISTING TIME COMMAND
  if (message.content === 't!time') {
    console.log('🕐 Time command received');

    if (!process.env.EXAROTON_SERVER_ID || !process.env.EXAROTON_TOKEN) {
      console.error('❌ Missing environment variables');
      return message.reply('❌ Bot configuration error: Missing server credentials.');
    }

    const server = exa.server(process.env.EXAROTON_SERVER_ID);

    try {
      const serverInfo = await server.get();
      console.log(`📊 Server status: ${serverInfo.status}`);

      const statusMap = {
        0: 'offline', 1: 'online', 2: 'starting', 3: 'stopping',
        4: 'restarting', 5: 'saving', 6: 'loading', 7: 'crashed'
      };

      const readableStatus = statusMap[serverInfo.status] || `unknown (${serverInfo.status})`;
      console.log(`📊 Readable status: ${readableStatus}`);

      if (serverInfo.status !== 1) {
        return message.reply(`⚠️ Server is currently **${readableStatus}**. The server must be online to check the time.`);
      }

      console.log('⚡ Executing time command...');
      await server.executeCommand('time query day');
      console.log('⌛ Command sent. Waiting for output...');

      setTimeout(async () => {
        try {
          console.log('🔍 Attempting to fetch server logs...');
          const logs = await server.getLogs();

          console.log('📝 Server logs received');
          console.log('📊 Logs structure:', {
            hasContent: !!logs,
            contentType: typeof logs,
            contentLength: logs ? logs.length : 0
          });

          if (!logs || logs.length === 0) {
            console.log('⚠️ No server logs available');
            return message.reply('⚠️ No server logs available. The server might not be generating logs or may need to be restarted.');
          }

          console.log('🔍 Recent log content (last 500 chars):');
          console.log(logs.slice(-500));

          const timeMatch = logs.match(/\[.*?\] \[.*?\]: The time is (\d+)/);

          if (timeMatch) {
            const day = timeMatch[1];
            console.log(`✅ Found day: ${day}`);
            message.reply(`*TESTIFICATE INFO:* Dzień na APG: **${day}**`);
          } else {
            console.log('⚠️ No "The time is" found in logs');

            const broadTimeMatch = logs.match(/The time is (\d+)/);
            if (broadTimeMatch) {
              const day = broadTimeMatch[1];
              console.log(`✅ Found day with broad search: ${day}`);
              message.reply(`*TESTIFICATE INFO:* Dzień na APG: **${day}**`);
            } else {
              const recentLogs = logs.split('\n').slice(-10).join('\n');
              console.log('⚠️ Recent log lines:', recentLogs);
              message.reply('⚠️ Could not find "The time is" in server logs. The command may not have executed or the server may be too busy. Try again in a moment.');
            }
          }
        } catch (logsErr) {
          console.error('❌ Detailed logs error:', {
            message: logsErr.message,
            stack: logsErr.stack,
            name: logsErr.name
          });

          if (logsErr.message.includes('403')) {
            message.reply('❌ Permission denied when accessing logs. Check if your API token has log access permissions.');
          } else if (logsErr.message.includes('404')) {
            message.reply('❌ Server logs not found. The server might not have any logs yet.');
          } else if (logsErr.message.includes('loading') || logsErr.message.includes('stopping') || logsErr.message.includes('saving')) {
            message.reply('⚠️ Cannot access logs while server is loading, stopping, or saving. Try again when the server is fully online.');
          } else {
            message.reply(`❌ Error retrieving server logs: ${logsErr.message}`);
          }
        }
      }, 5000);

    } catch (err) {
      console.error('❌ Error with server operation:', err.message);

      if (err.message.includes('404')) {
        message.reply('❌ Server not found. Please check the server ID configuration.');
      } else if (err.message.includes('403')) {
        message.reply('❌ Access denied. Please check the API token permissions.');
      } else if (err.message.includes('401')) {
        message.reply('❌ Authentication failed. Please check the API token.');
      } else {
        message.reply('❌ Failed to retrieve server information. Please try again later.');
      }
    }
  }

  // NEW VOICE COMMANDS
  
  // Join voice channel command
  if (message.content === 't!join') {
    console.log('🎤 Join voice command received');

    // Check if user is in a voice channel
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      return message.reply('❌ You need to be in a voice channel first!');
    }

    // Check if bot has permissions
    if (!voiceChannel.permissionsFor(discord.user).has(['Connect', 'Speak'])) {
      return message.reply('❌ I need permission to connect and speak in that voice channel!');
    }

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      voiceConnections.set(message.guild.id, connection);

      connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('✅ Voice connection ready');
        message.reply(`✅ Joined **${voiceChannel.name}**!`);
      });

      connection.on(VoiceConnectionStatus.Disconnected, () => {
        console.log('❌ Voice connection disconnected');
        voiceConnections.delete(message.guild.id);
      });

    } catch (error) {
      console.error('❌ Error joining voice channel:', error);
      message.reply('❌ Failed to join voice channel. Please try again.');
    }
  }

  // Leave voice channel command
  if (message.content === 't!leave') {
    console.log('👋 Leave voice command received');

    const connection = voiceConnections.get(message.guild.id);
    if (!connection) {
      return message.reply('❌ I\'m not in a voice channel!');
    }

    try {
      connection.destroy();
      voiceConnections.delete(message.guild.id);
      message.reply('✅ Left the voice channel!');
    } catch (error) {
      console.error('❌ Error leaving voice channel:', error);
      message.reply('❌ Failed to leave voice channel.');
    }
  }

  // Speak command
  if (message.content.startsWith('t!say ')) {
    console.log('🗣️ Say command received');

    const connection = voiceConnections.get(message.guild.id);
    if (!connection) {
      return message.reply('❌ I need to be in a voice channel first! Use `t!join` to make me join your channel.');
    }

    const textToSay = message.content.slice(6); // Remove 't!say '
    if (!textToSay.trim()) {
      return message.reply('❌ Please provide text to say! Example: `t!say Hello everyone!`');
    }

    // Limit text length
    if (textToSay.length > 200) {
      return message.reply('❌ Text is too long! Please keep it under 200 characters.');
    }

    try {
      const filename = path.join(__dirname, `tts_${Date.now()}.mp3`);
      
      message.reply('🔄 Generating speech...');
      
      const success = await generateTTS(textToSay, filename);
      if (!success) {
        return message.reply('❌ Failed to generate speech. Please try again.');
      }

      const resource = createAudioResource(filename);
      const player = createAudioPlayer();

      player.play(resource);
      connection.subscribe(player);

      player.on(AudioPlayerStatus.Playing, () => {
        console.log('🎵 Audio playing');
        message.channel.send('🗣️ Speaking...');
      });

      player.on(AudioPlayerStatus.Idle, () => {
        console.log('🎵 Audio finished');
        // Clean up the file after playing
        fs.unlink(filename, (err) => {
          if (err) console.error('Failed to delete TTS file:', err);
        });
      });

      player.on('error', (error) => {
        console.error('❌ Audio player error:', error);
        message.reply('❌ Error playing audio.');
        // Clean up the file on error
        fs.unlink(filename, (err) => {
          if (err) console.error('Failed to delete TTS file:', err);
        });
      });

    } catch (error) {
      console.error('❌ Error with TTS:', error);
      message.reply('❌ Failed to generate or play speech. Please try again.');
    }
  }

  // Help command
  if (message.content === 't!help') {
    const helpEmbed = {
      color: 0x0099ff,
      title: '🤖 TestificateInfo Bot Commands',
      description: 'Here are all available commands:',
      fields: [
        {
          name: '🕐 Server Commands',
          value: '`t!time` - Get current day on APG server',
          inline: false
        },
        {
          name: '🎤 Voice Commands',
          value: '`t!join` - Join your voice channel\n`t!leave` - Leave voice channel\n`t!say <text>` - Make me speak text (max 200 chars)',
          inline: false
        },
        {
          name: '❓ Other Commands',
          value: '`t!help` - Show this help message',
          inline: false
        }
      ],
      footer: {
        text: 'TestificateInfo Bot • Use commands in any text channel'
      }
    };

    message.reply({ embeds: [helpEmbed] });
  }
});

// Initialize the bot
initializeBot();

discord.login(process.env.DISCORD_TOKEN);
