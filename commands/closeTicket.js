import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
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
  try {
    const modRoleIds = process.env.MOD_ROLE_IDS.split(",").map((id) =>
      id.trim()
    );
    const memberRoles = interaction.member.roles.cache;
    const isMod = memberRoles.some((role) => modRoleIds.includes(role.id));

    if (!isMod) {
      await interaction.reply({
        content: "Закрыть тикет может только модератор",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const reason = interaction.options.getString("reason") || "Не указана";

    const ticket = await Ticket.findOneAndUpdate(
      { discordChannelId: interaction.channel.id },
      {
        closedAt: new Date(),
        closedByAdminId: interaction.user.id,
      },
      { new: true }
    );

    if (!ticket) {
      await interaction.editReply("Тикет не найден.");
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
        const ticketCreator = await interaction.client.users.fetch(
          ticket.discordUserId
        );
        await ticketCreator.send({ embeds: [embed] });
      } else {
        console.warn(
          "Не удалось отправить сообщение пользователю: ID не найден."
        );
      }
    } catch (err) {
      console.error("Ошибка отправки уведомления пользователю:", err);
    }

    try {
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
      console.error("Ошибка отправки в канал закрытых тикетов:", err);
    }

    await interaction.editReply("Тикет закрыт. Канал будет удалён.");

    if (ticket.telegramChatId) {
      try {
        await forwardToTelegram(ticket.telegramChatId, "Ваш тикет закрыт.");
      } catch (err) {
        console.error("Ошибка отправки уведомления в Telegram:", err);
      }
    }

    setTimeout(() => {
      interaction.channel
        ?.delete("Тикет закрыт командой /close")
        .catch(console.error);
    }, 2000);
  } catch (err) {
    console.error("Ошибка в команде /close:", err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(
          "Произошла ошибка при попытке закрыть тикет."
        );
      } else {
        await interaction.reply({
          content: "Произошла ошибка при попытке закрыть тикет.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (sendErr) {
      console.error(
        "Не удалось отправить сообщение об ошибке пользователю:",
        sendErr
      );
    }
  }
};

export default { data, execute };
