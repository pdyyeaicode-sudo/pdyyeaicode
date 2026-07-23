import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'printrocket',
  password: process.env.PGPASSWORD || 'password',
  port: parseInt(process.env.PGPORT || '5432', 10),
});

// GET /api/templates
app.get('/api/templates', async (req, res) => {
  try {
    const { category, search } = req.query;
    
    let query = 'SELECT id, title, category, tags, thumbnail_url FROM templates WHERE 1=1';
    const params: any[] = [];
    
    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    
    if (search) {
      params.push(`%${search}%`);
      query += ` AND title ILIKE $${params.length}`;
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/templates/:id
app.get('/api/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Return full JSON layer graph
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = 8081;
app.listen(PORT, () => {
  console.log(`Template REST API running on http://localhost:${PORT}`);
});
