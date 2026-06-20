import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
import uploadRouter from './routes/upload';
import exportRouter from './routes/export';
import transcribeRouter from './routes/transcribe';
import jobsRouter from './routes/jobs';



const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Main App API Routes Mapping
app.use('/api/upload', uploadRouter);
app.use('/api/export', exportRouter);
app.use('/api/transcribe', transcribeRouter);
app.use('/api/jobs', jobsRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`[Server Core Active]: Route hooks listening on port ${port}`);
});