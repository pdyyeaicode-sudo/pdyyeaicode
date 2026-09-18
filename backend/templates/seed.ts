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
      schemaVersion: 1,
      name: 'Minimalist Business Card',
      activePageId: 'page_1',
      activeArtboardId: 'artboard_1',
      pages: [
        {
          id: 'page_1',
          name: 'Front',
          artboards: [
            {
              id: 'artboard_1',
              width: 1050,
              height: 600,
              printMeta: { bleed: 0, margins: 0, trim: 0, scale: 1 },
              defs: '',
              rootAttributes: {},
              layers: [
                {
                  id: 'bg_1',
                  role: 'background',
                  name: 'Background',
                  editable: true,
                  locked: false,
                  visible: true,
                  opacity: 100,
                  kind: 'rect',
                  field: 'bg',
                  geometry: { type: 'rect', x: 0, y: 0, width: 1050, height: 600 },
                  fill: '#ffffff',
                  stroke: 'none',
                  strokeWidth: 0
                },
                {
                  id: 't1_txt1',
                  role: 'headline',
                  name: 'Headline',
                  editable: true,
                  locked: false,
                  visible: true,
                  opacity: 100,
                  kind: 'text',
                  elementId: 'headline1',
                  field: 'name',
                  content: 'Jane Doe',
                  x: 100,
                  y: 100,
                  fontFamily: 'Inter',
                  fontSize: 64,
                  fontWeight: 'bold',
                  textAlign: 'left',
                  fill: '#1a1a1a'
                },
                {
                  id: 't1_txt2',
                  role: 'body',
                  name: 'Subheading',
                  editable: true,
                  locked: false,
                  visible: true,
                  opacity: 100,
                  kind: 'text',
                  elementId: 'subheading1',
                  field: 'title',
                  content: 'Chief Executive Officer',
                  x: 100,
                  y: 180,
                  fontFamily: 'Inter',
                  fontSize: 32,
                  fontWeight: 'normal',
                  textAlign: 'left',
                  fill: '#666666'
                }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: 'template_2',
    title: 'Instagram Post - Sale',
    category: 'Social Media',
    tags: ['instagram', 'sale', 'promo'],
    thumbnail_url: 'https://via.placeholder.com/300x300',
    payload_json: {
      schemaVersion: 1,
      name: 'Instagram Post',
      activePageId: 'page_1',
      activeArtboardId: 'artboard_1',
      pages: [
        {
          id: 'page_1',
          name: 'Post',
          artboards: [
            {
              id: 'artboard_1',
              width: 1080,
              height: 1080,
              printMeta: { bleed: 0, margins: 0, trim: 0, scale: 1 },
              defs: '',
              rootAttributes: {},
              layers: [
                {
                  id: 'bg_2',
                  role: 'background',
                  name: 'Background',
                  editable: true,
                  locked: false,
                  visible: true,
                  opacity: 100,
                  kind: 'rect',
                  field: 'bg',
                  geometry: { type: 'rect', x: 0, y: 0, width: 1080, height: 1080 },
                  fill: '#ff3d8b',
                  stroke: 'none',
                  strokeWidth: 0
                },
                {
                  id: 't2_txt1',
                  role: 'headline',
                  name: 'Headline',
                  editable: true,
                  locked: false,
                  visible: true,
                  opacity: 100,
                  kind: 'text',
                  elementId: 'headline1',
                  field: 'promo',
                  content: '50% OFF SALE',
                  x: 540,
                  y: 540,
                  fontFamily: 'General Sans',
                  fontSize: 120,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  fill: '#ffffff'
                }
              ]
            }
          ]
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
