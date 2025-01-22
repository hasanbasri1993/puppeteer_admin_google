import { Router } from 'express';
const router = Router();
import { turnOffChallenge } from '../controllers/turnOff';
import { resetPassword } from '../controllers/resetPassword';
import initializationMiddleware from '../middlewares/initializationMiddleware';

router.post('/turn_off', turnOffChallenge);
router.post('/reset_password', resetPassword);

export default router;