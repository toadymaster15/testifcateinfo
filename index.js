require('dotenv').config();
const { Client: ExarotonClient } = require('exaroton');
const { Client: DiscordClient, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');
const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
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
    uptime: process.uptime(),
    ffmpeg: checkFFmpeg() ? 'available' : 'unavailable'
  });
});

// Check if FFmpeg is available
function checkFFmpeg() {
  try {
    exec('ffmpeg -version', (error) => {
      if (error) {
        console.log('⚠️ FFmpeg not found in PATH');
        return false;
      }
      console.log('✅ FFmpeg is available');
      return true;
    });
  } catch (error) {
    return false;
  }
}

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

// Command processing to prevent duplicates
const activeCommands = new Map();
const commandCooldowns = new Map();

// Simplified Music Queue System
class MusicQueue {
  constructor() {
    this.songs = [];
    this.isPlaying = false;
    this.currentSong = null;
    this.player = null;
    this.connection = null;
    this.textChannel = null;
    this.destroyed = false;
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
    this.destroyed = true;
    if (this.player) {
      try {
        this.player.removeAllListeners();
        this.player.stop();
      } catch (e) {
        console.log('Player cleanup error:', e.message);
      }
    }
  }

  isEmpty() {
    return this.songs.length === 0;
  }
}

const musicQueues = new Map();

// Simplified YTDL agent creation
function createYTDLAgent() {
  try {
    console.log('🔧 Creating YTDL agent...');
    
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    if (process.env.YOUTUBE_COOKIES) {
      try {
        let cookies = JSON.parse(process.env.YOUTUBE_COOKIES);
        console.log(`✅ Using ${cookies.length} cookies`);
        
        return ytdl.createAgent(cookies, {
          headers: {
            'User-Agent': userAgent,
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });
      } catch (parseError) {
        console.log('❌ Cookie parsing failed, using basic agent');
      }
    }

    return ytdl.createAgent([], {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

  } catch (error) {
    console.error('❌ Error creating agent:', error.message);
    return null;
  }
}

let ytdlAgent = null;

// Initialize agent
async function initializeYTDLAgent() {
  console.log('🚀 Initializing YTDL agent...');
  ytdlAgent = createYTDLAgent();
  
  if (ytdlAgent) {
    console.log('✅ YTDL agent created successfully');
  } else {
    console.log('❌ Failed to create YTDL agent');
  }
}

// Simplified video info function
async function getVideoInfo(query) {
  try {
    console.log(`🔍 Searching for: ${query}`);
    
    if (!ytdl.validateURL(query)) {
      console.log('🔍 Searching YouTube...');
      const searchResults = await ytSearch(query);
      
      if (!searchResults.videos || searchResults.videos.length === 0) {
        console.log('❌ No search results found');
        return null;
      }

      const video = searchResults.videos[0];
      
      if (!ytdl.validateURL(video.url)) {
        console.log('❌ Search returned invalid YouTube URL');
        return null;
      }

      return {
        title: video.title,
        url: video.url,
        duration: video.duration?.seconds || 0,
        thumbnail: video.thumbnail || null
      };
    } else {
      console.log('📺 Processing YouTube URL...');
      
      // Try to get basic info with minimal options
      try {
        const info = await ytdl.getInfo(query, {
          requestOptions: {
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          }
        });
        
        if (info && info.videoDetails) {
          return {
            title: info.videoDetails.title,
            url: query,
            duration: parseInt(info.videoDetails.lengthSeconds) || 0,
            thumbnail: info.videoDetails.thumbnails?.[0]?.url || null
          };
        }
      } catch (err) {
        console.log('❌ Failed to get video info, using search fallback');
        
        // Extract video ID and search for it
        const videoIdMatch = query.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        if (videoIdMatch) {
          const videoId = videoIdMatch[1];
          const searchResults = await ytSearch(videoId);
          
          if (searchResults.videos && searchResults.videos.length > 0) {
            const video = searchResults.videos[0];
            return {
              title: video.title,
              url: query,
              duration: video.duration?.seconds || 0,
              thumbnail: video.thumbnail || null
            };
          }
        }
      }
      
      throw new Error('Failed to get video information');
    }
  } catch (error) {
    console.error('❌ Error getting video info:', error.message);
    return null;
  }
}

// Completely rewritten audio stream creation with better error handling
async function createAudioStream(url) {
  console.log('🎵 Creating audio stream...');
  
  // Basic options that usually work
  const basicOptions = {
    filter: 'audioonly',
    quality: 'lowestaudio',
    requestOptions: {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    }
  };

  // Add agent if available
  if (ytdlAgent) {
    basicOptions.agent = ytdlAgent;
  }

  try {
    console.log('🔄 Attempting to create stream with basic options...');
    const stream = ytdl(url, basicOptions);
    
    // Test the stream
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Stream creation timeout'));
      }, 20000);

      stream.once('response', () => {
        clearTimeout(timeout);
        console.log('✅ Stream response received');
        resolve(stream);
      });

      stream.once('error', (err) => {
        clearTimeout(timeout);
        console.log('❌ Stream error:', err.message);
        reject(err);
      });

      // Start reading to trigger the response
      stream.once('readable', () => {
        if (!stream.destroyed) {
          clearTimeout(timeout);
          console.log('✅ Stream is readable');
          resolve(stream);
        }
      });
    });

  } catch (error) {
    console.error('❌ Failed to create audio stream:', error.message);
    throw error;
  }
}

