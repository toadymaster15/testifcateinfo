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

let ytdlAgent = null;

// Function to create agent with cookies
function createYTDLAgent() {
  try {
    if (!process.env.YOUTUBE_COOKIES) {
      console.log('⚠️ No YouTube cookies found, using default agent');
      return null;
    }

    console.log('🍪 Creating agent with cookies...');
    
    // Parse cookies from EditThisCookie export (JSON format)
    let cookies;
    try {
      // Try to parse as JSON first (EditThisCookie format)
      cookies = JSON.parse(process.env.YOUTUBE_COOKIES);
      console.log(`✅ Parsed ${cookies.length} cookies from JSON format`);
    } catch (parseError) {
      // If JSON parsing fails, try cookie header format
      console.log('🔄 JSON parsing failed, trying cookie header format...');
      const cookieHeader = process.env.YOUTUBE_COOKIES;
      cookies = cookieHeader.split('; ').map(cookie => {
        const [name, value] = cookie.split('=');
        return {
          name: name.trim(),
          value: value ? value.trim() : '',
          domain: '.youtube.com'
        };
      });
    }

    // Create agent with cookies
    const agent = ytdl.createAgent(cookies);
    console.log('✅ Agent created successfully with cookies');
    return agent;

  } catch (error) {
    console.error('❌ Error creating agent with cookies:', error.message);
    console.log('🔄 Using fallback agent without cookies');
    
    // Create basic agent without cookies as fallback
    try {
      return ytdl.createAgent();
    } catch (fallbackError) {
      console.error('❌ Failed to create fallback agent:', fallbackError.message);
      return null;
    }
  }
}

// Initialize agent at startup
async function initializeYTDLAgent() {
  ytdlAgent = createYTDLAgent();
  
  // Test the agent
  if (ytdlAgent) {
    try {
      // Test with a simple video
      const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll
      const info = await ytdl.getInfo(testUrl, { agent: ytdlAgent });
      console.log('✅ Agent test successful:', info.videoDetails.title);
    } catch (testError) {
      console.log('⚠️ Agent test failed:', testError.message);
      console.log('🔄 Agent may still work for some videos');
    }
  }
}


