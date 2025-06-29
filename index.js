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

  console.log(`🎵 Attempting to play: ${song.title}`);
  console.log(`🔗 URL: ${song.url}`);

  try {
    // FIXED: Enhanced ytdl stream options with better error handling
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
      console.log('🍪 Using cookies for stream authentication');
    }

    // FIXED: Validate URL before creating stream
    if (!ytdl.validateURL(song.url)) {
      throw new Error('Invalid YouTube URL');
    }

    console.log('🔄 Creating ytdl stream...');
    
    // FIXED: Create stream with proper error handling
    let stream;
    try {
      stream = ytdl(song.url, ytdlOptions);
    } catch (streamError) {
      console.error('❌ Failed to create ytdl stream:', streamError.message);
      throw new Error(`Stream creation failed: ${streamError.message}`);
    }

    // FIXED: Validate stream was created
    if (!stream) {
      throw new Error('Stream is null or undefined');
    }

    console.log('✅ Stream created successfully');

    // FIXED: Add stream error handling before creating resource
    stream.on('error', (streamError) => {
      console.error('❌ Stream error:', streamError.message);
      if (queue.textChannel) {
        queue.textChannel.send('❌ Stream error, trying next song...').catch(console.error);
      }
      // Try next song
      setTimeout(() => playMusic(guildId), 1000);
    });

    // FIXED: Create audio resource with error handling
    let resource;
    try {
      resource = createAudioResource(stream, {
        inputType: 'arbitrary',
        inlineVolume: true
      });
    } catch (resourceError) {
      console.error('❌ Failed to create audio resource:', resourceError.message);
      throw new Error(`Resource creation failed: ${resourceError.message}`);
    }

    if (!resource) {
      throw new Error('Audio resource is null or undefined');
    }

    // Set reasonable volume
    if (resource.volume) {
      resource.volume.setVolume(0.3);
    }

    console.log('✅ Audio resource created successfully');

    // FIXED: Create new player for each song to avoid listener conflicts
    queue.player = createAudioPlayer();
    
    // FIXED: Comprehensive player event handling
    queue.player.once(AudioPlayerStatus.Idle, () => {
      console.log('🎵 Song finished normally');
      // Small delay to prevent rapid-fire
      setTimeout(() => playMusic(guildId), 1000);
    });

    queue.player.once('error', (playerError) => {
      console.error('❌ Player error:', playerError.message);
      if (queue.textChannel) {
        queue.textChannel.send(`❌ Playback error: ${playerError.message.substring(0, 100)}...`).catch(console.error);
      }
      setTimeout(() => playMusic(guildId), 1000);
    });

    // FIXED: Add additional error handling for player states
    queue.player.on('stateChange', (oldState, newState) => {
      console.log(`🔄 Player state: ${oldState.status} -> ${newState.status}`);
    });

    console.log('🎵 Starting playback...');
    queue.player.play(resource);

    // FIXED: Ensure connection exists before subscribing
    if (queue.connection) {
      const subscription = queue.connection.subscribe(queue.player);
      if (!subscription) {
        throw new Error('Failed to subscribe player to connection');
      }
      console.log('✅ Player subscribed to connection');
    } else {
      throw new Error('No voice connection available');
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
    console.error('❌ Critical error in playMusic:', error.message);
    console.error('❌ Full error:', error);
    
    if (queue.textChannel) {
      queue.textChannel.send(`❌ Failed to play: **${song.title}**\nError: ${error.message}`).catch(console.error);
    }
    
    // FIXED: Better error recovery - try alternative methods
    console.log('🔄 Attempting alternative playback methods...');
    
    // Method 1: Try with different ytdl options
    try {
      console.log('🔄 Trying alternative stream method...');
      const alternativeOptions = {
        filter: 'audioonly',
        quality: 'lowest',
        format: 'mp4'
      };
      
      if (process.env.YOUTUBE_COOKIES) {
        alternativeOptions.requestOptions = {
          headers: { 'Cookie': process.env.YOUTUBE_COOKIES }
        };
      }
      
      const altStream = ytdl(song.url, alternativeOptions);
      const altResource = createAudioResource(altStream);
      
      queue.player = createAudioPlayer();
      queue.player.once(AudioPlayerStatus.Idle, () => {
        setTimeout(() => playMusic(guildId), 1000);
      });
      
      queue.player.play(altResource);
      queue.connection.subscribe(queue.player);
      
      console.log('✅ Alternative method successful');
      return;
      
    } catch (altError) {
      console.error('❌ Alternative method also failed:', altError.message);
    }
    
    // Method 2: Skip to next song
    console.log('🔄 Skipping to next song due to playback failure...');
    setTimeout(() => playMusic(guildId), 2000);
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
