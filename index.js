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

// Enhanced Music Queue System
class MusicQueue {
  constructor() {
    this.songs = [];
    this.isPlaying = false;
    this.currentSong = null;
    this.player = null;
    this.connection = null;
    this.textChannel = null;
    this.retryCount = 0;
    this.maxRetries = 2; // Reduced retries to prevent spam
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
    this.retryCount = 0;
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

// Enhanced agent creation with better error handling and rotation
function createYTDLAgent() {
  try {
    console.log('🔧 Creating enhanced YTDL agent...');
    
    // Enhanced user agents that mimic real browsers
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    // Enhanced cookie parsing
    if (process.env.YOUTUBE_COOKIES) {
      let cookies;
      try {
        // Try parsing as JSON first
        cookies = JSON.parse(process.env.YOUTUBE_COOKIES);
        console.log(`✅ Parsed ${cookies.length} cookies from JSON format`);
      } catch (parseError) {
        console.log('🔄 JSON parsing failed, trying cookie header format...');
        const cookieHeader = process.env.YOUTUBE_COOKIES.trim();
        cookies = cookieHeader.split(';').map(cookie => {
          const [name, ...valueParts] = cookie.split('=');
          const value = valueParts.join('=');
          return {
            name: name.trim(),
            value: value ? value.trim() : '',
            domain: '.youtube.com',
            path: '/',
            httpOnly: true,
            secure: true
          };
        }).filter(cookie => cookie.name && cookie.value);
        
        console.log(`✅ Parsed ${cookies.length} cookies from header format`);
      }

      if (cookies && cookies.length > 0) {
        const agent = ytdl.createAgent(cookies, {
          headers: {
            'User-Agent': randomUserAgent,
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        });
        console.log('✅ Agent created with cookies and enhanced headers');
        return agent;
      }
    }

    // Fallback agent without cookies but with enhanced headers
    console.log('🔄 Creating fallback agent without cookies...');
    const agent = ytdl.createAgent([], {
      headers: {
        'User-Agent': randomUserAgent,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    
    console.log('✅ Fallback agent created');
    return agent;

  } catch (error) {
    console.error('❌ Error creating enhanced agent:', error.message);
    console.log('🔄 Using basic agent as last resort');
    
    try {
      return ytdl.createAgent();
    } catch (fallbackError) {
      console.error('❌ Failed to create any agent:', fallbackError.message);
      return null;
    }
  }
}

// Initialize agent at startup with better testing
async function initializeYTDLAgent() {
  console.log('🚀 Initializing YTDL agent...');
  ytdlAgent = createYTDLAgent();
  
  if (ytdlAgent) {
    try {
      // Use a more reliable test video
      const testUrls = [
        'https://www.youtube.com/watch?v=jNQXAC9IVRw', // Short test video
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'  // Rick Roll
      ];
      
      for (const testUrl of testUrls) {
        try {
          console.log(`🧪 Testing agent with: ${testUrl}`);
          const info = await ytdl.getInfo(testUrl, { 
            agent: ytdlAgent,
            requestOptions: {
              timeout: 10000 // 10 second timeout
            }
          });
          
          if (info && info.videoDetails) {
            console.log('✅ Agent test successful:', info.videoDetails.title);
            return;
          }
        } catch (testError) {
          console.log(`⚠️ Test failed for ${testUrl}:`, testError.message);
          continue;
        }
      }
      
      console.log('⚠️ All agent tests failed, but agent is available');
    } catch (testError) {
      console.log('⚠️ Agent test failed:', testError.message);
    }
  } else {
    console.log('❌ No agent available');
  }
}

// Enhanced video info function with aggressive fallback strategies
async function getVideoInfo(query) {
  try {
    console.log(`🔍 Searching for: ${query}`);
    
    if (!ytdl.validateURL(query)) {
      console.log('🔍 Searching YouTube with yt-search...');
      const searchResults = await ytSearch(query);
      
      if (!searchResults.videos || searchResults.videos.length === 0) {
        console.log('❌ No search results found');
        return null;
      }

      const video = searchResults.videos[0];
      
      // Validate the found URL
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
      
      // Multiple aggressive strategies for getting video info
      const strategies = [
        // Strategy 1: Use agent with enhanced options
        async () => {
          if (!ytdlAgent) throw new Error('No agent available');
          return await ytdl.getInfo(query, { 
            agent: ytdlAgent,
            requestOptions: {
              timeout: 15000,
              headers: {
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache'
              }
            }
          });
        },
        
        // Strategy 2: Basic request with custom headers and timeout
        async () => {
          return await ytdl.getInfo(query, {
            requestOptions: {
              timeout: 12000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
              }
            }
          });
        },
        
        // Strategy 3: Minimal request
        async () => {
          return await ytdl.getInfo(query, {
            requestOptions: {
              timeout: 8000
            }
          });
        },
        
        // Strategy 4: Search fallback using video ID
        async () => {
          console.log('🔄 Using search fallback for video info...');
          const videoIdMatch = query.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
          if (!videoIdMatch) throw new Error('Cannot extract video ID');
          
          const videoId = videoIdMatch[1];
          
          // Search by video ID to get basic info
          const searchResults = await ytSearch(videoId);
          if (!searchResults.videos || searchResults.videos.length === 0) {
            throw new Error('No search results for video ID');
          }
          
          const video = searchResults.videos.find(v => v.videoId === videoId) || searchResults.videos[0];
          
          return {
            videoDetails: {
              title: video.title,
              lengthSeconds: video.duration?.seconds || 0,
              thumbnails: video.thumbnail ? [{ url: video.thumbnail }] : []
            }
          };
        }
      ];
      
      for (let i = 0; i < strategies.length; i++) {
        try {
          console.log(`🔄 Trying video info strategy ${i + 1}/${strategies.length}...`);
          const info = await strategies[i]();
          
          if (info && info.videoDetails) {
            console.log('✅ Successfully got video info');
            return {
              title: info.videoDetails.title,
              url: query,
              duration: parseInt(info.videoDetails.lengthSeconds) || 0,
              thumbnail: info.videoDetails.thumbnails?.[0]?.url || null
            };
          }
        } catch (err) {
          console.log(`❌ Video info strategy ${i + 1} failed:`, err.message);
          
          if (i < strategies.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      }
      
      throw new Error('All video info strategies failed');
    }
  } catch (error) {
    console.error('❌ Error getting video info:', error.message);
    return null;
  }
}

// Enhanced audio stream creation with more aggressive strategies
async function createAudioStream(url) {
  console.log('🎵 Creating audio stream with enhanced strategies...');
  
  const strategies = [
    // Strategy 1: High quality with agent
    async () => {
      const options = {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1024 * 512, // Reduced buffer
        requestOptions: {
          timeout: 15000
        }
      };
      
      if (ytdlAgent) {
        options.agent = ytdlAgent;
      }
      
      return ytdl(url, options);
    },
    
    // Strategy 2: Medium quality with agent
    async () => {
      const options = {
        filter: 'audioonly',
        quality: 'lowestaudio',
        highWaterMark: 1024 * 256,
        requestOptions: {
          timeout: 12000,
          headers: {
            'Range': 'bytes=0-'
          }
        }
      };
      
      if (ytdlAgent) {
        options.agent = ytdlAgent;
      }
      
      return ytdl(url, options);
    },
    
    // Strategy 3: Without agent, basic options
    async () => {
      return ytdl(url, {
        filter: 'audioonly',
        quality: 'lowestaudio',
        requestOptions: {
          timeout: 10000
        }
      });
    },
    
    // Strategy 4: Any audio format
    async () => {
      return ytdl(url, {
        filter: format => format.hasAudio,
        quality: 'lowest',
        requestOptions: {
          timeout: 8000
        }
      });
    },
    
    // Strategy 5: Specific format targeting
    async () => {
      return ytdl(url, {
        filter: format => format.container === 'webm' && format.hasAudio,
        quality: 'lowest'
      });
    }
  ];
  
  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`🔄 Trying audio stream strategy ${i + 1}/${strategies.length}...`);
      const stream = await strategies[i]();
      
      if (stream && typeof stream.pipe === 'function') {
        console.log('✅ Audio stream created successfully');
        
        // Add stream error handling
        stream.on('error', (err) => {
          console.error('❌ Stream error during playback:', err.message);
        });
        
        return stream;
      }
    } catch (err) {
      console.log(`❌ Audio stream strategy ${i + 1} failed:`, err.message);
      
      if (i < strategies.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  throw new Error('All audio stream strategies failed - YouTube might be blocking requests');
}

// Enhanced playMusic function with better error handling
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
    if (!ytdl.validateURL(song.url)) {
      throw new Error('Invalid YouTube URL');
    }

    const stream = await createAudioStream(song.url);

    // Enhanced stream error handling
    stream.on('error', (streamError) => {
      console.error('❌ Stream error:', streamError.message);
      
      // More selective retry logic
      if (queue.retryCount < queue.maxRetries && 
          !streamError.message.includes('Sign in to confirm') &&
          !streamError.message.includes('Video unavailable')) {
        
        queue.retryCount++;
        console.log(`🔄 Retrying... (${queue.retryCount}/${queue.maxRetries})`);
        
        if (queue.textChannel) {
          queue.textChannel.send(`⚠️ Stream error, retrying... (${queue.retryCount}/${queue.maxRetries})`).catch(console.error);
        }
        
        setTimeout(() => {
          queue.songs.unshift(song);
          playMusic(guildId);
        }, 3000);
      } else {
        console.error('❌ Max retries reached or permanent error, skipping song');
        queue.retryCount = 0;
        
        if (queue.textChannel) {
          let errorMsg = `❌ Failed to play: **${song.title}**`;
          if (streamError.message.includes('Sign in to confirm')) {
            errorMsg += ' - YouTube authentication required';
          } else if (streamError.message.includes('Video unavailable')) {
            errorMsg += ' - Video is unavailable';
          }
          queue.textChannel.send(errorMsg).catch(console.error);
        }
        
        setTimeout(() => playMusic(guildId), 2000);
      }
    });

    // Create audio resource with enhanced options
    const resource = createAudioResource(stream, {
      inputType: 'arbitrary',
      inlineVolume: true,
      silencePaddingFrames: 0 // Reduce silence padding
    });

    if (resource.volume) {
      resource.volume.setVolume(0.3);
    }

    // Create and configure player
    queue.player = createAudioPlayer();
    
    queue.player.once(AudioPlayerStatus.Idle, () => {
      console.log('🎵 Song finished');
      queue.retryCount = 0;
      setTimeout(() => playMusic(guildId), 1000);
    });

    queue.player.once('error', (playerError) => {
      console.error('❌ Player error:', playerError.message);
      
      if (queue.textChannel) {
        queue.textChannel.send(`❌ Playback error: ${playerError.message}`).catch(console.error);
      }
      
      setTimeout(() => playMusic(guildId), 2000);
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
      let errorMessage = `❌ Failed to play: **${song.title}**`;
      
      if (error.message.includes('Sign in to confirm')) {
        errorMessage += ' - YouTube requires sign-in. Try a different song.';
      } else if (error.message.includes('Video unavailable')) {
        errorMessage += ' - Video is unavailable or private.';
      } else if (error.message.includes('formats')) {
        errorMessage += ' - No playable audio formats available. YouTube may be blocking requests.';
      } else if (error.message.includes('timeout')) {
        errorMessage += ' - Request timed out. YouTube servers may be overloaded.';
      } else {
        errorMessage += ' - Please try again or use a different song.';
      }
      
      queue.textChannel.send(errorMessage).catch(console.error);
    }
    
    // Try next song after error
    setTimeout(() => playMusic(guildId), 3000);
  }
}

// Initialize fetch and start the bot
async function initializeBot() {
  try {
    const { default: nodeFetch } = await import('node-fetch');
    fetch = nodeFetch;
    
    // Check FFmpeg availability
    checkFFmpeg();
    
    // Initialize YTDL agent with cookies
    await initializeYTDLAgent();
    
    await pingWebhook(`🚀 TestificateInfo bot started with enhanced YouTube support at ${new Date().toISOString()}`);

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

  // Better duplicate command prevention
  const commandKey = `${message.author.id}-${message.content.split(' ')[0]}`;
  const now = Date.now();
  
  if (commandCooldowns.has(commandKey)) {
    const cooldownEnd = commandCooldowns.get(commandKey);
    if (now < cooldownEnd) {
      console.log(`⏳ User ${message.author.tag} on cooldown for ${message.content.split(' ')[0]}`);
      return;
    }
  }

  const cooldownTime = message.content.startsWith('t!play') ? 5000 : 1000; // Increased cooldown
  commandCooldowns.set(commandKey, now + cooldownTime);
  setTimeout(() => commandCooldowns.delete(commandKey), cooldownTime);

  // TIME COMMAND (unchanged)
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

  // Enhanced play music command
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

      // Duration check (15 minutes = 900 seconds)
      if (videoInfo.duration > 900) {
        return searchMessage.edit(`❌ Song too long! (${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toString().padStart(2, '0')} - Max 15:00)`);
      }

      if (!ytdl.validateURL(videoInfo.url)) {
        console.error('❌ Invalid YouTube URL received:', videoInfo.url);
        return searchMessage.edit('❌ Invalid YouTube URL. Please try again.');
      }

      let queue = musicQueues.get(message.guild.id);
      if (!queue) {
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
      console.error('❌ Full error details:', error.stack);
      
      let errorMessage = '❌ Failed to play music. ';
      
      if (error.message.includes('Sign in to confirm')) {
        errorMessage += 'YouTube requires sign-in. Please try a different song.';
      } else if (error.message.includes('Video unavailable')) {
        errorMessage += 'This video is unavailable or private.';
      } else if (error.message.includes('timeout')) {
        errorMessage += 'Request timed out. Please try again.';
      } else if (error.message.includes('formats')) {
        errorMessage += 'No playable audio formats found. Try a different song.';
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
