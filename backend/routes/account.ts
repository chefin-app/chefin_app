import express from 'express';
import type { AccountRequest } from '../accountAccess';
import { requireReadableAccount } from '../accountAccess';

const router = express.Router();

router.get('/status', requireReadableAccount, (req: AccountRequest, res) => {
  res.json({ account: req.account });
});

export default router;
