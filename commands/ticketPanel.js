// ticketPanel.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";

const data = new SlashCommandBuilder()
  .setName("ticketpanel")
  .setDescription("Создаёт сообщение с кнопками для разных тикетов")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Канал, куда отправить панель тикетов")
      .setRequired(true)
  );

const execute = async (interaction) => {
  const channel = interaction.options.getChannel("channel");

  const embed = new EmbedBuilder()
    .setTitle("Связь с администрацией")
    .setColor(0x2f3136)
    .setDescription(
      `Возникла сложная ситуация? Есть предложение или идея? Мы поможем вам по любому вопросу, но просим соблюдать правила подачи заявок.
Также рекомендуем ознакомиться с каналом ⁠https://discord.com/channels/735515208348598292/1204124602230374471, где описаны основные правила поведения на сервере.

🔹 Для вопросов и предложений по серверу:
Ограничений нет, можно подавать в свободной форме.

🔹 Для жалоб на игроков:
Укажите свой никнейм, ник нарушителя и других причастных к инциденту, время и описание ситуации, а также доказательства (видео или скриншоты).

❌ Жалобы без доказательств или отправленные слишком поздно (более 24 часов после инцидента) могут не рассматриваться.`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("report_ticket")
      .setEmoji("965120784341295154")
      .setLabel("Зарепортить")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("unban_ticket")
      .setEmoji("1162775517766881411")
      .setLabel("Оспорить бан")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("return_pilot_ticket")
      .setEmoji("1256702368276287641")
      .setLabel("Вернуть пилота")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ask_question_ticket")
      .setEmoji("1162775127117799584")
      .setLabel("Задать вопрос")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    embeds: [embed],
    components: [row],
  });

  await interaction.reply({
    content: `Панель тикетов успешно создана в канале <#${channel.id}>!`,
    ephemeral: true,
  });
};

export default { data, execute };
