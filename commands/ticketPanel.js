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
      `Возникла сложная ситуация? Есть предложение или идея? Мы вам поможем по любому возникшему вопросу, но просим соблюдать правила подачи заявок.
Так же рекомендуем ознакомиться с каналом ⁠https://discord.com/channels/735515208348598292/1204124602230374471 в котором описаны основные правила поведения на нашем сервере.

🔹Для вопросов и предложений по серверу
Ограничений нет, можно подавать в свободной форме.

🔹Для жалоб на игроков
Ваш никнейм, никнейм нарушителя и других причастных к инциденту.
Примерное время и описание ситуации.
Доказательства (видео или скриншоты).

❌Жалобы без доказательств или отправленные слишком поздно (более 24ч после совершения инцидента) скорее всего не будут рассмотрены.`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("report_ticket")
      .setLabel("Зарепортить")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("unban_ticket")
      .setLabel("Оспорить бан")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("return_pilot_ticket")
      .setLabel("Вернуть пилота")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ask_question_ticket")
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
