import { Router } from 'express';
import { promoteToAdmin, signIn, signOut, signUp, signUpAdmin } from '../controllers/auth.controller';

const router = Router();

router.post('/sign-up', signUp);
router.post('/sign-up-admin', signUpAdmin);
router.post('/promote-to-admin', promoteToAdmin);
router.post('/sign-in', signIn);
router.post('/sign-out', signOut);

export default router;
