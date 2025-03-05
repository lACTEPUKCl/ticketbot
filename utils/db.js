// dbMongoose.js
import mongoose from "mongoose";
import { config } from "dotenv";
config();

const uri = process.env.MONGO_URI;
const dbName = "ticketBotDB";

mongoose
  .connect(uri, {
    dbName: dbName,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Подключение к MongoDB установлено");
    const ticketsCollection = mongoose.connection.db.collection("tickets");
    ticketsCollection.find().toArray((err) => {
      if (err) console.error(err);
    });
  })
  .catch((err) => console.error("Ошибка подключения к MongoDB:", err));
