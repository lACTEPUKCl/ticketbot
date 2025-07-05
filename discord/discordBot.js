import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";
import getCommands from "../commands/getCommands.js";
import { handleTicketCreation } from "../utils/createTicket.js";
import { forwardToTelegram, tgBot } from "../telegram/telegramBot.js";
import Ticket from "../utils/ticketModel.js";
import { createBattleMetricsClient } from "../utils/battleMetricsClient.js";
import getSteamId64 from "../utils/getSteamID64.js";
import {
  uploadVideoToVKCommunity,
  uploadPhotoToVK,
  uploadDocumentToVK,
} from "../utils/vkUploader.js";
import { config } from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
config();

const downloadsDir = path.join(process.cwd(), "downloads");
if (!fs.existsSync(downloadsDir))
  fs.mkdirSync(downloadsDir, { recursive: true });

async function downloadFileFromURL(fileUrl, destPath) {
  const response = await axios({
    url: fileUrl,
    method: "GET",
    responseType: "stream",
  });
  const writer = fs.createWriteStream(destPath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(destPath));
    writer.on("error", reject);
  });
}

async function handleAttachment(attachment, username, tgChatId, channel) {
  const fileExtension = path.extname(attachment.name || "") || ".dat";
  const fileName = `${randomUUID()}${fileExtension}`;
  const destPath = path.join(downloadsDir, fileName);
  let vkUrl = null;

  try {
    await downloadFileFromURL(attachment.url, destPath);
    await channel.send({
      files: [{ attachment: destPath, name: fileName }],
    });

    if (attachment.contentType.startsWith("image/")) {
      vkUrl = await uploadPhotoToVK(destPath);
    } else if (attachment.contentType.startsWith("video/")) {
      vkUrl = await uploadVideoToVKCommunity(
        destPath,
        `Видео от ${username}`,
        "Загружено через бота"
      );
    } else {
      vkUrl = await uploadDocumentToVK(destPath, fileName);
    }

    if (tgChatId) {
      try {
        if (attachment.contentType.startsWith("image/")) {
          await tgBot.sendPhoto(tgChatId, { source: destPath });
        } else if (attachment.contentType.startsWith("video/")) {
          await tgBot.sendVideo(tgChatId, { source: destPath });
        } else {
          await tgBot.sendDocument(tgChatId, { source: destPath });
        }
      } catch (err) {
        console.error("Ошибка отправки в Telegram:", err);
      }
    }
  } catch (err) {
    console.error("Ошибка работы с вложением:", err);
  } finally {
    try {
      await fs.promises.unlink(destPath);
    } catch (e) {}
  }
  return vkUrl;
}

async function loadAdminsMapping(filePath) {
  const content = fs.readFileSync(path.resolve(filePath), "utf8");
  const lines = content.split("\n");
  const mapping = {};
  const regex =
    /^Admin=(\d{17}):Admin\s+\/\/\s+DiscordID\s+(\d+)\s+do\s+\d{2}\.\d{2}\.\d{4}$/;
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(regex);
    if (match) mapping[match[1]] = match[2];
  }
  return mapping;
}

const battleMetricsClient = new createBattleMetricsClient({
  access_token: process.env.BATTLEMETRICS_API_TOKEN,
  org_id: process.env.BATTLEMETRICS_ORG_ID,
});
const adminsMapping = await loadAdminsMapping("./admins.cfg");
const steamApi = process.env.STEAM_API_KEY;
const modRoleIds = process.env.MOD_ROLE_IDS.split(",").map((id) => id.trim());

const client = new Client({
  intents: [
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds,
  ],
});
client.commands = new Collection();
const commands = await getCommands();
for (const command of commands) {
  if (command.data && command.execute)
    client.commands.set(command.data.name, command);
  else console.log("The command missing! in index.js");
}
const userTicketChannels = new Map();

