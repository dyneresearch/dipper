import express from 'express';
import { authenticate } from './middleware/auth.js';
import { UserService } from './services/user.js';

const app = express();
const port = 3000;

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

/**
 * List all users with pagination
 */
app.get('/api/users', authenticate, async (req, res) => {
  const users = await UserService.listUsers();
  res.json({ users });
});

/**
 * Create a new user account
 */
app.post('/api/users', async (req, res) => {
  const { email, password } = req.body;
  const user = await UserService.createUser(email, password);
  res.status(201).json({ user });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

