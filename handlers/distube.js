const { DisTube } = require("distube");
const { YtDlpPlugin } = require("@distube/yt-dlp");
const { Dynamic } = require("musicard");
const musicIcons = require("../UI/icons/musicicons");
const { EmbedBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");
const data = require("../UI/banners/musicard");

module.exports = async (client) => {
  const distubeConfig = require("../utils/distubeConfig");

  // Check if cookies file exists
  const cookiesPath = path.join(__dirname, "../utils/cookies.txt");
  const cookiesExist = fs.existsSync(cookiesPath);

  if (!cookiesExist) {
    console.log("⚠️  YouTube cookies file not found. Creating empty file...");
    // Create utils directory if it doesn't exist
    const utilsDir = path.join(__dirname, "../utils");
    if (!fs.existsSync(utilsDir)) {
      fs.mkdirSync(utilsDir, { recursive: true });
    }
    // Create empty cookies file
    fs.writeFileSync(
      cookiesPath,
      "# Netscape HTTP Cookie File\n# This is a generated file! Do not edit.\n"
    );
  }

  // Configure yt-dlp plugin with additional options
  const ytDlpPlugin = new YtDlpPlugin({
    update: false,
    cookies: cookiesPath,
    ytDlpOptions: {
      // Additional options to bypass restrictions
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      referer: "https://www.youtube.com/",
      "accept-language": "en-US,en;q=0.9",
      "accept-encoding": "gzip, deflate, br",
      "geo-bypass": true,
      "geo-bypass-country": "US",
      // Add format selection for better compatibility
      format: "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
      quiet: true,
      "no-warnings": true,
      "extract-flat": false,
      "skip-download": false,
      "age-limit": 21,
      // Rate limiting options
      "sleep-interval": 1,
      "max-sleep-interval": 3,
      "sleep-requests": 1,
    },
  });

  // Initialize DisTube with enhanced configuration
  client.distube = new DisTube(client, {
    ...distubeConfig.distubeOptions,
    plugins: [ytDlpPlugin],
    youtubeCookie: cookiesExist
      ? fs.readFileSync(cookiesPath, "utf-8")
      : undefined,
    ytdlOptions: {
      quality: "highestaudio",
      highWaterMark: 1 << 25,
      requestOptions: {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          Cookie: cookiesExist ? fs.readFileSync(cookiesPath, "utf-8") : "",
        },
      },
    },
  });

  // Message cleanup system
  client.musicMessages = new Map();

  const addMessageForCleanup = (guildId, message) => {
    if (!client.musicMessages.has(guildId)) {
      client.musicMessages.set(guildId, []);
    }
    client.musicMessages.get(guildId).push(message);
  };

  const cleanupMessages = async (guildId, delay = 0) => {
    const messages = client.musicMessages.get(guildId);
    if (!messages || messages.length === 0) return;

    if (delay > 0) {
      setTimeout(async () => {
        await performCleanup(guildId, messages);
      }, delay);
    } else {
      await performCleanup(guildId, messages);
    }
  };

  const performCleanup = async (guildId, messages) => {
    for (const message of messages) {
      try {
        if (message && !message.deleted) {
          await message.delete();
        }
      } catch (error) {
        // Ignore error
      }
    }
    client.musicMessages.set(guildId, []);
  };

  // Enhanced playMusic function with retry logic
  client.playMusic = async (channel, query, options = {}) => {
    try {
      const connection = await client.distube.voices.join(channel);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const queue = await client.distube.play(channel, query, {
        textChannel: options.textChannel || null,
        member: options.member || null,
        ...options,
      });

      return queue;
    } catch (error) {
      // Handle specific YouTube errors
      if (
        error.message.includes("Sign in to confirm") ||
        error.message.includes("bot")
      ) {
        if (options.textChannel) {
          const errorEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("⚠️ YouTube Authentication Required")
            .setDescription(
              "YouTube is requiring authentication. Please try one of these solutions:\n\n" +
                "**1. Use a different source:**\n" +
                "• Try Spotify links\n" +
                "• Use SoundCloud\n" +
                "• Search with different keywords\n\n" +
                "**2. For bot owner:**\n" +
                "• Export YouTube cookies from browser\n" +
                "• Place cookies.txt in utils folder\n" +
                "• Restart the bot"
            )
            .setFooter({
              text: "This is a YouTube restriction, not a bot error",
            });

          await options.textChannel.send({ embeds: [errorEmbed] });
        }
        throw new Error("YouTube authentication required");
      }

      // Retry logic for connection issues
      if (
        error.message.includes("VOICE_CONNECT_FAILED") ||
        error.message.includes("connection")
      ) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const connection = await client.distube.voices.join(channel);
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const queue = await client.distube.play(channel, query, {
            textChannel: options.textChannel || null,
            member: options.member || null,
            ...options,
          });

          return queue;
        } catch (retryError) {
          throw retryError;
        }
      }
      throw error;
    }
  };

  // Event: When song starts playing
  client.distube.on("playSong", async (queue, song) => {
    if (queue.voiceChannel) {
      await cleanupMessages(queue.voiceChannel.guild.id);
    }

    if (queue.textChannel) {
      try {
        const musicCard = await generateMusicCard(song);
        const embed = {
          color: 0xdc92ff,
          author: {
            name: "Now playing",
            url: "https://discord.gg/xQF9f9yUEM",
            icon_url: musicIcons.playerIcon,
          },
          description: `- Song name: **${song.name}** \n- Duration: **${song.formattedDuration}**\n- Requested by: ${song.user}`,
          image: {
            url: "attachment://musicCard.png",
          },
          footer: {
            text: "Distube Player",
            icon_url: musicIcons.footerIcon,
          },
          timestamp: new Date().toISOString(),
        };

        const message = await queue.textChannel.send({
          embeds: [embed],
          files: [{ attachment: musicCard, name: "musicCard.png" }],
        });

        addMessageForCleanup(queue.voiceChannel.guild.id, message);
      } catch (error) {
        const fallbackEmbed = new EmbedBuilder()
          .setColor(0xdc92ff)
          .setAuthor({ name: "Now playing", iconURL: musicIcons.playerIcon })
          .setDescription(
            `🎶 **${song.name}**\n⏱️ Duration: **${song.formattedDuration}**\n👤 Requested by: ${song.user}`
          )
          .setThumbnail(song.thumbnail)
          .setFooter({ text: "Distube Player", iconURL: musicIcons.footerIcon })
          .setTimestamp();

        try {
          const message = await queue.textChannel.send({
            embeds: [fallbackEmbed],
          });
          addMessageForCleanup(queue.voiceChannel.guild.id, message);
        } catch (err) {
          // Ignore error
        }
      }
    }
  });

  // Event: When song is added to queue - UPDATED DESIGN
  client.distube.on("addSong", async (queue, song) => {
    if (queue.textChannel) {
      try {
        const queuePosition = queue.songs.length - 1;

        let songName = song.name;
        if (songName.length > 50) {
          songName = songName.substring(0, 47) + "...";
        }

        const embed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setAuthor({
            name: "🔴 Enqueued Track",
            url: "https://discord.gg/xQF9f9yUEM",
          })
          .setDescription(
            `✅ **Added** [${songName}](${song.url}) to the queue.\n\n` +
              `**Duration:** ${song.formattedDuration} • **Requester:** ${song.user} • **Position:** ${queuePosition}`
          )
          .setThumbnail(song.thumbnail)
          .setTimestamp();

        const message = await queue.textChannel.send({ embeds: [embed] });
        addMessageForCleanup(queue.voiceChannel.guild.id, message);

        setTimeout(async () => {
          try {
            if (message && !message.deleted) {
              await message.delete();
            }
          } catch (error) {
            // Ignore error
          }
        }, 10000);
      } catch (error) {
        console.error("Error sending add song message:", error);
      }
    }
  });

  // Event: When playlist is added
  client.distube.on("addList", async (queue, playlist) => {
    if (queue.textChannel) {
      try {
        const embed = new EmbedBuilder()
          .setColor(0xdc92ff)
          .setAuthor({
            name: "Playlist added successfully",
            iconURL: musicIcons.correctIcon,
            url: "https://discord.gg/xQF9f9yUEM",
          })
          .setDescription(
            `**${playlist.name}**\n- Songs: **${playlist.songs.length}**\n- Added by: ${playlist.user}`
          )
          .setThumbnail(playlist.thumbnail)
          .setFooter({ text: "Distube Player", iconURL: musicIcons.footerIcon })
          .setTimestamp();

        const message = await queue.textChannel.send({ embeds: [embed] });
        addMessageForCleanup(queue.voiceChannel.guild.id, message);

        setTimeout(async () => {
          try {
            if (message && !message.deleted) {
              await message.delete();
            }
          } catch (error) {
            // Ignore error
          }
        }, 8000);
      } catch (error) {
        // Ignore error
      }
    }
  });

  // Event: Queue finished
  client.distube.on("finish", async (queue) => {
    if (queue.voiceChannel) {
      await cleanupMessages(queue.voiceChannel.guild.id);
    }

    if (queue.textChannel) {
      try {
        const embed = new EmbedBuilder()
          .setColor(0xff6b6b)
          .setAuthor({ name: "Queue finished", iconURL: musicIcons.playerIcon })
          .setDescription("🏁 All songs have been played!")
          .setFooter({ text: "Distube Player", iconURL: musicIcons.footerIcon })
          .setTimestamp();

        const message = await queue.textChannel.send({ embeds: [embed] });

        setTimeout(async () => {
          try {
            if (message && !message.deleted) {
              await message.delete();
            }
          } catch (error) {
            // Ignore error
          }
        }, 5000);
      } catch (error) {
        // Ignore error
      }
    }
  });

  // Event: Disconnected
  client.distube.on("disconnect", async (queue) => {
    if (queue.voiceChannel) {
      await cleanupMessages(queue.voiceChannel.guild.id);
    }

    if (queue.textChannel) {
      const embed = new EmbedBuilder()
        .setColor(0xffe066)
        .setAuthor({ name: "Disconnected", iconURL: musicIcons.playerIcon })
        .setDescription("👋 Disconnected from voice channel")
        .setFooter({ text: "Distube Player", iconURL: musicIcons.footerIcon })
        .setTimestamp();

      try {
        const message = await queue.textChannel.send({ embeds: [embed] });

        setTimeout(async () => {
          try {
            if (message && !message.deleted) {
              await message.delete();
            }
          } catch (error) {
            // Ignore error
          }
        }, 3000);
      } catch (error) {
        // Ignore error
      }
    }
  });

  // Event: Empty channel
  client.distube.on("empty", async (queue) => {
    if (queue.voiceChannel) {
      await cleanupMessages(queue.voiceChannel.guild.id);
    }

    if (queue.textChannel) {
      const embed = new EmbedBuilder()
        .setColor(0xffe066)
        .setAuthor({
          name: "Voice channel empty",
          iconURL: musicIcons.playerIcon,
        })
        .setDescription("👋 Left the voice channel due to inactivity")
        .setFooter({ text: "Distube Player", iconURL: musicIcons.footerIcon })
        .setTimestamp();

      try {
        const message = await queue.textChannel.send({ embeds: [embed] });

        setTimeout(async () => {
          try {
            if (message && !message.deleted) {
              await message.delete();
            }
          } catch (error) {
            // Ignore error
          }
        }, 3000);
      } catch (error) {
        // Ignore error
      }
    }
  });

  // Enhanced error handler with specific YouTube error handling
  client.distube.on("error", async (channel, error) => {
    if (channel && channel.guild) {
      await cleanupMessages(channel.guild.id);
    }

    if (channel && typeof channel.send === "function") {
      let errorMessage = error.message;
      let errorTitle = "Error occurred";
      let solutions = "";

      // Handle specific error types
      if (
        error.message.includes("Sign in to confirm") ||
        error.message.includes("bot")
      ) {
        errorTitle = "YouTube Authentication Required";
        errorMessage = "YouTube is blocking the request";
        solutions =
          "\n\n**Try these alternatives:**\n" +
          "• Use Spotify/SoundCloud links\n" +
          "• Try a different song\n" +
          "• Contact bot owner to update cookies";
      } else if (
        error.message.includes("429") ||
        error.message.includes("rate limit")
      ) {
        errorTitle = "Rate Limited";
        errorMessage = "Too many requests to YouTube";
        solutions =
          "\n\n**Please:**\n" +
          "• Wait a few minutes\n" +
          "• Try again with fewer requests";
      } else if (
        error.message.includes("private") ||
        error.message.includes("unavailable")
      ) {
        errorTitle = "Video Unavailable";
        errorMessage = "This video is private or unavailable";
        solutions =
          "\n\n**Try:**\n" +
          "• Different video/song\n" +
          "• Check if video is public";
      }

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({ name: errorTitle, iconURL: musicIcons.playerIcon })
        .setDescription(`❌ **${errorMessage}**${solutions}`)
        .setFooter({ text: "Distube Player", iconURL: musicIcons.footerIcon })
        .setTimestamp();

      try {
        const message = await channel.send({ embeds: [embed] });

        setTimeout(async () => {
          try {
            if (message && !message.deleted) {
              await message.delete();
            }
          } catch (error) {
            // Ignore error
          }
        }, 10000);
      } catch (err) {
        console.error("Error sending error message:", err);
      }
    }
  });

  // Add these utility functions to client for use in commands
  client.cleanupMusicMessages = cleanupMessages;
  client.addMusicMessage = addMessageForCleanup;

  // Optional: Debug mode (disable in production)
  if (process.env.DEBUG === "true") {
    client.distube.on("debug", (message) => {
      console.log(`[DisTube Debug]: ${message}`);
    });
  }

  console.log(
    "✅ DisTube music player initialized with enhanced YouTube support!"
  );
};

// Music card generator function
async function generateMusicCard(song) {
  try {
    const randomIndex = Math.floor(
      Math.random() * data.backgroundImages.length
    );
    const backgroundImage = data.backgroundImages[randomIndex];

    return await Dynamic({
      thumbnailImage: song.thumbnail,
      name: song.name,
      author: song.formattedDuration,
      authorColor: "#FF7A00",
      progress: 50,
      imageDarkness: 60,
      backgroundImage: backgroundImage,
      nameColor: "#FFFFFF",
      progressColor: "#FF7A00",
      progressBarColor: "#5F2D00",
    });
  } catch (error) {
    console.error("Error generating music card:", error);
    throw error;
  }
}
