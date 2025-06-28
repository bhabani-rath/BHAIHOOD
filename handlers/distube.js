const { DisTube } = require("distube");
const { SpotifyPlugin } = require("@distube/spotify"); // ✅ Changed
const { Dynamic } = require("musicard");
const musicIcons = require("../UI/icons/musicicons");
const { EmbedBuilder } = require("discord.js");
const path = require("path");
const data = require("../UI/banners/musicard");

module.exports = async (client) => {
  const distubeConfig = require("../utils/distubeConfig");

  client.distube = new DisTube(client, {
    ...distubeConfig.distubeOptions,
    plugins: [
        new SpotifyPlugin({
          api: {
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET
          }
        })
      ]
      
  });

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
      } catch (error) {}
    }
    client.musicMessages.set(guildId, []);
  };

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

  client.distube.on("playSong", async (queue, song) => {
    if (queue.voiceChannel) await cleanupMessages(queue.voiceChannel.guild.id);
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
          image: { url: "attachment://musicCard.png" },
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
        } catch {}
      }
    }
  });

  client.distube.on("addSong", async (queue, song) => {
    if (queue.textChannel) {
      try {
        const embed = new EmbedBuilder()
          .setColor(0xdc92ff)
          .setAuthor({
            name: "Song added successfully",
            iconURL: musicIcons.correctIcon,
            url: "https://discord.gg/xQF9f9yUEM",
          })
          .setDescription(
            `**${song.name}**\n- Duration: **${song.formattedDuration}**\n- Added by: ${song.user}`
          )
          .setThumbnail(song.thumbnail)
          .setFooter({ text: "Distube Player", iconURL: musicIcons.footerIcon })
          .setTimestamp();
        const message = await queue.textChannel.send({ embeds: [embed] });
        addMessageForCleanup(queue.voiceChannel.guild.id, message);
        setTimeout(async () => {
          try {
            if (message && !message.deleted) await message.delete();
          } catch {}
        }, 5000);
      } catch {}
    }
  });

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
            if (message && !message.deleted) await message.delete();
          } catch {}
        }, 8000);
      } catch {}
    }
  });

  client.distube.on("finish", async (queue) => {
    if (queue.voiceChannel) await cleanupMessages(queue.voiceChannel.guild.id);
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
            if (message && !message.deleted) await message.delete();
          } catch {}
        }, 5000);
      } catch {}
    }
  });

  client.distube.on("disconnect", async (queue) => {
    if (queue.voiceChannel) await cleanupMessages(queue.voiceChannel.guild.id);
    if (queue.textChannel) {
      try {
        const embed = new EmbedBuilder()
          .setColor(0xffe066)
          .setAuthor({ name: "Disconnected", iconURL: musicIcons.playerIcon })
          .setDescription("👋 Disconnected from voice channel")
          .setFooter({ text: "Distube Player", iconURL: musicIcons.footerIcon })
          .setTimestamp();
        const message = await queue.textChannel.send({ embeds: [embed] });
        setTimeout(async () => {
          try {
            if (message && !message.deleted) await message.delete();
          } catch {}
        }, 3000);
      } catch {}
    }
  });

  client.distube.on("empty", async (queue) => {
    if (queue.voiceChannel) await cleanupMessages(queue.voiceChannel.guild.id);
    if (queue.textChannel) {
      try {
        const embed = new EmbedBuilder()
          .setColor(0xffe066)
          .setAuthor({
            name: "Voice channel empty",
            iconURL: musicIcons.playerIcon,
          })
          .setDescription("👋 Left the voice channel due to inactivity")
          .setFooter({ text: "Distube Player", iconURL: musicIcons.footerIcon })
          .setTimestamp();
        const message = await queue.textChannel.send({ embeds: [embed] });
        setTimeout(async () => {
          try {
            if (message && !message.deleted) await message.delete();
          } catch {}
        }, 3000);
      } catch {}
    }
  });

  client.distube.on("error", async (channel, error) => {
    if (channel && channel.guild) await cleanupMessages(channel.guild.id);
    if (channel && typeof channel.send === "function") {
      try {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setAuthor({ name: "Error occurred", iconURL: musicIcons.playerIcon })
          .setDescription(`❌ **${error.message}**`)
          .setFooter({ text: "Distube Player", iconURL: musicIcons.footerIcon })
          .setTimestamp();
        const message = await channel.send({ embeds: [embed] });
        setTimeout(async () => {
          try {
            if (message && !message.deleted) await message.delete();
          } catch {}
        }, 8000);
      } catch {}
    }
  });

  client.cleanupMusicMessages = cleanupMessages;
  client.addMusicMessage = addMessageForCleanup;

  client.distube.on("debug", (message) => {
    // console.log(`[DisTube Debug]: ${message}`);
  });
};

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
    throw error;
  }
}
