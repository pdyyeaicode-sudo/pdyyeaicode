import { Pool } from 'pg';

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'printrocket',
  password: process.env.PGPASSWORD || 'password',
  port: parseInt(process.env.PGPORT || '5432', 10),
});

const dummyTemplates = [
  {
    id: 'template_1',
    title: 'Minimalist Business Card',
    category: 'Business',
    tags: ['minimal', 'corporate', 'clean'],
    thumbnail_url: 'https://via.placeholder.com/300x200',
    payload_json: {
      canvasWidth: 1050,
      canvasHeight: 600,
      boxes: [
        {
          id: 't1_box1',
          role: 'headline',
          x: 100, y: 100, width: 800, height: 100, zIndex: 1,
          content: 'Jane Doe'
        },
        {
          id: 't1_box2',
          role: 'subheading',
          x: 100, y: 220, width: 800, height: 50, zIndex: 2,
          content: 'Chief Executive Officer'
        }
      ]
    }
  },
  {
    id: 'template_2',
    title: 'Festive Diwali Flyer',
    category: 'Social Media',
    tags: ['diwali', 'sale', 'festive'],
    thumbnail_url: 'https://via.placeholder.com/300x400',
    payload_json: {
      canvasWidth: 1080,
      canvasHeight: 1080,
      boxes: [
        {
          id: 't2_box1',
          role: 'headline',
          x: 90, y: 200, width: 900, height: 200, zIndex: 1,
          content: '50% OFF Diwali Sale'
        },
        {
          id: 't2_box2',
          role: 'cta',
          x: 340, y: 800, width: 400, height: 100, zIndex: 2,
          content: 'Shop Now'
        }
      ]
    }
  },
  {
    id: 'template_3',
    title: 'Modern Presentation Slide',
    category: 'Presentation',
    tags: ['pitch', 'business', 'modern'],
    thumbnail_url: 'https://via.placeholder.com/400x225',
    payload_json: {
      canvasWidth: 1920,
      canvasHeight: 1080,
      boxes: [
        {
          id: 't3_box1',
          role: 'headline',
          x: 200, y: 400, width: 1520, height: 150, zIndex: 1,
          content: 'Q4 Financial Results'
        }
      ]
    }
  }
];

async function seed() {
  try {
    for (const t of dummyTemplates) {
      await pool.query(
        `INSERT INTO templates (id, title, category, tags, thumbnail_url, payload_json)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           category = EXCLUDED.category,
           tags = EXCLUDED.tags,
           thumbnail_url = EXCLUDED.thumbnail_url,
           payload_json = EXCLUDED.payload_json,
           updated_at = CURRENT_TIMESTAMP`,
        [t.id, t.title, t.category, t.tags, t.thumbnail_url, JSON.stringify(t.payload_json)]
      );
      console.log(`Seeded template: ${t.title}`);
    }
    console.log('Seeding completed successfully.');
  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    pool.end();
  }
}

seed();
