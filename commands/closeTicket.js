// closeTicket.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import Ticket from "../utils/ticketModel.js";
import { forwardToTelegram } from "../telegram/telegramBot.js";
import { config } from "dotenv";
config();

const data = new SlashCommandBuilder()
  .setName("close")
  .setDescription("Закрывает тикет")
  .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Причина закрытия тикета")
      .setRequired(false)
  );

const execute = async (interaction) => {
  const modRoleIds = process.env.MOD_ROLE_IDS.split(",").map((id) => id.trim());
  const memberRoles = interaction.member.roles.cache;
  const isMod = memberRoles.some((role) => modRoleIds.includes(role.id));
  if (!isMod) {
    await interaction.reply({
      content: "Закрыть тикет может только модератор",
      ephemeral: true,
    });
    return;
  }

  const reason = interaction.options.getString("reason") || "Не указана";
  const ticket = await Ticket.findOneAndUpdate(
    { discordChannelId: interaction.channel.id },
    { closedAt: new Date() },
    { new: true }
  );

  if (!ticket) {
    await interaction.reply({ content: "Тикет не найден", ephemeral: true });
    return;
  }

  const createdAt = ticket.createdAt
    ? ticket.createdAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })
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
      { name: "Закрыл:", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Дата создания:", value: createdAt, inline: true },
      { name: "Причина", value: reason, inline: true }
    )
    .setFooter({ text: `Закрыто: ${closedAt}` });

  try {
    if (ticket.discordUserId) {
      const ticketCreator = await interaction.client.users.fetch(
        ticket.discordUserId
      );
      await ticketCreator.send({ embeds: [embed] });
    } else {
      console.warn(
        "Не удалось отправить сообщение пользователю: ID не найден."
      );
    }

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

  await interaction.reply({ content: "Тикет закрыт.", ephemeral: true });

  if (ticket.telegramChatId) {
    forwardToTelegram(ticket.telegramChatId, "Ваш тикет закрыт.");
  }

  await interaction.channel.delete().catch(console.error);
};

export default { data, execute };
