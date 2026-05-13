const mongoose = require("mongoose");

const connectDB = async () => {
  const mongoUrl = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME;

  if (!mongoUrl || !dbName) {
    console.error("[db] Missing MONGO_URI or DB_NAME");
    process.exit(1);
  }

  try {
    const connectionInstance = await mongoose.connect(`${mongoUrl}/${dbName}`);

    console.log(
      `\n MongoDB connected !! DB HOST : ${connectionInstance.connection.host}/${dbName}`
    )

    mongoose.connection.on("connected", () => {
      console.log(`Mongoose connected to db ${dbName}`)
    })

    mongoose.connection.on("error", (err) => {
      console.log(err.message)
    })

    mongoose.connection.on("disconnected", () => {
      console.log("Mongoose connection is disconnected")
    })

    process.on("SIGINT", async () => {
      await mongoose.connection.close()
      console.log("Mongoose connection closed through app termination")
      process.exit(0)
    })
  } catch (error) {
    console.log("[db] Error:" + error.message)
    process.exit(1)
  }
}

module.exports = connectDB