client.on(Events.Ready, () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const discordId = message.author.id;
  const username = message.author.tag;
  const ticket = await Ticket.findOne({ discordChannelId: message.channel.id });
  if (!ticket) return;
  const tgChatId = ticket.telegramChatId;

  const attachmentsForDB = [];

  if (message.attachments.size > 0) {
    for (const attachment of message.attachments.values()) {
      try {
        const fileExtension = path.extname(attachment.name || "") || ".dat";
        const fileName = `${randomUUID()}${fileExtension}`;
        const destPath = path.join(downloadsDir, fileName);
        await downloadFileFromURL(attachment.url, destPath);

        let vkUrl = null;
        if (attachment.contentType.startsWith("image/")) {
          vkUrl = await uploadPhotoToVK(destPath);
        } else if (attachment.contentType.startsWith("video/")) {
          vkUrl = await uploadVideoToVKCommunity(
            destPath,
            `Видео от ${username}`,
            "Загружено через бота"
          );
        } else {
          vkUrl = await uploadDocumentToVK(destPath, fileName);
        }
        if (vkUrl) attachmentsForDB.push(vkUrl);

        if (tgChatId) {
          try {
            if (attachment.contentType.startsWith("image/")) {
              await tgBot.sendPhoto(tgChatId, { source: destPath });
            } else if (attachment.contentType.startsWith("video/")) {
              await tgBot.sendVideo(tgChatId, { source: destPath });
            } else {
              await tgBot.sendDocument(tgChatId, { source: destPath });
            }
          } catch (err) {
            console.error("Ошибка отправки в Telegram:", err);
          }
        }

        await message.channel.send({
          files: [{ attachment: destPath, name: fileName }],
        });

        try {
          await fs.promises.unlink(destPath);
        } catch (e) {}
      } catch (err) {
        console.error("Ошибка обработки вложения:", err);
      }
    }
  }

  if (tgChatId && message.content.trim() && message.attachments.size === 0) {
    try {
      await tgBot.sendMessage(
        tgChatId,
        `Discord (${username}): ${message.content}`
      );
    } catch (err) {
      console.error("Ошибка отправки текста в Telegram:", err);
    }
  }

  try {
    await Ticket.findOneAndUpdate(
      { discordChannelId: message.channel.id },
      {
        $push: {
          messages: {
            sender: username,
            discordId,
            content: message.content,
            attachments: attachmentsForDB,
          },
        },
      },
      { new: true }
    );
  } catch (err) {
    console.error("Ошибка записи в базу данных из Discord:", err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      }
    }
  }

  if (interaction.isModalSubmit()) {
    const categoryId = interaction.channel?.parentId;
    switch (interaction.customId) {
      case "report_ticket_modal": {
        const nickname = interaction.fields.getTextInputValue("nickname");
        const steam = interaction.fields.getTextInputValue("steam");
        const offender = interaction.fields.getTextInputValue("offender");
        const server = interaction.fields.getTextInputValue("server");
        const details = interaction.fields.getTextInputValue("details");

        const formData = {
          "Ваш игровой никнейм": nickname,
          "Ваш SteamID64 или ссылка на профиль Steam": steam,
          "Никнейм нарушителя": offender,
          "На каком сервере произошло нарушение": server,
          "Подробно опишите, что произошло": details,
        };
        await handleTicketCreation(
          interaction,
          "Жалоба",
          formData,
          categoryId,
          userTicketChannels
        );
        break;
      }
      case "unban_ticket_modal": {
        const nickname = interaction.fields.getTextInputValue("nickname");
        const steam = interaction.fields.getTextInputValue("steam");
        const reason = interaction.fields.getTextInputValue("reason");
        const steamID64 = await getSteamId64(steamApi, steam);

        if (!/^\d{17}$/.test(steamID64)) {
          await interaction.reply({
            content:
              "Неверный SteamID. Пожалуйста, введите корректный 17-значный SteamID или ссылку на профиль.",
            ephemeral: true,
          });
          return;
        }

        let adminMessage;
        try {
          const bans = await battleMetricsClient.playerBans(steamID64);
          if (Array.isArray(bans) && bans.length > 0) {
            const banRecord = bans[0];
            const adminBMId = banRecord.relationships.user.data.id;
            const adminSteamId = await battleMetricsClient.userSteamId(
              adminBMId
            );
            const adminDiscordId = adminsMapping[adminSteamId];
            if (adminDiscordId) {
              adminMessage = `Администратор <@${adminDiscordId}> рассмотрит ваше обращение!`;
            }
          }
        } catch (error) {
          console.error("Ошибка получения информации о бане:", error);
        }

        const formData = {
          "Ваш игровой никнейм": nickname,
          "Ваш SteamID64 или ссылка на профиль Steam": steam,
          Объяснение: reason,
        };

        const ticketChannel = await handleTicketCreation(
          interaction,
          "Оспорить бан",
          formData,
          categoryId,
          userTicketChannels
        );

        if (ticketChannel && adminMessage) {
          ticketChannel.send(adminMessage);
        }
        break;
      }

      case "return_pilot_ticket_modal": {
        const nickname = interaction.fields.getTextInputValue("nickname");
        const steam = interaction.fields.getTextInputValue("steam");

        const formData = {
          "Ваш игровой никнейм": nickname,
          "Ваш SteamID64 или ссылка на профиль Steam": steam,
        };
        await handleTicketCreation(
          interaction,
          "Вернуть пилота",
          formData,
          categoryId,
          userTicketChannels
        );
        break;
      }
      case "admin_modal": {
        const nickname = interaction.fields.getTextInputValue("nickname");
        const steam = interaction.fields.getTextInputValue("steam");
        const age = interaction.fields.getTextInputValue("age");
        const experience = interaction.fields.getTextInputValue("experience");
        const reason = interaction.fields.getTextInputValue("reason");

        const formData = {
          "Ваш игровой никнейм": nickname,
          "Ваш SteamID64 или ссылка на профиль Steam": steam,
          Возраст: age,
          "Опыт администрирования": experience,
          "Почему наш сервер?": reason,
        };

        await handleTicketCreation(
          interaction,
          "Заявка на администратора",
          formData,
          categoryId,
          userTicketChannels
        );
        break;
      }
      case "modal_close_with_reason": {
        const reason =
          interaction.fields.getTextInputValue("reason_input") || "Не указана";
        const ticket = await Ticket.findOneAndUpdate(
          { discordChannelId: interaction.channel.id },
          { closedAt: new Date(), closedByAdminId: interaction.user.id },
          { new: true }
        );

        if (!ticket) {
          await interaction.reply({
            content: "Тикет не найден",
            ephemeral: true,
          });
          return;
        }

        const createdAt = ticket.createdAt
          ? ticket.createdAt.toLocaleString("ru-RU", {
              timeZone: "Europe/Moscow",
            })
          : "Неизвестно";

        const closedAt = new Date().toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
        });

        const embed = new EmbedBuilder()
          .setAuthor({
            name: "Русский Народный Сервер",
            iconURL:
              "https://media.discordapp.net/attachments/1179711462197968896/1271584403826540705/0000.png",
          })
          .setTitle("Тикет закрыт!")
          .setColor("Green")
          .addFields(
            {
              name: "Номер тикета",
              value: ticket._id ? ticket._id.toString() : "Неизвестно",
              inline: true,
            },
            {
              name: "Открыл:",
              value: `<@${ticket.discordUserId ?? "Неизвестно"}>`,
              inline: true,
            },
            {
              name: "Закрыл:",
              value: `<@${interaction.user.id}>`,
              inline: true,
            },
            { name: "Дата создания:", value: createdAt, inline: true },
            { name: "Причина", value: reason, inline: true }
          )
          .setFooter({ text: `Закрыто: ${closedAt}` });

        try {
          if (ticket.discordUserId) {
            const ticketCreator = await client.users.fetch(
              ticket.discordUserId
            );
            await ticketCreator.send({ embeds: [embed] });
          }

          const closedChannel = interaction.guild.channels.cache.get(
            process.env.CLOSED_TICKETS_CHANNEL_ID
          );
          if (closedChannel) {
            await closedChannel.send({ embeds: [embed] });
          } else {
            console.error("Канал закрытых тикетов не найден");
          }
        } catch (err) {
          console.error("Ошибка отправки уведомлений:", err);
        }

        await interaction.reply({ content: "Тикет закрыт.", ephemeral: true });

        if (ticket.telegramChatId) {
          forwardToTelegram(ticket.telegramChatId, "Ваш тикет закрыт.");
        }

        await interaction.channel?.delete().catch(console.error);
        break;
      }
    }
  }

  if (interaction.isButton()) {
    switch (interaction.customId) {
      case "report_ticket": {
        const modal = new ModalBuilder()
          .setCustomId("report_ticket_modal")
          .setTitle("Жалоба")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("nickname")
                .setLabel("Ваш игровой никнейм")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("steam")
                .setLabel("SteamID64 или ссылка на профиль Steam")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("offender")
                .setLabel("Никнейм нарушителя")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("server")
                .setLabel("На каком сервере произошло нарушение?")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("details")
                .setLabel("Подробно опишите, что произошло")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
        break;
      }
      case "unban_ticket": {
        const modal = new ModalBuilder()
          .setCustomId("unban_ticket_modal")
          .setTitle("Оспорить бан")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("nickname")
                .setLabel("Ваш игровой никнейм")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("steam")
                .setLabel("SteamID64 или ссылка на профиль Steam")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("Почему вы считаете, что бан нужно изменить?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
        break;
      }
      case "return_pilot_ticket": {
        const modal = new ModalBuilder()
          .setCustomId("return_pilot_ticket_modal")
          .setTitle("Вернуть пилота")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("nickname")
                .setLabel("Ваш игровой никнейм")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("steam")
                .setLabel("SteamID64 или ссылка на профиль Steam")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
        break;
      }
      case "ask_question_ticket": {
        await handleTicketCreation(
          interaction,
          "Задать вопрос",
          {},
          interaction.channel?.parentId
        );
        break;
      }
      case "admin_ticket": {
        const modal = new ModalBuilder()
          .setCustomId("admin_modal")
          .setTitle("Заявка на администратора")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("nickname")
                .setLabel("Ваш игровой никнейм")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("steam")
                .setLabel("SteamID64 или ссылка на профиль Steam")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("age")
                .setLabel("Возраст")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("experience")
                .setLabel("Опыт администрирования")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("Почему наш сервер?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
        break;
      }
      case "close_ticket": {
        const memberRoles = interaction.member.roles.cache;
        const isMod = memberRoles.some((role) => modRoleIds.includes(role.id));
        if (!isMod) {
          await interaction.reply({
            content: "Закрыть тикет может только модератор",
            ephemeral: true,
          });
          return;
        }
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("confirm_close_ticket")
            .setLabel("Да, закрыть")
            .setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({
          content: "Вы уверены, что хотите закрыть тикет?",
          components: [confirmRow],
          ephemeral: true,
        });
        break;
      }
      case "confirm_close_ticket": {
        const ticket = await Ticket.findOneAndUpdate(
          { discordChannelId: interaction.channel.id },
          { closedAt: new Date(), closedByAdminId: interaction.user.id },
          { new: true }
        );
        if (!ticket) {
          await interaction.reply({
            content: "Тикет не найден",
            ephemeral: true,
          });
          return;
        }
        const createdAt = ticket.createdAt
          ? ticket.createdAt.toLocaleString("ru-RU", {
              timeZone: "Europe/Moscow",
            })
          : "Неизвестно";
        const closedAt = new Date().toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
        });
        const embed = new EmbedBuilder()
          .setAuthor({
            name: "Русский Народный Сервер",
            iconURL:
              "https://media.discordapp.net/attachments/1179711462197968896/1271584403826540705/0000.png",
          })
          .setTitle("Тикет закрыт!")
          .setColor("Green")
          .addFields(
            {
              name: "Номер тикета",
              value: ticket._id ? ticket._id.toString() : "Неизвестно",
              inline: true,
            },
            {
              name: "Открыл:",
              value: `<@${ticket.discordUserId ?? "Неизвестно"}>`,
              inline: true,
            },
            {
              name: "Закрыл:",
              value: `<@${interaction.user.id}>`,
              inline: true,
            },
            { name: "Дата создания:", value: createdAt, inline: true },
            { name: "Причина", value: "Не указана", inline: true }
          )
          .setFooter({ text: `Закрыто: ${closedAt}` });
        try {
          if (ticket.discordUserId) {
            const ticketCreator = await client.users.fetch(
              ticket.discordUserId
            );
            await ticketCreator.send({ embeds: [embed] });
          }
          const closedChannel = interaction.guild.channels.cache.get(
            process.env.CLOSED_TICKETS_CHANNEL_ID
          );
          if (closedChannel) {
            await closedChannel.send({ embeds: [embed] });
          } else {
            console.error("Канал закрытых тикетов не найден");
          }
        } catch (err) {
          console.error("Ошибка отправки уведомлений:", err);
        }
        await interaction.reply({ content: "Тикет закрыт.", ephemeral: true });
        const ticketData = await Ticket.findOne({
          discordChannelId: interaction.channel.id,
        });
        if (ticketData && ticketData.telegramChatId) {
          forwardToTelegram(ticketData.telegramChatId, "Ваш тикет закрыт.");
        }
        await interaction.channel?.delete().catch(console.error);
        break;
      }

      case "close_ticket_with_reason": {
        const memberRoles = interaction.member.roles.cache;
        const isMod = memberRoles.some((role) => modRoleIds.includes(role.id));
        if (!isMod) {
          await interaction.reply({
            content: "Закрыть тикет может только модератор",
            ephemeral: true,
          });
          return;
        }
        const modal = new ModalBuilder()
          .setCustomId("modal_close_with_reason")
          .setTitle("Закрытие тикета с причиной");
        const reasonInput = new TextInputBuilder()
          .setCustomId("reason_input")
          .setLabel("Введите причину закрытия тикета")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);
        const row = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(row);
        await interaction.showModal(modal);
        break;
      }
    }
  }
});

await client.login(process.env.CLIENT_TOKEN);
export { client };
