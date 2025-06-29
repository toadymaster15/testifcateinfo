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

// FIXED: Better command processing to prevent duplicates
const activeCommands = new Map(); // Track active commands per user
const commandCooldowns = new Map(); // Cooldown system

// FIXED: Simplified Music Queue System
class MusicQueue {
  constructor() {
    this.songs = [];
    this.isPlaying = false;
    this.currentSong = null;
    this.player = null;
    this.connection = null;
    this.textChannel = null;
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
    this.isPlaying = false;
    // FIXED: Properly clean up player
    if (this.player) {
      this.player.removeAllListeners();
      this.player.stop();
    }
  }

  isEmpty() {
    return this.songs.length === 0;
  }
}

const musicQueues = new Map();

// FIXED: Better video info function with YouTube bot detection workaround
async function getVideoInfo(query) {
  try {
    console.log(`🔍 Searching for: ${query}`);
    
    // Always search first to avoid direct YouTube API calls when possible
    if (!ytdl.validateURL(query)) {
      console.log('🔍 Searching YouTube...');
      const searchResults = await ytSearch(query);
      
      if (!searchResults.videos || searchResults.videos.length === 0) {
        console.log('❌ No search results found');
        return null;
      }

      const video = searchResults.videos[0];
      return {
        title: video.title,
        url: video.url,
        duration: video.duration?.seconds || 0,
        thumbnail: video.thumbnail || null
      };
    } else {
      // For direct URLs, try to get info with multiple fallbacks
      console.log('📺 Processing YouTube URL...');
      
      // Enhanced user agents that work better with YouTube
      const agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0'
      ];
      
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        try {
          console.log(`🔄 Trying method ${i + 1}/${agents.length} with agent: ${agent.substring(0, 50)}...`);
          
          const headers = {
            'User-Agent': agent,
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'Upgrade-Insecure-Requests': '1'
          };

          // Add cookies if available
          if (process.env.YOUTUBE_COOKIES) {
            headers['Cookie'] = process.env.YOUTUBE_COOKIES;
            console.log('🍪 Using cookies for authentication');
          }

          const info = await ytdl.getInfo(query, {
            requestOptions: {
              headers: headers,
              timeout: 30000
            }
          });
          
          console.log('✅ Successfully got video info with cookies/agent');
          return {
            title: info.videoDetails.title,
            url: query,
            duration: parseInt(info.videoDetails.lengthSeconds),
            thumbnail: info.videoDetails.thumbnails?.[0]?.url || null
          };
        } catch (err) {
          console.log(`❌ Failed with method ${i + 1}: ${err.message}`);
          
          // If this is the last attempt, wait a bit before trying next method
          if (i < agents.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      // If all direct methods fail, try to extract video ID and search for it
      const videoIdMatch = query.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      if (videoIdMatch) {
        const videoId = videoIdMatch[1];
        console.log(`🆔 All direct methods failed. Extracted video ID: ${videoId}, searching instead...`);
        
        // Search for the video by ID (this often works when direct access fails)
        const searchResults = await ytSearch(videoId);
        if (searchResults.videos && searchResults.videos.length > 0) {
          const video = searchResults.videos[0];
          return {
            title: video.title,
            url: video.url,
            duration: video.duration?.seconds || 0,
            thumbnail: video.thumbnail || null
          };
        }
      }
      
      throw new Error('All methods failed to get video info');
    }
  } catch (error) {
    console.error('❌ Error getting video info:', error.message);
    return null;
  }
}
// FIXED: Much cleaner playMusic function
async function playMusic(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue || queue.isEmpty()) {
    if (queue) {
      queue.isPlaying = false;
      console.log('🎵 Queue empty, stopping playback');
    }
    return;
  }

  const song = queue.getNextSong();
  if (!song) return;

  queue.currentSong = song;
  queue.isPlaying = true;

  try {
    console.log(`🎵 Now playing: ${song.title}`);
    
    // FIXED: Anti-bot detection ytdl stream options
    const ytdlOptions = {
  filter: 'audioonly',
  quality: 'lowestaudio',
  highWaterMark: 1024 * 512,
  requestOptions: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="122", "Google Chrome";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Upgrade-Insecure-Requests': '1',
      // Add referer to look more legitimate
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com'
    },
    timeout: 30000
  },
  begin: 0,
  lang: 'en'
};

