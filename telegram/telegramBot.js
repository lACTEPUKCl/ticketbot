// telegramBot.js
import TelegramBot from "node-telegram-bot-api";
import { config } from "dotenv";
config();
import { ticketMap } from "./ticketMap.js";
import { client as discordClient } from "../discord/discordBot.js";
import Ticket, { Counter } from "../utils/ticketModel.js";
import fs from "fs";
import {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  uploadVideoToVKCommunity,
  uploadPhotoToVK,
  uploadDocumentToVK,
} from "../utils/vkUploader.js";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const TELEGRAM_TICKET_CATEGORY_ID = process.env.TELEGRAM_TICKET_CATEGORY_ID;
const tgBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const attachmentCache = new Map();
const conversationState = new Map();
const ticketQuestions = {
  report_ticket: [
    { field: "nickname", question: "Введите ваш игровой никнейм:" },
    {
      field: "steam",
      question: "Введите SteamID64 или ссылку на профиль Steam (если есть):",
    },
    { field: "offender", question: "Введите никнейм нарушителя:" },
    { field: "server", question: "Введите название сервера:" },
    { field: "details", question: "Введите подробное описание нарушения:" },
  ],
  unban_ticket: [
    { field: "nickname", question: "Введите ваш игровой никнейм:" },
    {
      field: "steam",
      question: "Введите SteamID64 или ссылку на профиль Steam (если есть):",
    },
    { field: "reason", question: "Введите причину обжалования бана:" },
  ],
  return_pilot_ticket: [
    { field: "nickname", question: "Введите ваш игровой никнейм:" },
    {
      field: "steam",
      question: "Введите SteamID64 или ссылка на профиль Steam (если есть):",
    },
  ],
};

tgBot.onText(/\/start/, (msg) => {
  const chatIdStr = msg.chat.id.toString();
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Зарепортить", callback_data: "report_ticket" },
          { text: "Оспорить бан", callback_data: "unban_ticket" },
        ],
        [{ text: "Вернуть пилота", callback_data: "return_pilot_ticket" }],
      ],
    },
  };
  tgBot.sendMessage(chatIdStr, "Выберите тип тикета:", options);
});

tgBot.on("callback_query", async (callbackQuery) => {
  const data = callbackQuery.data;
  const msg = callbackQuery.message;
  const chatIdStr = msg.chat.id.toString();

  tgBot.answerCallbackQuery(callbackQuery.id);

  if (!ticketQuestions[data]) {
    tgBot.sendMessage(chatIdStr, "Неизвестный тип тикета.");
    return;
  }

  conversationState.delete(chatIdStr);
  conversationState.set(chatIdStr, {
    ticketType: data,
    answers: {},
    currentQuestionIndex: 0,
    questions: ticketQuestions[data],
  });

  const firstQuestion = ticketQuestions[data][0].question;
  tgBot.sendMessage(chatIdStr, firstQuestion);
});

