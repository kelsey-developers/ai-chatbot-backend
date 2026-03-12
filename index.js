require('dotenv').config();
const express = require('express');
const cors = require('cors');
const chatRouter = require('./routes/chat');
const { port } = require('./config/config');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/chat', chatRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ai-chatbot' });
});

app.listen(port, () => {
  console.log(`AI Chatbot backend running on port ${port}`);
});
