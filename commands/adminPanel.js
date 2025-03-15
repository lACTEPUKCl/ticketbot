import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";

const data = new SlashCommandBuilder()
  .setName("adminpanel")
  .setDescription("Создаёт сообщение с кнопками для разных тикетов")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription(
        "Канал, куда отправить сообщение о наборе администраторов"
      )
      .setRequired(true)
  );

const execute = async (interaction) => {
  const channel = interaction.options.getChannel("channel");

  const embed = new EmbedBuilder()
    .setTitle("Связь с администрацией")
    .setColor(0x2f3136)
    .setDescription(
      `Набор в администраторы сервера!
Русский народный сервер приглашает вас стать частью нашей захватывающей команды администраторов!

Если вы обладаете страстью к играм, обширным опытом и чувством ответственности, то мы именно вас ищем! Вместе мы создадим уникальное игровое пространство, где каждый игрок будет чувствовать себя как дома.

Требования:

● Ваш возраст больше 21 года
● Время проведенное на Русском Народном Сервере от 500 и более часов
● Ответственный

Что вас ждет:

● Участие в создании и управлении уникальным игровым опытом.
● Возможность внести свой вклад в развитие сервера.
● Общение с разнообразным сообществом и возможность оставить свой след в истории сервера.

Если вы готовы к вызову, если вы настоящий геймер и лидер по душе, присоединяйтесь к нам! Помогите нам сделать наш сервер лучшим местом для игры и веселья. Ваша страсть и профессионализм – ключ к успеху на Русском Народном Сервере!`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("admin_ticket")
      .setEmoji("1012116258675761253")
      .setLabel("Заявка в администраторы")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    embeds: [embed],
    components: [row],
  });

  await interaction.reply({
    content: `Сообщение о наборе администраторов отправлено в канал <#${channel.id}>!`,
    ephemeral: true,
  });
};

export default { data, execute };
