require('dotenv').config();
const { Client: ExarotonClient } = require('exaroton');
const { Client: DiscordClient, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');
const express = require('express');
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

// Music queue system
const musicQueues = new Map();
const processingCommands = new Set(); // Prevent duplicate command processing

class MusicQueue {
  constructor() {
    this.songs = [];
    this.isPlaying = false;
    this.currentSong = null;
    this.player = null;
    this.connection = null;
  }

  addSong(song) {
    this.songs.push(song);
  }

  getNextSong() {
    return this.songs.shift();
  }

  clear() {
    this.songs = [];
    this.currentSong = null;
  }

  isEmpty() {
    return this.songs.length === 0;
  }
}

// Get video info from YouTube with better error handling
async function getVideoInfo(query) {
  try {
    // Check if it's a YouTube URL
    if (ytdl.validateURL(query)) {
      const info = await ytdl.getInfo(query);
      return {
        title: info.videoDetails.title,
        url: query,
        duration: parseInt(info.videoDetails.lengthSeconds),
        thumbnail: info.videoDetails.thumbnails[0]?.url
      };
    } else {
      // Search for the video
      const searchResults = await ytSearch(query);
      if (searchResults.videos.length === 0) {
        return null;
      }

      const video = searchResults.videos[0];
      return {
        title: video.title,
        url: video.url,
        duration: video.duration.seconds,
        thumbnail: video.thumbnail
      };
    }
  } catch (error) {
    console.error('❌ Error getting video info:', error);
    return null;
  }
}

// Enhanced play music function with better error handling and fixed deafening
async function playMusic(guildId, textChannel) {
  const queue = musicQueues.get(guildId);
  if (!queue || queue.isEmpty()) {
    if (queue) queue.isPlaying = false;
    return;
  }

  const song = queue.getNextSong();
  if (!song) return;

  queue.currentSong = song;
  queue.isPlaying = true;

  try {
    console.log(`🎵 Playing: ${song.title}`);
    
    // Create ytdl stream with optimized options for Render.com
    const stream = ytdl(song.url, {
      filter: 'audioonly',
      quality: 'lowestaudio',
      highWaterMark: 1024 * 1024 * 16, // Optimized buffer for Render's resources
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    });

    // Create audio resource with proper settings to prevent deafening
    const resource = createAudioResource(stream, {
      inputType: 'arbitrary',
      inlineVolume: true
    });

    // Set volume to prevent deafening (50% volume)
    if (resource.volume) {
      resource.volume.setVolume(0.5);
    }

    if (!queue.player) {
      queue.player = createAudioPlayer();
    }

    // Clean up previous player listeners to prevent duplicates
    queue.player.removeAllListeners();

    queue.player.play(resource);

    if (queue.connection) {
      queue.connection.subscribe(queue.player);
    }

    // Send now playing message only once
    const nowPlayingEmbed = {
      color: 0x00ff00,
      title: '🎵 Now Playing',
      description: `**${song.title}**`,
      thumbnail: {
        url: song.thumbnail || 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
      },
      footer: {
        text: `Duration: ${Math.floor(song.duration / 60)}:${(song.duration % 60).toString().padStart(2, '0')}`
      }
    };

    textChannel.send({ embeds: [nowPlayingEmbed] }).catch(console.error);

    // Handle player events (set only once)
    queue.player.once(AudioPlayerStatus.Idle, () => {
      console.log('🎵 Song finished, playing next...');
      setTimeout(() => playMusic(guildId, textChannel), 1000); // Small delay to prevent rapid firing
    });

    queue.player.once('error', (error) => {
      console.error('❌ Audio player error:', error);
      textChannel.send('❌ Error playing audio. Skipping to next song...').catch(console.error);
      setTimeout(() => playMusic(guildId, textChannel), 1000);
    });

    // Handle stream errors
    stream.on('error', (error) => {
      console.error('❌ Stream error:', error);
      textChannel.send('❌ Error with audio stream. Skipping to next song...').catch(console.error);
      setTimeout(() => playMusic(guildId, textChannel), 1000);
    });

  } catch (error) {
    console.error('❌ Error playing music:', error);
    textChannel.send(`❌ Error playing **${song.title}**. Skipping to next song...`).catch(console.error);
    setTimeout(() => playMusic(guildId, textChannel), 1000);
  }
}

// Initialize fetch and start the bot
async function initializeBot() {
  try {
    const { default: nodeFetch } = await import('node-fetch');
    fetch = nodeFetch;
    
    await pingWebhook(`🚀 TestificateInfo bot started at ${new Date().toISOString()}`);

    // Ping every 5 minutes to keep Render service alive
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
    GatewayIntentBits.GuildVoiceStates
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

  // Prevent duplicate command processing
  const commandKey = `${message.author.id}-${message.content}-${Date.now()}`;
  if (processingCommands.has(commandKey)) return;
  processingCommands.add(commandKey);
  
  // Clean up old command keys after 5 seconds
  setTimeout(() => processingCommands.delete(commandKey), 5000);

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

          if (!logs || logs.length === 0) {
            console.log('⚠️ No server logs available');
            return message.reply('⚠️ No server logs available. The server might not be generating logs or may need to be restarted.');
          }

          const timeMatch = logs.match(/\[.*?\] \[.*?\]: The time is (\d+)/);

          if (timeMatch) {
            const day = timeMatch[1];
            console.log(`✅ Found day: ${day}`);
            message.reply(`*TESTIFICATE INFO:* Dzień na APG: **${day}**`);
          } else {
            const broadTimeMatch = logs.match(/The time is (\d+)/);
            if (broadTimeMatch) {
              const day = broadTimeMatch[1];
              console.log(`✅ Found day with broad search: ${day}`);
              message.reply(`*TESTIFICATE INFO:* Dzień na APG: **${day}**`);
            } else {
              message.reply('⚠️ Could not find "The time is" in server logs. The command may not have executed or the server may be too busy. Try again in a moment.');
            }
          }
        } catch (logsErr) {
          console.error('❌ Detailed logs error:', logsErr.message);
          message.reply(`❌ Error retrieving server logs: ${logsErr.message}`);
        }
      }, 5000);

    } catch (err) {
      console.error('❌ Error with server operation:', err.message);
      message.reply('❌ Failed to retrieve server information. Please try again later.');
    }
  }

  // MUSIC COMMANDS

  // Join voice channel - Fixed deafening issue
  if (message.content === 't!join') {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      return message.reply('❌ You need to be in a voice channel first!');
    }

    if (!voiceChannel.permissionsFor(discord.user).has(['Connect', 'Speak'])) {
      return message.reply('❌ I need permission to connect and speak in that voice channel!');
    }

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false, // This fixes the deafening issue!
        selfMute: false
      });

      // Initialize music queue for this guild
      if (!musicQueues.has(message.guild.id)) {
        musicQueues.set(message.guild.id, new MusicQueue());
      }

      const queue = musicQueues.get(message.guild.id);
      queue.connection = connection;

      connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('✅ Voice connection ready');
        message.reply(`✅ Joined **${voiceChannel.name}**! Use \`t!play <song>\` to play music!`);
      });

      connection.on(VoiceConnectionStatus.Disconnected, () => {
        console.log('❌ Voice connection disconnected');
        if (queue) {
          queue.clear();
          queue.isPlaying = false;
        }
      });

    } catch (error) {
      console.error('❌ Error joining voice channel:', error);
      message.reply('❌ Failed to join voice channel. Please try again.');
    }
  }

  // Leave voice channel
  if (message.content === 't!leave') {
    const connection = getVoiceConnection(message.guild.id);
    if (!connection) {
      return message.reply('❌ I\'m not in a voice channel!');
    }

    try {
      connection.destroy();
      
      // Clean up music queue
      if (musicQueues.has(message.guild.id)) {
        const queue = musicQueues.get(message.guild.id);
        if (queue.player) {
          queue.player.removeAllListeners();
          queue.player.stop();
        }
        queue.clear();
        queue.isPlaying = false;
        musicQueues.delete(message.guild.id);
      }

      message.reply('✅ Left the voice channel and cleared the music queue!');
    } catch (error) {
      console.error('❌ Error leaving voice channel:', error);
      message.reply('❌ Failed to leave voice channel.');
    }
  }

  // Play music with enhanced error handling
  if (message.content.startsWith('t!play ')) {
    const connection = getVoiceConnection(message.guild.id);
    if (!connection) {
      return message.reply('❌ I need to be in a voice channel first! Use `t!join` to make me join your channel.');
    }

    const query = message.content.slice(7).trim(); // Remove 't!play '
    if (!query) {
      return message.reply('❌ Please provide a song name or YouTube URL!\nExample: `t!play Low Taper Gang`');
    }

    const searchMessage = await message.reply('🔍 Searching for music...');

    try {
      const videoInfo = await getVideoInfo(query);
      if (!videoInfo) {
        return searchMessage.edit('❌ No music found for that search. Try a different query.');
      }

      // Check video duration (limit to 10 minutes to prevent abuse)
      if (videoInfo.duration > 600) {
        return searchMessage.edit('❌ Song is too long! Please choose a song under 10 minutes.');
      }

      // Get or create music queue
      if (!musicQueues.has(message.guild.id)) {
        musicQueues.set(message.guild.id, new MusicQueue());
      }

      const queue = musicQueues.get(message.guild.id);
      queue.connection = connection;
      queue.addSong(videoInfo);

      const addedEmbed = {
        color: 0x0099ff,
        title: '✅ Added to Queue',
        description: `**${videoInfo.title}**`,
        thumbnail: {
          url: videoInfo.thumbnail || 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
        },
        fields: [
          {
            name: 'Position in Queue',
            value: `${queue.songs.length}`,
            inline: true
          },
          {
            name: 'Duration',
            value: `${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toString().padStart(2, '0')}`,
            inline: true
          }
        ]
      };

      await searchMessage.edit({ content: '', embeds: [addedEmbed] });

      // Start playing if not already playing
      if (!queue.isPlaying) {
        playMusic(message.guild.id, message.channel);
      }

    } catch (error) {
      console.error('❌ Error playing music:', error);
      searchMessage.edit('❌ Failed to play music. Please try again or use a different song.');
    }
  }

  // Skip current song
  if (message.content === 't!skip') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue || !queue.isPlaying) {
      return message.reply('❌ No music is currently playing!');
    }

    if (queue.player) {
      queue.player.stop();
      message.reply('⏭️ Skipped current song!');
    }
  }

  // Stop music and clear queue
  if (message.content === 't!stop') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue || !queue.isPlaying) {
      return message.reply('❌ No music is currently playing!');
    }

    queue.clear();
    queue.isPlaying = false;
    if (queue.player) {
      queue.player.removeAllListeners();
      queue.player.stop();
    }

    message.reply('⏹️ Stopped music and cleared the queue!');
  }

  // Show current queue
  if (message.content === 't!queue') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue || (queue.isEmpty() && !queue.currentSong)) {
      return message.reply('❌ The music queue is empty!');
    }

    let queueText = '';
    
    if (queue.currentSong) {
      queueText += `**Now Playing:**\n🎵 ${queue.currentSong.title}\n\n`;
    }

    if (!queue.isEmpty()) {
      queueText += `**Up Next:**\n`;
      queue.songs.slice(0, 10).forEach((song, index) => {
        queueText += `${index + 1}. ${song.title}\n`;
      });

      if (queue.songs.length > 10) {
        queueText += `... and ${queue.songs.length - 10} more songs`;
      }
    }

    const queueEmbed = {
      color: 0x9932cc,
      title: '🎵 Music Queue',
      description: queueText || 'Queue is empty',
      footer: {
        text: `Total songs in queue: ${queue.songs.length}`
      }
    };

    message.reply({ embeds: [queueEmbed] });
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
          value: '`t!time` - Dzień na APG',
          inline: false
        },
        {
          name: '🎵 Music Commands',
          value: '`t!join` - Join your voice channel\n`t!leave` - Leave voice channel\n`t!play <song>` - Play music from YouTube\n`t!skip` - Skip current song\n`t!stop` - Stop music and clear queue\n`t!queue` - Show current music queue',
          inline: false
        },
        {
          name: '❓ Other Commands',
          value: '`t!help` - Show this help message',
          inline: false
        }
      ],
      footer: {
        text: 'TestificateInfo Bot • You can use song names or YouTube URLs with t!play'
      }
    };

    message.reply({ embeds: [helpEmbed] });
  }
});

// Initialize the bot
initializeBot();

discord.login(process.env.DISCORD_TOKEN);
