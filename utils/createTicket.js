import {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import Ticket, { Counter } from "../utils/ticketModel.js";
import { config } from "dotenv";
config();

async function getNextTicketId() {
  const counterDoc = await Counter.findOneAndUpdate(
    { _id: "ticketCounter" },
    { new: true, upsert: true }
  );
  return counterDoc.seq + 1;
}

const modRoleIds = process.env.MOD_ROLE_IDS.split(",").map((id) => id.trim());
const allowedPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.UseExternalEmojis,
];

export async function handleTicketCreation(
  interaction,
  ticketType,
  formData = {},
  categoryId = null
) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "Эту команду можно использовать только на сервере.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const { guild, user } = interaction;
  const ticketId = await getNextTicketId();
  const channel = await guild.channels.create({
    name: `обращение-${ticketId}`,
    type: ChannelType.GuildText,
    parent: categoryId || undefined,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: user.id,
        allow: allowedPermissions,
      },
      ...modRoleIds.map((roleId) => ({
        id: roleId,
        allow: allowedPermissions,
      })),
    ],
  });

  const embed = new EmbedBuilder()
    .setTitle(`Тикет: ${ticketType}`)
    .setColor(0x2f3136);

  for (const [key, value] of Object.entries(formData)) {
    if (!value) continue;
    embed.addFields({ name: key, value: value.toString(), inline: false });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("Закрыть тикет")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    embeds: [embed],
    components: [row],
  });

  let autoReply = "";
  switch (ticketType) {
    case "Жалоба":
      autoReply = `Здравствуйте, <@${user.id}>! Пожалуйста, предоставьте **видео или скриншоты** нарушения, чтобы мы могли помочь.`;
      break;
    case "Оспорить бан":
      autoReply = `Здравствуйте, <@${user.id}>!`;
      break;
    case "Вернуть пилота":
      autoReply = `Здравствуйте, <@${user.id}>! Вам заблокировали кит пилота в связи с недостатком навыков пилотирования, чтобы снять блокировку нужно предоставить видео с выполнением шагов.`;
      break;
    case "Задать вопрос":
      autoReply = `Здравствуйте, <@${user.id}>! Опишите свой вопрос, и мы постараемся помочь вам в ближайшее время.`;
      break;
    default:
      autoReply = `Здравствуйте, <@${user.id}>! Спасибо за обращение.`;
      break;
  }

  await channel.send({ content: autoReply });

  if (ticketType === "Вернуть пилота") {
    const extraMessage = `
**Важно:** Сброс скорости осуществлять с помощью манёвра j-hook (торможение, поднятием носа вверх не засчитывается)

1. Зайти на тренировочную карту (Training -> Jensen's Range)
2. Поменять карту, введя в консоль (буква ё): AdminChangeLayer yehorivka_aas_v1
2.1. (опционально) Ускорить стартовую фазу, введя в консоль: AdminSlomo 100
2.2. (опционально) Вернуть скорость на обычную, введя в консоль: AdminSlomo 1
3. Заспавнить желаемый вертолёт (список команд для ввода в консоль внизу)
4. Поставить метку на карте, куда планируете приземлиться
5. Приземлиться на указанное место
6. Поставить новую метку в другом месте над лесом/зданиями
7. Зависнуть на высоте менее 30 метров, имитировать выгрузку ресурсов
8. Посадить вертолёт на хелипад на мейне

Видео можно залить на YouTube/Яндекс Диск/Google Диск или другой общедоступный ресурс и отправить сюда ссылку  
Пример выполнения: https://youtu.be/pk7sWzJMMQs

**Команды для спавна вертолёта:**
\`\`\`
верт   | команда
------------------------------------------------------------------
UH-60M | AdminCreateVehicle /Game/Vehicles/UH60M/BP_UH60.BP_UH60_C
UH-1Y  | AdminCreateVehicle /Game/Vehicles/UH1Y/BP_UH1Y.BP_UH1Y_C
SA330  | AdminCreateVehicle /Game/Vehicles/SA330/BP_SA330.BP_SA330_C
MRH-90 | AdminCreateVehicle /Game/Vehicles/MRH90/BP_MRH90_Mag58.BP_MRH90_Mag58_C
CH-146 | AdminCreateVehicle /Game/Vehicles/CH146/BP_CH146.BP_CH146_C
Z-8G   | AdminCreateVehicle /Game/Vehicles/Z8G/BP_Z8G.BP_Z8G_C
\`\`\`
`;
    await channel.send({ content: extraMessage });
  }

  try {
    const newTicket = new Ticket({
      _id: ticketId,
      telegramChatId: null,
      discordChannelId: channel.id,
      discordUserId: user.id,
      ticketType: ticketType,
      answers: formData,
    });
    await newTicket.save();

    await interaction.editReply({
      content: `Тикет #${ticketId} создан: ${channel}`,
    });
  } catch (error) {
    console.error("Ошибка сохранения тикета в базу:", error);
    await interaction.editReply({
      content: `Произошла ошибка при создании тикета: ${error.message}`,
    });
  }
}
