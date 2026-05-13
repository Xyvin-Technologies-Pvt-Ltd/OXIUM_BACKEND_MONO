require("dotenv").config();
const { validateEnv } = require("./src/config/validateEnv");
validateEnv();

const connectDB = require("./src/db");
const app = require("./src/app.js");

const initializeApp = async () => {
  await connectDB();
  const PORT = process.env.PORT || 5050;
  app.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
  });
};

initializeApp().catch((e) => {
  console.error("Startup failed", e.message || e);
  process.exit(1);
});