tgBot.on("message", async (msg) => {
  const chatIdStr = msg.chat.id.toString();

  if (conversationState.has(chatIdStr)) {
    const state = conversationState.get(chatIdStr);
    const currentIndex = state.currentQuestionIndex;
    const currentField = state.questions[currentIndex].field;
    state.answers[currentField] = msg.text;
    state.currentQuestionIndex++;

    if (state.currentQuestionIndex < state.questions.length) {
      const nextQuestion = state.questions[state.currentQuestionIndex].question;
      tgBot.sendMessage(chatIdStr, nextQuestion);
    } else {
      const answers = state.answers;
      const ticketTypeMap = {
        report_ticket: "Жалоба",
        unban_ticket: "Оспорить бан",
        return_pilot_ticket: "Вернуть пилота",
      };
      const discordTicketType =
        ticketTypeMap[state.ticketType] || "Задать вопрос";
      const modRoleIds = process.env.MOD_ROLE_IDS.split(",").map((id) =>
        id.trim()
      );
      const modAllowedPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
      ];

      try {
        const guild = discordClient.guilds.cache.get(GUILD_ID);
        if (!guild) {
          console.error(`Гильдия с ID ${GUILD_ID} не найдена!`);
          tgBot.sendMessage(chatIdStr, "Ошибка: Discord гильдия не найдена.");
          conversationState.delete(chatIdStr);
          return;
        }

        const ticketId = await getNextTicketId();
        const channel = await guild.channels.create({
          name: `обращение-${ticketId}-TG`,
          type: ChannelType.GuildText,
          parent: TELEGRAM_TICKET_CATEGORY_ID,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            ...modRoleIds.map((roleId) => ({
              id: roleId,
              allow: modAllowedPermissions,
            })),
          ],
        });

        ticketMap.set(chatIdStr, channel.id);

        const embed = new EmbedBuilder()
          .setTitle("Тикет из Telegram")
          .setDescription(
            `Пользователь: ${
              msg.from.username || msg.from.first_name
            }\nТип: ${discordTicketType}`
          )
          .setColor(0x2f3136);
        for (const [key, value] of Object.entries(answers)) {
          embed.addFields({ name: key, value: value || "—", inline: false });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("Закрыть тикет")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("close_ticket_with_reason")
            .setLabel("Закрыть с причиной")
            .setStyle(ButtonStyle.Secondary)
        );

        await channel.send({ embeds: [embed], components: [row] });
        tgBot.sendMessage(
          chatIdStr,
          "Ваш тикет создан в Discord. Ожидайте ответа от поддержки."
        );

        ticketMap.set(chatIdStr, channel.id);

        const newTicket = new Ticket({
          telegramChatId: chatIdStr,
          discordChannelId: channel.id,
          ticketType: state.ticketType,
          answers: answers,
        });
        await newTicket.save();
      } catch (error) {
        console.error("Ошибка при создании тикета в Discord:", error);
        tgBot.sendMessage(
          chatIdStr,
          "Ошибка при создании тикета. Попробуйте позже."
        );
      }
      conversationState.delete(chatIdStr);
    }
  } else if (ticketMap.has(chatIdStr)) {
    const channelId = ticketMap.get(chatIdStr);
    const guild = discordClient.guilds.cache.get(GUILD_ID);
    let telegramId;
    const username = msg.from.username
      ? `@${msg.from.username}`
      : `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();

    if (guild) {
      const channel = guild.channels.cache.get(channelId);
      if (channel) {
        const telegramUser = msg.from.username || msg.from.first_name;
        const textContent = msg.text || "";
        const attachments = [];

        // Обработка видео
        if (msg.video) {
          const videoFileId = msg.video.file_id;
          if (attachmentCache.has(videoFileId)) {
            attachments.push(attachmentCache.get(videoFileId));
          } else {
            try {
              const videoPath = await tgBot.downloadFile(
                videoFileId,
                "./downloads"
              );
              const title = `Видео от ${telegramUser}`;
              const description = "Загружено через Telegram-бот";
              const youtubeUrl = await uploadVideoToVKCommunity(
                videoPath,
                title,
                description
              );
              attachments.push(youtubeUrl);
              attachmentCache.set(videoFileId, youtubeUrl);
            } catch (err) {
              console.error("Ошибка загрузки видео на YouTube:", err);
            }
          }
        }

        if (msg.photo && msg.photo.length) {
          const photoFileId = msg.photo[msg.photo.length - 1].file_id;
          if (attachmentCache.has(photoFileId)) {
            attachments.push(attachmentCache.get(photoFileId));
          } else {
            try {
              const localDownloadPath = await tgBot.downloadFile(
                photoFileId,
                "./downloads"
              );
              const vkPhotoUrl = await uploadPhotoToVK(localDownloadPath);
              attachments.push(vkPhotoUrl);
              attachmentCache.set(photoFileId, vkPhotoUrl);
              fs.unlinkSync(localDownloadPath);
            } catch (err) {
              console.error("Ошибка загрузки фото в VK:", err);
            }
          }
        }

        if (msg.document) {
          const docFileId = msg.document.file_id;
          if (attachmentCache.has(docFileId)) {
            attachments.push(attachmentCache.get(docFileId));
          } else {
            try {
              const localDownloadPath = await tgBot.downloadFile(
                docFileId,
                "./downloads"
              );
              const fileName = msg.document.file_name || `doc_${docFileId}`;
              const vkDocUrl = await uploadDocumentToVK(
                localDownloadPath,
                fileName
              );
              attachments.push(vkDocUrl);
              attachmentCache.set(docFileId, vkDocUrl);
              fs.unlinkSync(localDownloadPath);
            } catch (err) {
              console.error("Ошибка загрузки документа в VK:", err);
            }
          }
        }

        try {
          if (msg.from.is_bot) return;

          let finalMessage = textContent;

          if (attachments.length > 0) {
            finalMessage += "\n" + attachments.join("\n");
          }

          telegramId = msg.from.id;

          await channel.send(`[Bot] Discord (${username}): ${finalMessage}`);
        } catch (err) {
          if (err.code === 40005) {
            console.error(
              "Файл слишком большой для Discord, отправляем пути как текст."
            );
            let fallbackMessage = textContent;
            attachments.forEach((p) => {
              fallbackMessage += `\n${p}`;
            });
            await channel.send(
              `[Bot] Discord (${msg.username}): ${fallbackMessage}`
            );
          } else {
            console.error("Ошибка отправки сообщения в Discord:", err);
          }
        }

        await Ticket.findOneAndUpdate(
          { telegramChatId: chatIdStr, discordChannelId: channelId },
          {
            $push: {
              messages: {
                sender: username,
                telegramId: telegramId,
                content: textContent,
              },
            },
          },
          { new: true, upsert: true }
        );
      } else {
        console.log("Discord-канал не найден для chatId:", chatIdStr);
      }
    } else {
      console.log("Discord-гильдия не найдена");
    }
  }
});

export function forwardToTelegram(tgChatId, messageContent) {
  if (
    !messageContent ||
    messageContent.trim().match(/^[Bot] Discord \([^)]+\):\s*$/)
  )
    return;
  tgBot.sendMessage(tgChatId, `[Bot] ${messageContent}`);
}

async function getNextTicketId() {
  const counterDoc = await Counter.findOneAndUpdate(
    { _id: "ticketCounter" },
    { new: true, upsert: true }
  );
  return counterDoc.seq + 1;
}

export { tgBot };
