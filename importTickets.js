// importTicketsFromFolder.js
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { config } from "dotenv";
config();

import Ticket from "./utils/ticketModel.js"; // путь к вашей модели тикета

/**
 * Импортирует один тикет из файла.
 * @param {string} filePath Путь к файлу.
 * @param {string} ticketNumber Номер тикета (имя файла без расширения).
 */
async function importTicketFromFile(filePath, ticketNumber) {
  // Читаем файл
  const fileData = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(fileData);

  // Преобразуем сообщения
  const messages = (data.messages || []).map((msg) => {
    const user = data.entities?.users?.[msg.author];
    return {
      sender: user ? user.username : `${msg.author}`,
      // Если content пустой, можно оставить пустую строку или задать значение по умолчанию
      content: msg.content || "",
      discordId: msg.author, // предполагаем, что поле author содержит discord ID
      telegramId: undefined,
      attachments: msg.attachments ? msg.attachments.map((att) => att.url) : [],
      timestamp: new Date(msg.timestamp),
    };
  });

  const ticketDoc = new Ticket({
    _id: parseInt(ticketNumber),
    telegramChatId: null,
    discordChannelId: "imported_ticket_" + ticketNumber,
    discordUserId: messages[0]?.discordId || "unknown",
    ticketType: "imported",
    answers: {},
    messages: messages,
    createdAt: messages.length ? messages[0].timestamp : new Date(),
    closedAt: messages.length
      ? messages[messages.length - 1].timestamp
      : new Date(),
  });

  await ticketDoc.save();
  console.log(
    `Импортирован тикет с _id: ${ticketDoc._id} из файла ${ticketNumber}.json`
  );
}

async function processFolder(folderPath) {
  const files = fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith(".json"));

  files.sort((a, b) => {
    const numA = parseInt(path.basename(a, ".json"), 10);
    const numB = parseInt(path.basename(b, ".json"), 10);
    return numA - numB;
  });
  for (const file of files) {
    if (file.endsWith(".json")) {
      // Извлекаем номер тикета (имя файла без расширения)
      const ticketNumber = path.basename(file, ".json");
      const filePath = path.join(folderPath, file);
      try {
        await importTicketFromFile(filePath, ticketNumber);
      } catch (err) {
        console.error(`Ошибка при импорте файла ${file}:`, err);
      }
    }
  }
}

async function runImport() {
  try {
    // Подключаемся к базе данных
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "ticketBotDB",
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Подключение к MongoDB установлено");

    // Укажите путь к папке с JSON-файлами
    const folderPath = "C:\\Users\\Admin\\Desktop\\transcripts";
    await processFolder(folderPath);

    console.log("Импорт завершен");
    process.exit(0);
  } catch (err) {
    console.error("Ошибка при импорте тикетов:", err);
    process.exit(1);
  }
}

runImport();
