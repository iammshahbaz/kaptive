const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// const { ObjectId } = require('');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = 'your_jwt_secret'; 

app.use(express.json());

// Middleware to authenticate users
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// User Registration
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { email, password: hashedPassword },
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

// User Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
  res.json({ token });
});

// CRUD operations for Transactions
app.post('/transactions', authenticateToken, async (req, res) => {
  const { type, amount, categoryId } = req.body;
  const userId = req.user.id;
  try {
    const transaction = await prisma.transaction.create({
      data: { type, amount, categoryId, userId },
    });
    res.status(201).json(transaction);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/transactions', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const transactions = await prisma.transaction.findMany({ where: { userId: userId.toString() } });
  res.json(transactions);
});

app.patch('/transactions/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { type, amount, categoryId } = req.body;
  try {
    const transaction = await prisma.transaction.update({
      where: { id: id.toString() },
      data: { type, amount, categoryId },
    });
    res.json(transaction);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/transactions/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.transaction.delete({ where: { id: id.toString() } });
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Budget Creation and Tracking
app.post('/budgets', authenticateToken, async (req, res) => {
  const { amount, month, year } = req.body;
  const userId = req.user.id;
  try {
    const budget = await prisma.budget.create({
      data: { amount, month, year, userId },
    });
    res.status(201).json(budget);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/budgets', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const budgets = await prisma.budget.findMany({ where: { userId: userId.toString() } });
  res.json(budgets);
});

// Monthly Financial Reports
app.get('/reports/monthly', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { month, year } = req.query;

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: userId.toString(),
      date: {
        gte: new Date(`${year}-${month}-01`),
        lt: new Date(new Date(`${year}-${month}-01`).setMonth(new Date(`${year}-${month}-01`).getMonth() + 1)),
      },
    },
  });

  const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const balance = income - expenses;

  res.json({ income, expenses, balance });
});

// Category-wise Expense Tracking
app.get('/reports/category', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { month, year } = req.query;

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: userId.toString(),
      date: {
        gte: new Date(`${year}-${month}-01`),
        lt: new Date(new Date(`${year}-${month}-01`).setMonth(new Date(`${year}-${month}-01`).getMonth() + 1)),
      },
    },
    include: { category: true },
  });

  const categoryExpenses = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => {
      if (!acc[t.category.name]) {
        acc[t.category.name] = 0;
      }
      acc[t.category.name] += t.amount;
      return acc;
    }, {});

  res.json(categoryExpenses);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