// Completely rewritten playMusic function
async function playMusic(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue || queue.isEmpty() || queue.destroyed) {
    if (queue && !queue.destroyed) {
      queue.isPlaying = false;
      console.log('🎵 Queue empty, stopping playback');
    }
    return;
  }

  const song = queue.getNextSong();
  if (!song) return;

  queue.currentSong = song;
  queue.isPlaying = true;

  console.log(`🎵 Attempting to play: ${song.title}`);

  try {
    // Validate URL
    if (!ytdl.validateURL(song.url)) {
      throw new Error('Invalid YouTube URL');
    }

    // Create stream with timeout
    const streamPromise = createAudioStream(song.url);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Stream creation timeout after 25 seconds')), 25000);
    });

    const stream = await Promise.race([streamPromise, timeoutPromise]);

    if (queue.destroyed) {
      console.log('❌ Queue was destroyed during stream creation');
      return;
    }

    // Create audio resource
    const resource = createAudioResource(stream, {
      inputType: 'arbitrary',
      inlineVolume: true
    });

    if (resource.volume) {
      resource.volume.setVolume(0.5);
    }

    // Create player
    queue.player = createAudioPlayer();
    
    // Set up player event handlers
    queue.player.once(AudioPlayerStatus.Playing, () => {
      console.log('✅ Audio player started playing');
      
      if (queue.textChannel && !queue.destroyed) {
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
    });

    queue.player.once(AudioPlayerStatus.Idle, () => {
      console.log('🎵 Song finished, playing next...');
      if (!queue.destroyed) {
        setTimeout(() => playMusic(guildId), 1000);
      }
    });

    queue.player.once('error', (error) => {
      console.error('❌ Player error:', error.message);
      
      if (queue.textChannel && !queue.destroyed) {
        queue.textChannel.send(`❌ Playback error: ${error.message}`).catch(console.error);
      }
      
      if (!queue.destroyed) {
        setTimeout(() => playMusic(guildId), 2000);
      }
    });

    // Play the resource
    queue.player.play(resource);

    // Subscribe to connection
    if (queue.connection && queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      queue.connection.subscribe(queue.player);
      console.log('✅ Successfully started playing:', song.title);
    } else {
      throw new Error('Voice connection is not available');
    }

  } catch (error) {
    console.error('❌ Error in playMusic:', error.message);
    
    if (queue.textChannel && !queue.destroyed) {
      let errorMessage = `❌ Failed to play: **${song.title}**`;
      
      if (error.message.includes('Sign in to confirm') || error.message.includes('This video is unavailable')) {
        errorMessage += ' - Video is unavailable or restricted.';
      } else if (error.message.includes('timeout')) {
        errorMessage += ' - Request timed out. YouTube may be blocking requests.';
      } else if (error.message.includes('No such format found') || error.message.includes('formats')) {
        errorMessage += ' - No playable audio format found.';
      } else {
        errorMessage += ' - Please try a different song.';
      }
      
      queue.textChannel.send(errorMessage).catch(console.error);
    }
    
    // Try next song after delay
    if (!queue.destroyed) {
      setTimeout(() => playMusic(guildId), 3000);
    }
  }
}