// FIXED: Better video info function with YouTube bot detection workaround
async function getVideoInfo(query) {
  try {
    console.log(`🔍 Searching for: ${query}`);
    
    // Always search first for non-URLs
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
      // For direct URLs, use agent
      console.log('📺 Processing YouTube URL with agent...');
      
      const options = {};
      
      // Use agent if available
      if (ytdlAgent) {
        options.agent = ytdlAgent;
        console.log('🤖 Using authenticated agent');
      }
      
      // Try multiple times with different strategies
      const strategies = [
        // Strategy 1: Use agent with cookies
        () => ytdl.getInfo(query, { agent: ytdlAgent }),
        
        // Strategy 2: Use agent without additional options
        () => ytdl.getInfo(query, ytdlAgent ? { agent: ytdlAgent } : {}),
        
        // Strategy 3: Basic request without agent
        () => ytdl.getInfo(query),
        
        // Strategy 4: With custom request options
        () => ytdl.getInfo(query, {
          requestOptions: {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
          }
        })
      ];
      
      for (let i = 0; i < strategies.length; i++) {
        try {
          console.log(`🔄 Trying strategy ${i + 1}/${strategies.length}...`);
          const info = await strategies[i]();
          
          console.log('✅ Successfully got video info');
          return {
            title: info.videoDetails.title,
            url: query,
            duration: parseInt(info.videoDetails.lengthSeconds),
            thumbnail: info.videoDetails.thumbnails?.[0]?.url || null
          };
        } catch (err) {
          console.log(`❌ Strategy ${i + 1} failed:`, err.message);
          
          // Wait before trying next strategy
          if (i < strategies.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      // Final fallback: search by video ID
      const videoIdMatch = query.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      if (videoIdMatch) {
        const videoId = videoIdMatch[1];
        console.log(`🆔 All direct methods failed. Searching by video ID: ${videoId}`);
        
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

// Updated playMusic function with agent support
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

  console.log(`🎵 Attempting to play: ${song.title}`);

  try {
    // Validate URL
    if (!ytdl.validateURL(song.url)) {
      throw new Error('Invalid YouTube URL');
    }

    console.log('🔄 Creating ytdl stream with agent...');
    
    // Create stream with agent
    const streamOptions = {
      filter: 'audioonly',
      quality: 'lowestaudio',
      highWaterMark: 1024 * 512
    };

    // Add agent if available
    if (ytdlAgent) {
      streamOptions.agent = ytdlAgent;
      console.log('🤖 Using authenticated agent for stream');
    }

    let stream;
    try {
      stream = ytdl(song.url, streamOptions);
    } catch (streamError) {
      console.error('❌ Failed to create stream with agent, trying fallback...');
      
      // Fallback without agent
      stream = ytdl(song.url, {
        filter: 'audioonly',
        quality: 'lowestaudio'
      });
    }

    if (!stream) {
      throw new Error('Failed to create stream');
    }

    console.log('✅ Stream created successfully');

    // Handle stream errors
    stream.on('error', (streamError) => {
      console.error('❌ Stream error:', streamError.message);
      if (queue.textChannel) {
        queue.textChannel.send('❌ Stream error, trying next song...').catch(console.error);
      }
      setTimeout(() => playMusic(guildId), 1000);
    });

    // Create audio resource
    const resource = createAudioResource(stream, {
      inputType: 'arbitrary',
      inlineVolume: true
    });

    if (resource.volume) {
      resource.volume.setVolume(0.3);
    }

    // Create and configure player
    queue.player = createAudioPlayer();
    
    queue.player.once(AudioPlayerStatus.Idle, () => {
      console.log('🎵 Song finished');
      setTimeout(() => playMusic(guildId), 1000);
    });

    queue.player.once('error', (playerError) => {
      console.error('❌ Player error:', playerError.message);
      if (queue.textChannel) {
        queue.textChannel.send(`❌ Playback error, skipping...`).catch(console.error);
      }
      setTimeout(() => playMusic(guildId), 1000);
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

    console.log('✅ Successfully started playing:', song.title);

  } catch (error) {
    console.error('❌ Error in playMusic:', error.message);
    
    if (queue.textChannel) {
      queue.textChannel.send(`❌ Failed to play: **${song.title}** - ${error.message}`).catch(console.error);
    }
    
    // Try next song
    setTimeout(() => playMusic(guildId), 2000);
  }
}

// Initialize fetch and start the bot
async function initializeBot() {
  try {
    const { default: nodeFetch } = await import('node-fetch');
    fetch = nodeFetch;
    
    // Initialize YTDL agent with cookies
    await initializeYTDLAgent();
    
    await pingWebhook(`🚀 TestificateInfo bot started with agent at ${new Date().toISOString()}`);

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
    console.log(`🔍 Processing play request: "${query}"`);
    
    const videoInfo = await getVideoInfo(query);
    if (!videoInfo) {
      return searchMessage.edit('❌ No results found! Try a different search term.');
    }

    console.log(`✅ Found video: ${videoInfo.title}`);

    // Duration check (10 minutes = 600 seconds)
    if (videoInfo.duration > 600) {
      return searchMessage.edit(`❌ Song too long! (${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toString().padStart(2, '0')} - Max 10:00)`);
    }

    // Additional URL validation
    if (!ytdl.validateURL(videoInfo.url)) {
      console.error('❌ Invalid YouTube URL received:', videoInfo.url);
      return searchMessage.edit('❌ Invalid YouTube URL. Please try again.');
    }

    // Get or create queue
    let queue = musicQueues.get(message.guild.id);
    if (!queue) {
      console.log('🔄 Creating new music queue');
      queue = new MusicQueue();
      queue.connection = connection;
      queue.textChannel = message.channel;
      musicQueues.set(message.guild.id, queue);
    }

    // Verify connection is still valid
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

    // Start playing if not already playing
    if (!queue.isPlaying) {
      console.log('🎵 Starting playback (queue was empty)');
      playMusic(message.guild.id);
    } else {
      console.log('🎵 Added to existing queue (already playing)');
    }

  } catch (error) {
    console.error('❌ Error in play command:', error);
    console.error('❌ Full error details:', error.stack);
    
    // More specific error messages
    let errorMessage = '❌ Failed to play music. ';
    
    if (error.message.includes('Sign in to confirm')) {
      errorMessage += 'YouTube requires sign-in. Please try a different song.';
    } else if (error.message.includes('Video unavailable')) {
      errorMessage += 'This video is unavailable or private.';
    } else if (error.message.includes('timeout')) {
      errorMessage += 'Request timed out. Please try again.';
    } else {
      errorMessage += 'Please try again or use a different song.';
    }
    
    searchMessage.edit(errorMessage);
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
