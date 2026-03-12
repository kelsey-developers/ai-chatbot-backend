const axios = require('axios');
const { authServiceUrl } = require('../config/config');

/**
 * Validates JWT via auth-service /api/auth/userinfo.
 * Any authenticated user (Guest, Agent, Admin, etc.) can use the chat.
 */
async function requireAuthUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);

    const response = await axios.get(`${authServiceUrl}/api/auth/userinfo`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      validateStatus: () => true,
    });

    if (response.status !== 200) {
      return res.status(401).json({
        error: response.data?.error || 'Invalid or expired token',
      });
    }

    req.authUser = response.data;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Auth service unavailable',
      });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { requireAuthUser };
