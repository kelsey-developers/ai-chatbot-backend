module.exports = {
  port: process.env.PORT || 3003,
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  groqApiKey: process.env.GROQ_API_KEY,
};
