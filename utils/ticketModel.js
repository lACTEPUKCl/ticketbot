import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
const Counter = mongoose.model("Counter", counterSchema, "counters");

const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  content: { type: String, required: false },
  discordId: { type: String, required: false },
  telegramId: { type: String, required: false },
  attachments: { type: [String], default: [] },
  timestamp: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema({
  _id: { type: Number },
  telegramChatId: { type: String },
  discordChannelId: { type: String, required: true },
  discordUserId: { type: String, required: false },
  ticketType: { type: String, required: true },
  answers: { type: Map, of: String, default: {} },
  messages: { type: [messageSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  closedAt: { type: Date },
});

ticketSchema.pre("save", async function (next) {
  if (this.isNew) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: "ticketCounter" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this._id = counter.seq;
      next();
    } catch (err) {
      next(err);
    }
  } else {
    next();
  }
});

const Ticket = mongoose.model("Ticket", ticketSchema, "tickets");

export default Ticket;
export { Counter };
