const Groq = require('groq-sdk');
const axios = require('axios');
const { authServiceUrl, groqApiKey } = require('../config/config');

const groq = new Groq({ apiKey: groqApiKey });

const SYSTEM_PROMPT = `You are a helpful assistant for a vacation rental / property booking platform called Kelsey. You help users find units (apartments, condos, villas, etc.) to rent.

You have access to real-time unit data. Each unit in the context is tagged with [unit:ID] where ID is the unit's id. Unit descriptions and amenities are included so you can match vibe/style preferences.

IMPORTANT: When recommending or suggesting a unit, you MUST include its [unit:ID] tag in your response. Example: "I recommend [unit:1] - a 2-bed condo in Manila at ₱3,500/night." The [unit:ID] tag enables the user to see a clickable preview. Include the tag for every unit you recommend.

VIBE & STYLE MATCHING: When users ask for cozy, cute, romantic, modern, minimalist, spacious, homey, charming, stylish, luxurious, budget-friendly, family-friendly, etc., match units based on:
- Description text (e.g. "cozy" in description → cozy vibe)
- Amenities (e.g. fireplace, balcony, garden → cozy/cute)
- Property type (studio, cabin → often cozy; villa, penthouse → spacious/luxurious)
- Bedroom count (1-bed, studio → cozy; 3+ bed → spacious/family)
Use your judgment to find the best fits. If no perfect match, suggest the closest options.

Format unit info clearly: name, location (city, address), price (₱ per night), bedrooms, bathrooms, property type. If the user shared their location (latitude/longitude), units are sorted by distance - mention the nearest ones first.

Be concise but friendly.

NO MATCH: When the user asks for a specific location (e.g. "near Manila", "in Cebu") or criteria and NO units in the context match, do NOT suggest any units. Simply tell them politely that nothing matches their search and ask them to try another location or different criteria. Example: "I don't have any units in Manila right now. Try another city or search for something different!"`;

/**
 * Haversine distance in km between two lat/long points
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Fetch available units from auth-service
 */
async function fetchUnits(authServiceUrl, userLat, userLon) {
  const url = `${authServiceUrl}/api/units?limit=100`;
  const { data } = await axios.get(url, { timeout: 10000 });

  if (!Array.isArray(data)) return [];

  let units = data;

  if (
    userLat != null &&
    userLon != null &&
    Number.isFinite(userLat) &&
    Number.isFinite(userLon)
  ) {
    units = units
      .filter((u) => u.latitude != null && u.longitude != null)
      .map((u) => ({
        ...u,
        _distanceKm: haversineKm(userLat, userLon, u.latitude, u.longitude),
      }))
      .sort((a, b) => (a._distanceKm || Infinity) - (b._distanceKm || Infinity));
  }

  return units.slice(0, 30);
}

/**
 * Build units context string for the model
 */
function buildUnitsContext(units) {
  if (!units || units.length === 0) {
    return 'No units are currently available.';
  }
  return units
    .map((u, i) => {
      const desc = (u.description || '').slice(0, 120);
      const amenities = Array.isArray(u.amenities) ? u.amenities.join(', ') : '';
      const extra = [desc, amenities].filter(Boolean).join(' | ');
      return `${i + 1}. [unit:${u.id}] ${u.title || u.unit_name || 'Unit'} - ${u.city || 'N/A'}, ${u.location || ''} | ₱${u.price ?? u.base_price ?? '?'}/night | ${u.bedrooms ?? '?'} bed, ${u.bathrooms ?? '?'} bath | ${u.property_type || u.unit_type || 'property'}${u._distanceKm != null ? ` (${u._distanceKm.toFixed(1)} km away)` : ''}${extra ? ` | ${extra}` : ''}`;
    })
    .join('\n');
}

/** Sanitize unit for API response - remove internal fields */
function sanitizeUnit(u) {
  const { _distanceKm, ...rest } = u;
  return rest;
}

/**
 * POST /api/chat
 * Body: { message: string, history?: Array<{role, content}>, latitude?: number, longitude?: number }
 */
async function chat(req, res) {
  try {
    const { message, history = [], latitude, longitude } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    if (!groqApiKey) {
      return res.status(503).json({ error: 'Groq API key is not configured' });
    }

    const user = req.authUser;
    const userLat = latitude != null ? parseFloat(latitude) : null;
    const userLon = longitude != null ? parseFloat(longitude) : null;

    const units = await fetchUnits(authServiceUrl, userLat, userLon);
    const unitsContext = buildUnitsContext(units);

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n[Current available units - use this to answer questions about properties]\n${unitsContext}` },
    ];

    if (Array.isArray(history) && history.length > 0) {
      for (const h of history.slice(-10)) {
        if (h.role === 'user' && h.content) {
          messages.push({ role: 'user', content: h.content });
        } else if ((h.role === 'model' || h.role === 'assistant') && h.content) {
          messages.push({ role: 'assistant', content: h.content });
        }
      }
    }

    messages.push({ role: 'user', content: message.trim() });

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
    });

    const text = response.choices?.[0]?.message?.content || '';

    res.json({
      message: text.trim(),
      units: units.map(sanitizeUnit),
    });
  } catch (error) {
    console.error('Chat error:', error);
    const status = error.status ?? error.response?.status;
    if (status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }
    const msg = error.message ?? error.response?.data?.error?.message;
    if (msg) {
      return res.status(status && status >= 400 ? status : 502).json({
        error: 'AI service error: ' + msg,
      });
    }
    res.status(500).json({
      error: error.message || 'Failed to generate response',
    });
  }
}

module.exports = { chat };