// Initialize fetch and start the bot
async function initializeBot() {
  try {
    const { default: nodeFetch } = await import('node-fetch');
    fetch = nodeFetch;
    
    // Check FFmpeg availability
    checkFFmpeg();
    
    // Initialize YTDL agent
    await initializeYTDLAgent();
    
    await pingWebhook(`🚀 TestificateInfo bot started with fixed YouTube support at ${new Date().toISOString()}`);

    // Ping every 5 minutes
    setInterval(() => {
      const now = new Date().toISOString();
      pingWebhook(`🏓 Keep-alive ping - ${now}`);
    }, 5 * 60 * 1000);

  } catch (error) {
    console.error('❌ Failed to initialize bot:', error);
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

  // Improved duplicate command prevention
  const commandKey = `${message.author.id}-${message.content.split(' ')[0]}`;
  const now = Date.now();
  
  if (commandCooldowns.has(commandKey)) {
    const cooldownEnd = commandCooldowns.get(commandKey);
    if (now < cooldownEnd) {
      console.log(`⏳ User ${message.author.tag} on cooldown for ${message.content.split(' ')[0]}`);
      return;
    }
  }

  const cooldownTime = message.content.startsWith('t!play') ? 3000 : 1000;
  commandCooldowns.set(commandKey, now + cooldownTime);
  setTimeout(() => commandCooldowns.delete(commandKey), cooldownTime);

  // TIME COMMAND
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

  // Play music command - FIXED
  if (message.content.startsWith('t!play ')) {
    const connection = getVoiceConnection(message.guild.id);
    if (!connection) {
      return message.reply('❌ I need to be in a voice channel first! Use `t!join`');
    }

    const query = message.content.slice(7).trim();
    if (!query) {
      return message.reply('❌ Please provide a song name or YouTube URL!');
    }

    // Check if there's already an active play command for this user
    if (activeCommands.has(message.author.id)) {
      return message.reply('⏳ Please wait for your previous command to finish!');
    }

    activeCommands.set(message.author.id, true);
    const searchMessage = await message.reply('🔍 Searching...');

    try {
      console.log(`🔍 Processing play request: "${query}"`);
      
      const videoInfo = await getVideoInfo(query);
      if (!videoInfo) {
        return searchMessage.edit('❌ No results found! Try a different search term.');
      }

      console.log(`✅ Found video: ${videoInfo.title}`);

      // Duration check (15 minutes = 900 seconds)
      if (videoInfo.duration > 900) {
        return searchMessage.edit(`❌ Song too long! (${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toString().padStart(2, '0')} - Max 15:00)`);
      }

      if (!ytdl.validateURL(videoInfo.url)) {
        console.error('❌ Invalid YouTube URL received:', videoInfo.url);
        return searchMessage.edit('❌ Invalid YouTube URL. Please try again.');
      }

      let queue = musicQueues.get(message.guild.id);
      if (!queue || queue.destroyed) {
        console.log('🔄 Creating new music queue');
        queue = new MusicQueue();
        queue.connection = connection;
        queue.textChannel = message.channel;
        musicQueues.set(message.guild.id, queue);
      }

      if (queue.connection.state.status === VoiceConnectionStatus.Destroyed) {
        console.log('❌ Voice connection was destroyed, recreating...');
        return searchMessage.edit('❌ Voice connection lost. Please use `t!join` again.');
      }

      queue.addSong(videoInfo);
      console.log(`✅ Added to queue: ${videoInfo.title} (Position: ${queue.songs.length})`);

      const embed = {
        color: 0x0099ff,
        title: '✅ Added to Queue',
        description: `**${videoInfo.title}**`,
        thumbnail: videoInfo.thumbnail ? { url: videoInfo.thumbnail } : undefined,
        fields: [
          { name: 'Position', value: `${queue.songs.length}`, inline: true },
          { name: 'Duration', value: `${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toString().padStart(2, '0')}`, inline: true },
          { name: 'Requested by', value: message.author.username, inline: true }
        ]
      };

      await searchMessage.edit({ content: '', embeds: [embed] });

      if (!queue.isPlaying) {
        console.log('🎵 Starting playback (queue was empty)');
        playMusic(message.guild.id);
      } else {
        console.log('🎵 Added to existing queue (already playing)');
      }

    } catch (error) {
      console.error('❌ Error in play command:', error);
      
      let errorMessage = '❌ Failed to play music. ';
      
      if (error.message.includes('Sign in to confirm') || error.message.includes('This video is unavailable')) {
        errorMessage += 'This video is unavailable or restricted.';
      } else if (error.message.includes('timeout')) {
        errorMessage += 'Request timed out. YouTube may be blocking requests.';
      } else if (error.message.includes('formats') || error.message.includes('No such format')) {
        errorMessage += 'No playable audio format found. Try a different song.';
      } else {
        errorMessage += 'Please try again or use a different song.';
      }
      
      searchMessage.edit(errorMessage);
    } finally {
      // Always remove the active command flag
      activeCommands.delete(message.author.id);
    }
  }

  // Skip song
  if (message.content === 't!skip') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue || !queue.isPlaying || queue.destroyed) {
      return message.reply('❌ Nothing is playing!');
    }

    if (queue.player) {
      queue.player.stop();
      message.reply('⏭️ Skipped!');
    }
  }

  // Stop music - FIXED
  if (message.content === 't!stop') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue || !queue.isPlaying || queue.destroyed) {
      return message.reply('❌ Nothing is playing!');
    }

    console.log('🛑 Stopping music and clearing queue');
    queue.clear();
    musicQueues.delete(message.guild.id);
    message.reply('⏹️ Stopped music and cleared queue!');
  }

  // Show queue
  if (message.content === 't!queue') {
    const queue = musicQueues.get(message.guild.id);
    if (!queue || (queue.isEmpty() && !queue.currentSong) || queue.destroyed) {
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