// Add cookies if available
if (process.env.YOUTUBE_COOKIES) {
  ytdlOptions.requestOptions.headers['Cookie'] = process.env.YOUTUBE_COOKIES;
  console.log('🍪 Using authenticated cookies for stream');
}

    const resource = createAudioResource(stream, {
      inputType: 'arbitrary',
      inlineVolume: true
    });

    // Set reasonable volume
    if (resource.volume) {
      resource.volume.setVolume(0.3);
    }

    // FIXED: Create new player for each song to avoid listener conflicts
    queue.player = createAudioPlayer();
    
    // FIXED: Single event listener setup
    queue.player.once(AudioPlayerStatus.Idle, () => {
      console.log('🎵 Song finished');
      // Small delay to prevent rapid-fire
      setTimeout(() => playMusic(guildId), 500);
    });

    queue.player.once('error', (error) => {
      console.error('❌ Player error:', error.message);
      if (queue.textChannel) {
        queue.textChannel.send('❌ Audio error, skipping song...').catch(console.error);
      }
      setTimeout(() => playMusic(guildId), 500);
    });

    queue.player.play(resource);

    if (queue.connection) {
      queue.connection.subscribe(queue.player);
    }

    // Send now playing message
    if (queue.textChannel) {
      const embed = {
        color: 0x00ff00,
        title: '🎵 Now Playing',
        description: `**${song.title}**`,
        thumbnail: song.thumbnail ? { url: song.thumbnail } : undefined,
        footer: {
          text: `Duration: ${Math.floor(song.duration / 60)}:${(song.duration % 60).toString().padStart(2, '0')}`
        }
      };
      
      queue.textChannel.send({ embeds: [embed] }).catch(console.error);
    }

  } catch (error) {
    console.error('❌ Error in playMusic:', error.message);
    if (queue.textChannel) {
      queue.textChannel.send(`❌ Failed to play: ${song.title}`).catch(console.error);
    }
    // Try next song
    setTimeout(() => playMusic(guildId), 500);
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

  // FIXED: Better duplicate command prevention
  const commandKey = `${message.author.id}-${message.content.split(' ')[0]}`;
  const now = Date.now();
  
  // Check if user is on cooldown for this command
  if (commandCooldowns.has(commandKey)) {
    const cooldownEnd = commandCooldowns.get(commandKey);
    if (now < cooldownEnd) {
      console.log(`⏳ User ${message.author.tag} on cooldown for ${message.content.split(' ')[0]}`);
      return;
    }
  }

  // Set cooldown (1 second for most commands, 3 seconds for music)
  const cooldownTime = message.content.startsWith('t!play') ? 3000 : 1000;
  commandCooldowns.set(commandKey, now + cooldownTime);

  // Clean up old cooldowns
  setTimeout(() => commandCooldowns.delete(commandKey), cooldownTime);

  // EXISTING TIME COMMAND (unchanged)
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

  // FIXED MUSIC COMMANDS

  // Join voice channel
  if (message.content === 't!join') {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      return message.reply('❌ You need to be in a voice channel first!');
    }

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });

      // Initialize music queue
      const queue = new MusicQueue();
      queue.connection = connection;
      queue.textChannel = message.channel;
      musicQueues.set(message.guild.id, queue);

      connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('✅ Voice connection ready');
        message.reply(`✅ Joined **${voiceChannel.name}**!`);
      });

      connection.on(VoiceConnectionStatus.Disconnected, () => {
        console.log('❌ Voice connection disconnected');
        const queue = musicQueues.get(message.guild.id);
        if (queue) {
          queue.clear();
          musicQueues.delete(message.guild.id);
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
      const queue = musicQueues.get(message.guild.id);
      if (queue) {
        queue.clear();
        musicQueues.delete(message.guild.id);
      }

      message.reply('✅ Left the voice channel!');
    } catch (error) {
      console.error('❌ Error leaving voice channel:', error);
      message.reply('❌ Failed to leave voice channel.');
    }
  }

  // FIXED: Play music command
  if (message.content.startsWith('t!play ')) {
    const connection = getVoiceConnection(message.guild.id);
    if (!connection) {
      return message.reply('❌ I need to be in a voice channel first! Use `t!join`');
    }

    const query = message.content.slice(7).trim();
    if (!query) {
      return message.reply('❌ Please provide a song name or YouTube URL!');
    }

    const searchMessage = await message.reply('🔍 Searching...');

    try {
      const videoInfo = await getVideoInfo(query);
      if (!videoInfo) {
        return searchMessage.edit('❌ No results found!');
      }

      // Duration check
      if (videoInfo.duration > 600) {
        return searchMessage.edit('❌ Song too long! (Max 10 minutes)');
      }

      // Get queue
      let queue = musicQueues.get(message.guild.id);
      if (!queue) {
        queue = new MusicQueue();
        queue.connection = connection;
        queue.textChannel = message.channel;
        musicQueues.set(message.guild.id, queue);
      }

      queue.addSong(videoInfo);

      const embed = {
        color: 0x0099ff,
        title: '✅ Added to Queue',
        description: `**${videoInfo.title}**`,
        thumbnail: videoInfo.thumbnail ? { url: videoInfo.thumbnail } : undefined,
        fields: [
          { name: 'Position', value: `${queue.songs.length}`, inline: true },
          { name: 'Duration', value: `${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toString().padStart(2, '0')}`, inline: true }
        ]
      };

      await searchMessage.edit({ content: '', embeds: [embed] });

      // Start playing if not already playing
      if (!queue.isPlaying) {
        playMusic(message.guild.id);
      }

    } catch (error) {
      console.error('❌ Error in play command:', error);
      searchMessage.edit('❌ Failed to play music. Try again!');
    }
  }

  // Skip song
  if (message.content === 't!skip') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue || !queue.isPlaying) {
      return message.reply('❌ Nothing is playing!');
    }

    if (queue.player) {
      queue.player.stop();
      message.reply('⏭️ Skipped!');
    }
  }

  // Stop music
  if (message.content === 't!stop') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue || !queue.isPlaying) {
      return message.reply('❌ Nothing is playing!');
    }

    queue.clear();
    message.reply('⏹️ Stopped music!');
  }

  // Show queue
  if (message.content === 't!queue') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue || (queue.isEmpty() && !queue.currentSong)) {
      return message.reply('❌ Queue is empty!');
    }

    let description = '';
    
    if (queue.currentSong) {
      description += `**🎵 Now Playing:**\n${queue.currentSong.title}\n\n`;
    }

    if (!queue.isEmpty()) {
      description += `**📝 Up Next:**\n`;
      queue.songs.slice(0, 5).forEach((song, index) => {
        description += `${index + 1}. ${song.title}\n`;
      });

      if (queue.songs.length > 5) {
        description += `... and ${queue.songs.length - 5} more`;
      }
    }

    const embed = {
      color: 0x9932cc,
      title: '🎵 Music Queue',
      description: description || 'Queue is empty',
      footer: { text: `Total songs: ${queue.songs.length}` }
    };

    message.reply({ embeds: [embed] });
  }

  // Help command
  if (message.content === 't!help') {
    const embed = {
      color: 0x0099ff,
      title: '🤖 TestificateInfo Bot',
      fields: [
        {
          name: '🕐 Server',
          value: '`t!time` - Check server day',
          inline: false
        },
        {
          name: '🎵 Music',
          value: '`t!join` - Join voice channel\n`t!leave` - Leave voice channel\n`t!play <song>` - Play music\n`t!skip` - Skip song\n`t!stop` - Stop music\n`t!queue` - Show queue',
          inline: false
        }
      ]
    };

    message.reply({ embeds: [embed] });
  }
});

// Initialize and start
initializeBot();
discord.login(process.env.DISCORD_TOKEN);
