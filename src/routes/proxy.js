import { Router } from 'express';
import { handleMessages, countTokens } from '../proxy.js';
import { loadConfig } from '../config.js';

const router = Router();
router.post('/messages', async (req, res, next) => { try { await handleMessages(req, res); } catch (e) { next(e); } });
router.post('/messages/count_tokens', countTokens);
router.get('/models', (_req, res) => {
  const c = loadConfig();
  const ids = [...new Set([c.mainModel, c.fastModel].filter(Boolean))];
  const data = ids.map(id => ({ type: 'model', id, display_name: id, created_at: '2024-01-01T00:00:00Z' }));
  res.json({ data, has_more: false, first_id: data[0]?.id ?? null, last_id: data.at(-1)?.id ?? null });
});
export default router;
