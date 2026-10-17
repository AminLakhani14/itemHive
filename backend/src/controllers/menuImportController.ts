import Joi from 'joi';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { extractOldMenu, InvalidMenuFileError } from '../services/oldMenuImport';
import { getGeminiKeys, GeminiQuotaError, GeminiRequestError } from '../services/geminiKeys';

const schema = Joi.object({ file: Joi.string().max(2_800_000), text: Joi.string().trim().min(3).max(20_000) }).xor('file', 'text');
const active = new Set<string>();
export async function importOldMenu(req: AuthRequest, res: Response) {
    if (req.user?.role !== 'super_admin' && req.user?.digitalMenuAccess === 'none') return res.status(403).json({ message: 'Digital Menu access has not been enabled for this account' });
    const { value, error } = schema.validate(req.body, { convert: false });
    if (error) return res.status(400).json({ message: 'Upload one menu photo or PDF up to 2 MB, or paste menu text (up to 20,000 characters).' });
    if (!getGeminiKeys().length) return res.status(503).json({ message: 'AI menu import is not configured yet. Ask your administrator to configure the Google AI key.' });
    const key = `${req.user!.businessId}:${req.user!.id}`;
    if (active.has(key)) return res.status(409).json({ message: 'Your previous menu is still being read. Please wait for it to finish.' });
    active.add(key);
    try { return res.json(await extractOldMenu(value)); }
    catch (err) {
        if (err instanceof InvalidMenuFileError) return res.status(400).json({ message: err.message });
        if (err instanceof GeminiQuotaError) return res.status(503).json({ message: 'The AI service has reached its current quota. Please try again later.' });
        if (err instanceof GeminiRequestError) {
            const messages = { connection: 'The server could not connect to Google AI. Please retry.', timeout: 'Google AI took too long to read the menu. Please retry.', credentials: 'Google AI rejected the configured credentials. Ask your administrator to check them.', model: 'The configured AI model is unavailable. Ask your administrator to update it.', provider: 'Google AI is experiencing high demand. Please retry shortly.' };
            return res.status(err.code === 'timeout' ? 504 : 503).json({ message: messages[err.code] });
        }
        return res.status(502).json({ message: 'The menu could not be read reliably. Try a clearer photo, a PDF, or paste the menu text. Your current menu has not changed.' });
    } finally { active.delete(key); }
}
