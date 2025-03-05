import { config } from "dotenv";
config();
import "./discord/discordBot.js";
import "./telegram/telegramBot.js";
import Ticket from "./utils/ticketModel.js";
import { ticketMap } from "./telegram/ticketMap.js";
import "./utils/db.js";

async function restoreTicketMap() {
  const openTickets = await Ticket.find({ closedAt: { $exists: false } });
  openTickets.forEach((ticket) => {
    ticketMap.set(ticket.telegramChatId, ticket.discordChannelId);
  });
  console.log("Восстановлено открытых тикетов:", openTickets.length);
}

restoreTicketMap();
console.log("Боты Discord и Telegram запущены");
