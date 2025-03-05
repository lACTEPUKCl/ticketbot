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
} from "discord.js";
import getCommands from "../commands/getCommands.js";
import { handleTicketCreation } from "../utils/createTicket.js";
import { forwardToTelegram } from "../telegram/telegramBot.js";
import Ticket from "../utils/ticketModel.js";
import { tgBot } from "../telegram/telegramBot.js";
import {
  uploadVideoToVKCommunity,
  uploadPhotoToVK,
  uploadDocumentToVK,
} from "../utils/vkUploader.js";
import { config } from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
config();

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

const attachmentCache = new Map();

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
  if ("data" in command && "execute" in command)
    client.commands.set(command.data.name, command);
  else console.log("The command missing! in index.js");
}

const userTicketChannels = new Map();
const modRoleIds = process.env.MOD_ROLE_IDS.split(",").map((id) => id.trim());

client.on(Events.Ready, async () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const discordId = message.author.id;
  const username = message.author.tag;

  const ticket = await Ticket.findOne({ discordChannelId: message.channel.id });
  if (!ticket) {
    return;
  }

  const tgChatId = ticket.telegramChatId;
  const attachments = [];

  if (message.attachments.size > 0) {
    for (const attachment of message.attachments.values()) {
      try {
        let vkUrl = null;
        const fileExtension = path.extname(attachment.name || "").toLowerCase();
        const fileName = attachment.name || `${attachment.id}${fileExtension}`;
        const destPath = path.join("./downloads", fileName);

        await downloadFileFromURL(attachment.url, destPath);

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

        if (vkUrl) attachments.push(vkUrl);
      } catch (err) {
        console.error("Ошибка загрузки вложения в VK:", err);
      }
    }
  }

  if (tgChatId) {
    let caption = `Discord (${username}):`;
    if (message.content.trim().length > 0) {
      caption += ` ${message.content}`;
    }

    if (message.attachments.size > 0) {
      for (const attachment of message.attachments.values()) {
        try {
          if (attachment.contentType.startsWith("image/")) {
            await tgBot.sendPhoto(tgChatId, attachment.url, {});
          } else if (attachment.contentType.startsWith("video/")) {
            await tgBot.sendVideo(tgChatId, attachment.url, {});
          } else {
            await tgBot.sendDocument(tgChatId, attachment.url, {});
          }
        } catch (err) {
          console.error("Ошибка отправки вложения в Telegram:", err);
        }
      }
    } else {
      await tgBot.sendMessage(tgChatId, caption);
    }
  }

  try {
    const updatedTicket = await Ticket.findOneAndUpdate(
      { discordChannelId: message.channel.id },
      {
        $push: {
          messages: {
            sender: username,
            discordId: discordId,
            content: message.content,
            attachments: attachments,
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

        const formData = { nickname, steam, offender, server, details };
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

        const formData = { nickname, steam, reason };
        await handleTicketCreation(
          interaction,
          "Оспорить бан",
          formData,
          categoryId,
          userTicketChannels
        );
        break;
      }
      case "return_pilot_ticket_modal": {
        const nickname = interaction.fields.getTextInputValue("nickname");
        const steam = interaction.fields.getTextInputValue("steam");

        const formData = { nickname, steam };
        await handleTicketCreation(
          interaction,
          "Вернуть пилота",
          formData,
          categoryId,
          userTicketChannels
        );
        break;
      }
    }
  }

  if (interaction.isButton()) {
    switch (interaction.customId) {
      case "report_ticket": {
        const modal = new ModalBuilder()
          .setCustomId("report_ticket_modal")
          .setTitle("Жалоба");

        const nicknameInput = new TextInputBuilder()
          .setCustomId("nickname")
          .setLabel("Ваш игровой никнейм")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const steamInput = new TextInputBuilder()
          .setCustomId("steam")
          .setLabel("SteamID64 или ссылка на профиль Steam")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const offenderInput = new TextInputBuilder()
          .setCustomId("offender")
          .setLabel("Никнейм нарушителя")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const serverInput = new TextInputBuilder()
          .setCustomId("server")
          .setLabel("На каком сервере произошло нарушение?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const detailsInput = new TextInputBuilder()
          .setCustomId("details")
          .setLabel("Подробно опишите, что произошло")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(nicknameInput);
        const row2 = new ActionRowBuilder().addComponents(steamInput);
        const row3 = new ActionRowBuilder().addComponents(offenderInput);
        const row4 = new ActionRowBuilder().addComponents(serverInput);
        const row5 = new ActionRowBuilder().addComponents(detailsInput);

        modal.addComponents(row1, row2, row3, row4, row5);
        await interaction.showModal(modal);
        break;
      }
      case "unban_ticket": {
        const modal = new ModalBuilder()
          .setCustomId("unban_ticket_modal")
          .setTitle("Оспорить бан");

        const nicknameInput = new TextInputBuilder()
          .setCustomId("nickname")
          .setLabel("Ваш игровой никнейм")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const steamInput = new TextInputBuilder()
          .setCustomId("steam")
          .setLabel("SteamID64 или ссылка на профиль Steam")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const reasonInput = new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Почему вы считаете, что бан нужно изменить?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(nicknameInput);
        const row2 = new ActionRowBuilder().addComponents(steamInput);
        const row3 = new ActionRowBuilder().addComponents(reasonInput);

        modal.addComponents(row1, row2, row3);
        await interaction.showModal(modal);
        break;
      }
      case "return_pilot_ticket": {
        const modal = new ModalBuilder()
          .setCustomId("return_pilot_ticket_modal")
          .setTitle("Вернуть пилота");

        const nicknameInput = new TextInputBuilder()
          .setCustomId("nickname")
          .setLabel("Ваш игровой никнейм")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const steamInput = new TextInputBuilder()
          .setCustomId("steam")
          .setLabel("SteamID64 или ссылка на профиль Steam")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(nicknameInput);
        const row2 = new ActionRowBuilder().addComponents(steamInput);

        modal.addComponents(row1, row2);
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
        const ticket = await Ticket.findOneAndUpdate(
          { discordChannelId: interaction.channel.id },
          { closedAt: new Date() },
          { new: true }
        );

        await interaction.reply({
          content: "Тикет закрыт. История уже сохранена в базе данных.",
          ephemeral: true,
        });

        if (ticket) {
          if (ticket.telegramChatId) {
            forwardToTelegram(ticket.telegramChatId, "Ваш тикет закрыт.");
          } else {
            try {
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
                  {
                    name: "Дата создания:",
                    value: ticket.createdAt
                      ? ticket.createdAt.toLocaleString()
                      : "Неизвестно",
                    inline: true,
                  },
                  {
                    name: "Причина",
                    value: "Не указана",
                    inline: true,
                  }
                )
                .setFooter({
                  text: `Закрыто: ${new Date().toLocaleString()}`,
                });

              const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setLabel("Посмотреть историю")
                  .setStyle(ButtonStyle.Link)
                  .setURL("https://example.com/transcript")
              );

              await interaction.user.send({
                embeds: [embed],
                components: [row],
              });

              const closedChannelId = process.env.CLOSED_TICKETS_CHANNEL_ID;
              if (closedChannelId) {
                const closedChannel =
                  interaction.guild.channels.cache.get(closedChannelId);
                if (closedChannel) {
                  await closedChannel.send({ embeds: [embed] });
                } else {
                  console.error("Канал закрытых тикетов не найден");
                }
              }
            } catch (err) {
              console.error("Ошибка отправки уведомлений:", err);
            }
          }
        }

        await interaction.channel?.delete().catch(console.error);

        break;
      }
    }
  }
});

await client.login(process.env.CLIENT_TOKEN);
export { client };
