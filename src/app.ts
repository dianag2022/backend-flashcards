import cors from 'cors';
import express, { Application } from 'express';
import apiRouter from './routes/api.routes';
import healthRouter from './routes/health.route';

const app: Application = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', apiRouter);
app.use('/api/health', healthRouter);

export default app;
